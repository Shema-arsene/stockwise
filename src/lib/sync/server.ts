import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { can, type Permission } from "@/lib/permissions";
import type { ShopContext } from "@/lib/api/context";
import { actorFrom, logActivities, type ActivityEntry } from "@/lib/api/activity";
import {
  TABLES,
  TABLE_ORDER,
  normalisePurchase,
  type PullResult,
  type PushMutation,
  type PushResult,
  type TableName,
} from "./tables";

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown> & { id: string; updatedAt: string };

// ───────────── Row conversion (wire JSON <-> database) ─────────────

const MONEY: Partial<Record<TableName, string[]>> = {
  products: ["costPrice", "sellPrice"],
  sales: ["subtotal", "vatAmount", "total", "amountPaid", "costTotal"],
  saleItems: ["unitPrice", "unitCost", "vatAmount", "lineTotal"],
  purchases: ["total", "amountPaid"],
  purchaseItems: ["unitCost", "lineTotal"],
  debtPayments: ["amount"],
  supplierPayments: ["amount"],
};
const DECIMAL: Partial<Record<TableName, string[]>> = {
  products: ["reorderLevel"],
  stockMovements: ["qty"],
  saleItems: ["qty"],
  purchaseItems: ["qty"],
};
const DATES = ["createdAt", "updatedAt", "deletedAt", "soldAt", "voidedAt", "purchasedAt", "paidAt"];
/** Fields a cashier must not see (cost prices, profit). */
const COST_FIELDS: Partial<Record<TableName, string[]>> = {
  products: ["costPrice"],
  sales: ["costTotal"],
  saleItems: ["unitCost"],
  purchases: ["total", "amountPaid"],
  purchaseItems: ["unitCost", "lineTotal"],
  supplierPayments: ["amount"],
};

function toDb(table: TableName, row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const f of MONEY[table] ?? []) if (out[f] != null) out[f] = BigInt(out[f] as number);
  for (const f of DATES) if (typeof out[f] === "string") out[f] = new Date(out[f] as string);
  return out;
}

function fromDb(table: TableName, row: Record<string, unknown>, hideCost: boolean) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "shopId" || k === "seq") continue;
    if (typeof v === "bigint") out[k] = Number(v);
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  for (const f of DECIMAL[table] ?? []) if (out[f] != null) out[f] = Number(String(out[f]));
  if (hideCost) for (const f of COST_FIELDS[table] ?? []) if (f in out) out[f] = 0;
  return out;
}

// ───────────── Prisma delegates per table ─────────────

// The delegates share the methods we use; typing them loosely keeps the generic code readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Delegate = any;
function delegate(db: Tx | typeof prisma, table: TableName): Delegate {
  const map: Record<TableName, Delegate> = {
    categories: db.category,
    suppliers: db.supplier,
    customers: db.customer,
    products: db.product,
    sales: db.sale,
    purchases: db.purchase,
    saleItems: db.saleItem,
    purchaseItems: db.purchaseItem,
    stockMovements: db.stockMovement,
    debtPayments: db.debtPayment,
    supplierPayments: db.supplierPayment,
  };
  return map[table];
}

/** Foreign keys that must point at rows of the same shop. */
const REFS: Partial<Record<TableName, [field: string, target: TableName][]>> = {
  products: [["categoryId", "categories"]],
  stockMovements: [["productId", "products"]],
  sales: [["customerId", "customers"]],
  saleItems: [
    ["saleId", "sales"],
    ["productId", "products"],
  ],
  purchases: [["supplierId", "suppliers"]],
  purchaseItems: [
    ["purchaseId", "purchases"],
    ["productId", "products"],
  ],
  debtPayments: [["customerId", "customers"]],
  supplierPayments: [["supplierId", "suppliers"]],
};

// ───────────── Permissions ─────────────

const CREATE_PERMISSION: Record<TableName, Permission> = {
  categories: "product.manage",
  products: "product.manage",
  suppliers: "purchase.manage",
  customers: "customer.manage",
  sales: "sale.create",
  saleItems: "sale.create",
  purchases: "purchase.manage",
  purchaseItems: "purchase.manage",
  debtPayments: "debt.record",
  supplierPayments: "purchase.manage",
  stockMovements: "stock.adjust", // refined by movement type below
};

const MOVEMENT_PERMISSION: Record<string, Permission> = {
  SALE: "sale.create",
  PURCHASE: "purchase.manage",
  OPENING: "product.manage",
  ADJUSTMENT: "stock.adjust",
  VOID: "sale.void",
};

const DELETE_PERMISSION: Partial<Record<TableName, Permission>> = {
  categories: "product.manage",
  products: "product.manage",
  suppliers: "purchase.manage",
  customers: "sale.void",
};

function createPermission(table: TableName, row: Row): Permission {
  if (table === "stockMovements") return MOVEMENT_PERMISSION[row.type as string] ?? "stock.adjust";
  return CREATE_PERMISSION[table];
}

// ───────────── Sequence numbers ─────────────

/**
 * Reserves `count` change numbers for the shop and returns the first one.
 * The UPDATE locks the shop row until the transaction commits, so writes to one shop are
 * serialised and a puller can never see seq N+1 committed before seq N.
 */
export async function reserveSeq(tx: Tx, shopId: string, count: number): Promise<number> {
  const rows = await tx.$queryRaw<{ seq: bigint }[]>`
    UPDATE shop SET seq = seq + ${count} WHERE id = ${shopId} RETURNING seq`;
  return Number(rows[0].seq) - count + 1;
}

// ───────────── Activity log entries for pushed rows ─────────────

const money = (v: unknown) => (typeof v === "number" ? v : undefined);
const ENTITY: Partial<Record<TableName, string>> = { products: "product", categories: "category", customers: "customer", suppliers: "supplier" };

/** One log line per meaningful action. Sale lines and the stock movements a sale or purchase
 *  creates are part of that sale/purchase, so they are not logged separately. */
function describe(table: TableName, row: Row, kind: "create" | "update" | "void"): Omit<ActivityEntry, "businessId" | "shopId" | "deviceId"> | null {
  const base = { entityId: row.id, clientAt: new Date(row.updatedAt) };
  switch (table) {
    case "sales":
      return kind === "void"
        ? { ...base, action: "sale.void", entity: "sale", summary: { number: row.number as string, total: money(row.total) } }
        : {
            ...base,
            action: "sale.create",
            entity: "sale",
            summary: { number: row.number as string, total: money(row.total), paymentType: row.paymentType as string, customerId: (row.customerId as string) ?? null },
          };
    case "purchases": {
      const owed = typeof row.total === "number" && typeof row.amountPaid === "number" ? row.total - row.amountPaid : 0;
      return {
        ...base,
        action: kind === "void" ? "purchase.void" : owed > 0 ? "purchase.create_credit" : "purchase.create",
        entity: "purchase",
        summary: { total: money(row.total), amountPaid: money(row.amountPaid), owed: owed > 0 ? owed : undefined, supplierId: (row.supplierId as string) ?? null },
      };
    }
    case "supplierPayments":
      return {
        ...base,
        action: kind === "void" ? "purchase.void_supplier_payment" : "purchase.pay_supplier",
        entity: "supplier",
        entityId: row.supplierId as string,
        summary: { amount: money(row.amount), method: row.method as string, paymentId: row.id },
      };
    case "debtPayments":
      return {
        ...base,
        action: kind === "void" ? "payment.void" : "payment.record",
        entity: "customer",
        entityId: row.customerId as string,
        summary: { amount: money(row.amount), method: row.method as string, paymentId: row.id },
      };
    case "stockMovements":
      if (row.type !== "ADJUSTMENT" && row.type !== "OPENING") return null;
      return {
        ...base,
        action: row.type === "OPENING" ? "stock.opening" : "stock.adjust",
        entity: "product",
        entityId: row.productId as string,
        summary: { qty: row.qty as number, note: (row.note as string) ?? null },
      };
    case "products":
    case "categories":
    case "customers":
    case "suppliers": {
      const entity = ENTITY[table]!;
      const verb = row.deletedAt ? "delete" : kind === "create" ? "create" : "update";
      const summary: Record<string, string | number | undefined> = { name: row.name as string };
      if (table === "products") Object.assign(summary, { sellPrice: money(row.sellPrice), costPrice: money(row.costPrice) });
      return { ...base, action: `${entity}.${verb}`, entity, summary: summary as Prisma.InputJsonObject };
    }
    default:
      return null;
  }
}

// ───────────── Push ─────────────

export async function applyPush(ctx: ShopContext, mutations: PushMutation[], deviceId?: string): Promise<PushResult> {
  const rejected: PushResult["rejected"] = [];
  const byTable = new Map<TableName, Map<string, Row>>();

  // 1. Validate shape + permission. Keep only the newest version of each row.
  for (const m of mutations) {
    const parsed = TABLES[m.table].schema.safeParse(m.table === "purchases" ? normalisePurchase(m.row) : m.row);
    const rowId = typeof m.row.id === "string" ? m.row.id : "?";
    if (!parsed.success) {
      rejected.push({ table: m.table, id: rowId, reason: "invalid" });
      continue;
    }
    const row = parsed.data as Row;
    // A disabled/removed person may only upload what they recorded before losing access.
    if (ctx.cutoff && new Date(row.updatedAt) >= ctx.cutoff) {
      rejected.push({ table: m.table, id: row.id, reason: "removed" });
      continue;
    }
    if (!can(ctx.role, createPermission(m.table, row))) {
      rejected.push({ table: m.table, id: row.id, reason: "forbidden" });
      continue;
    }
    // Ledger/voidable rows are attributed to the person who pushed them.
    if ("userId" in row) row.userId = ctx.user.id;
    const group = byTable.get(m.table) ?? new Map<string, Row>();
    const prev = group.get(row.id);
    if (!prev || prev.updatedAt <= row.updatedAt) group.set(row.id, row);
    byTable.set(m.table, group);
  }

  const total = [...byTable.values()].reduce((n, g) => n + g.size, 0);
  if (total === 0) return { applied: 0, rejected };

  let applied = 0;
  await prisma.$transaction(
    async (tx) => {
      // Rows + one extra per sale whose cost total we recompute.
      let nextSeq = await reserveSeq(tx, ctx.shopId, total * 2);
      const touchedSales = new Set<string>();
      const activity: ActivityEntry[] = [];
      const record = (table: TableName, row: Row, kind: "create" | "update" | "void") => {
        const e = describe(table, row, kind);
        if (!e) return;
        const summary = ctx.cutoff ? ({ ...(e.summary as object), afterRemoval: true } as Prisma.InputJsonObject) : e.summary;
        activity.push({ ...e, summary, businessId: ctx.businessId, shopId: ctx.shopId, deviceId });
      };

      for (const table of TABLE_ORDER) {
        const group = byTable.get(table);
        if (!group?.size) continue;
        const { mode } = TABLES[table];
        const db = delegate(tx, table);
        let rows = [...group.values()];

        // 2. Cross-shop reference check: every foreign id must belong to this shop.
        for (const [field, target] of REFS[table] ?? []) {
          const ids = [...new Set(rows.map((r) => r[field]).filter((v): v is string => typeof v === "string"))];
          if (!ids.length) continue;
          const found = await delegate(tx, target).findMany({
            where: { id: { in: ids }, shopId: ctx.shopId },
            select: { id: true },
          });
          const ok = new Set(found.map((f: { id: string }) => f.id));
          rows = rows.filter((r) => {
            const ref = r[field];
            if (typeof ref !== "string" || ok.has(ref)) return true;
            rejected.push({ table, id: r.id, reason: `missing_${field}` });
            return false;
          });
        }

        // 3. Split into new rows and updates of existing rows.
        const existing: { id: string; shopId: string; updatedAt: Date; voidedAt?: Date | null; deletedAt?: Date | null }[] =
          await db.findMany({
            where: { id: { in: rows.map((r) => r.id) } },
            select: {
              id: true,
              shopId: true,
              updatedAt: true,
              deletedAt: true,
              ...(mode === "voidable" ? { voidedAt: true } : {}),
            },
          });
        const existingById = new Map(existing.map((e) => [e.id, e]));

        const creates: Record<string, unknown>[] = [];
        for (const row of rows) {
          const ex = existingById.get(row.id);
          if (ex && ex.shopId !== ctx.shopId) {
            rejected.push({ table, id: row.id, reason: "conflict" });
            continue;
          }
          if (!ex) {
            if (row.deletedAt && !can(ctx.role, DELETE_PERMISSION[table] ?? "sale.void")) {
              rejected.push({ table, id: row.id, reason: "forbidden" });
              continue;
            }
            creates.push({ ...toDb(table, row), shopId: ctx.shopId, seq: BigInt(nextSeq++) });
            record(table, row, "create");
            continue;
          }

          if (mode === "mutable") {
            if (new Date(row.updatedAt) <= ex.updatedAt) continue; // server copy is newer
            if (row.deletedAt && !ex.deletedAt && !can(ctx.role, DELETE_PERMISSION[table] ?? "sale.void")) {
              rejected.push({ table, id: row.id, reason: "forbidden" });
              continue;
            }
            const data = toDb(table, row);
            delete data.id;
            await db.update({ where: { id: row.id }, data: { ...data, seq: BigInt(nextSeq++) } });
            record(table, row, "update");
            applied++;
          } else if (mode === "voidable" && row.voidedAt && !ex.voidedAt) {
            if (!can(ctx.role, "sale.void")) {
              rejected.push({ table, id: row.id, reason: "forbidden" });
              continue;
            }
            await db.update({
              where: { id: row.id },
              data: { voidedAt: new Date(row.voidedAt as string), updatedAt: new Date(row.updatedAt), seq: BigInt(nextSeq++) },
            });
            record(table, row, "void");
            applied++;
          }
          // append rows (and voidable rows without a new void) are already stored: nothing to do.
        }

        if (creates.length) {
          // Cost snapshots are server-authoritative: cashiers never receive cost prices.
          if (table === "saleItems") {
            const productIds = [...new Set(creates.map((c) => c.productId as string))];
            const products = await tx.product.findMany({
              where: { id: { in: productIds } },
              select: { id: true, costPrice: true },
            });
            const cost = new Map(products.map((p) => [p.id, p.costPrice]));
            for (const c of creates) {
              c.unitCost = cost.get(c.productId as string) ?? BigInt(0);
              touchedSales.add(c.saleId as string);
            }
          }
          const res = await db.createMany({ data: creates, skipDuplicates: true });
          applied += res.count;
        }
      }

      // 4. Recompute cost totals for sales whose items arrived in this push.
      for (const saleId of touchedSales) {
        await tx.$executeRaw`
          UPDATE sale SET "costTotal" = COALESCE((
            SELECT SUM(ROUND(qty * "unitCost")) FROM sale_item WHERE "saleId" = ${saleId}
          ), 0)::bigint, seq = ${BigInt(nextSeq++)}
          WHERE id = ${saleId} AND "shopId" = ${ctx.shopId}`;
      }

      // 5. Activity log, in the same transaction so data and history never disagree.
      // Stock entries carry the product name so the log reads well even if the product is renamed later.
      const stockProductIds = [...new Set(activity.filter((a) => a.action.startsWith("stock.")).map((a) => a.entityId!))];
      if (stockProductIds.length) {
        const names = new Map((await tx.product.findMany({ where: { id: { in: stockProductIds } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
        for (const a of activity) {
          if (a.action.startsWith("stock.")) a.summary = { ...(a.summary as object), product: names.get(a.entityId!) ?? null } as Prisma.InputJsonObject;
        }
      }
      // Purchases and supplier payments carry the supplier's name for the same reason.
      const supplierIds = [
        ...new Set(activity.map((a) => (a.action.startsWith("purchase.") ? ((a.summary as { supplierId?: string }).supplierId ?? (a.entity === "supplier" ? a.entityId : null)) : null)).filter((v): v is string => !!v)),
      ];
      if (supplierIds.length) {
        const names = new Map((await tx.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
        for (const a of activity) {
          if (!a.action.startsWith("purchase.")) continue;
          const sid = (a.summary as { supplierId?: string }).supplierId ?? (a.entity === "supplier" ? a.entityId : null);
          if (sid && names.has(sid)) a.summary = { ...(a.summary as object), name: names.get(sid) } as Prisma.InputJsonObject;
        }
      }
      if (ctx.cutoff && activity.length) {
        activity.push({
          action: "sync.after_removal",
          businessId: ctx.businessId,
          shopId: ctx.shopId,
          deviceId,
          summary: { rows: activity.length, accessEndedAt: ctx.cutoff.toISOString() },
        });
      }
      await logActivities(actorFrom(ctx.user, ctx.role), activity, tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return { applied, rejected };
}

// ───────────── Pull ─────────────

const PAGE_SPAN = 2000;

export async function buildPull(ctx: ShopContext, since: number): Promise<PullResult> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId }, include: { business: true } });
  const head = Number(shop.seq);
  const upto = Math.min(since + PAGE_SPAN, head);
  const hideCost = !can(ctx.role, "cost.view");

  const changes: PullResult["changes"] = {};
  if (upto > since) {
    const results = await Promise.all(
      TABLE_ORDER.map((table) =>
        delegate(prisma, table).findMany({
          where: { shopId: ctx.shopId, seq: { gt: BigInt(since), lte: BigInt(upto) } },
          orderBy: { seq: "asc" },
        }),
      ),
    );
    TABLE_ORDER.forEach((table, i) => {
      if (results[i].length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (changes as any)[table] = results[i].map((r: Record<string, unknown>) => fromDb(table, r, hideCost));
      }
    });
  }

  const [owner, memberships] = await Promise.all([
    prisma.businessMember.findFirst({
      where: { businessId: ctx.businessId, role: "OWNER" },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.membership.findMany({
      where: { shopId: ctx.shopId, deletedAt: null },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    cursor: Math.max(since, upto),
    hasMore: upto < head,
    changes,
    role: ctx.role,
    shop: {
      id: shop.id,
      name: shop.name,
      phone: shop.phone,
      address: shop.address,
      currency: shop.currency,
      locale: shop.locale,
      vatEnabled: shop.vatEnabled,
      vatRate: shop.vatRate,
      tpin: shop.tpin,
      businessId: shop.businessId,
      businessName: shop.business.name,
      plan: shop.business.plan,
      trialEndsAt: shop.business.trialEndsAt?.toISOString() ?? null,
    },
    // Names for "served by" labels: the business owner plus everyone assigned to this shop.
    members: [
      ...(owner ? [{ id: owner.id, userId: owner.userId, name: owner.user.name, email: owner.user.email, role: "OWNER" as const }] : []),
      ...memberships.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role })),
    ],
  };
}
