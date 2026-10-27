import "server-only";
import { prisma } from "@/lib/db/prisma";

// Figures for generated reports (PDF / Excel), computed in the database for a set of branches
// (`shop` rows) over a period. Money is integer ngwee; voided and deleted rows never count.

export interface ReportUnit {
  /** Branch (shop row) id, or business id when grouping a platform report by shop. */
  id: string;
  name: string;
  /** Owner name (platform reports). */
  owner?: string | null;
  shopIds: string[];
}

export interface UnitRow {
  name: string;
  owner?: string | null;
  count: number;
  revenue: number;
  profit: number;
  creditGiven: number;
  debtOutstanding: number;
  stockValue: number;
}

export interface ReportData {
  title: string; // scope label, e.g. "Mwila General Dealers — all branches"
  unitKind: "branch" | "shop";
  from: Date | null;
  to: Date | null;
  generatedAt: Date;
  generatedBy: string;
  summary: {
    count: number;
    voided: number;
    revenue: number;
    vat: number;
    netSales: number;
    cogs: number;
    grossProfit: number;
    margin: number; // 0..1
    purchases: number;
    creditGiven: number;
    debtCollected: number;
    debtOutstanding: number;
    stockValue: number;
    boughtOnCredit: number;
    suppliersPaid: number;
    payableOutstanding: number;
  };
  byPayment: { CASH: number; MOBILE_MONEY: number; CREDIT: number };
  units: UnitRow[];
  daily: { day: string; count: number; revenue: number; profit: number }[];
  topProducts: { name: string; branch: string; qty: number; revenue: number; profit: number }[];
  debtors: { name: string; branch: string; phone: string | null; address: string | null; owed: number }[];
  creditors: { name: string; branch: string; phone: string | null; address: string | null; owed: number }[];
  lowStock: { name: string; branch: string; stock: number; reorderLevel: number }[];
}

const n = (v: bigint | number | string | null | undefined) => Number(v ?? 0);
/** Timestamps are stored as UTC without zone; compare with UTC wall-clock strings. */
const utc = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

export async function buildReport(input: {
  title: string;
  unitKind: "branch" | "shop";
  units: ReportUnit[];
  from: Date | null;
  to: Date | null;
  tz: string;
  generatedBy: string;
  /** Platform-wide reports skip per-customer and per-product detail lists. */
  detailLists: boolean;
}): Promise<ReportData> {
  const shopIds = input.units.flatMap((u) => u.shopIds);
  const unitOf = new Map(input.units.flatMap((u) => u.shopIds.map((s) => [s, u.id] as const)));
  const branchNames = new Map(
    (await prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]),
  );
  const from = input.from ? utc(input.from) : "1970-01-01 00:00:00";
  const to = input.to ? utc(input.to) : "9999-12-31 00:00:00";

  const [sales, purchases, payments, outstandingCredit, outstandingPaid, stock, daily, supplierPaid, payables] = await Promise.all([
    prisma.$queryRaw<{ shopId: string; paymentType: string; count: bigint; voided: bigint; total: bigint; vat: bigint; subtotal: bigint; cost: bigint; credit: bigint }[]>`
      SELECT "shopId", "paymentType"::text AS "paymentType",
        COUNT(*) FILTER (WHERE "voidedAt" IS NULL) AS count,
        COUNT(*) FILTER (WHERE "voidedAt" IS NOT NULL) AS voided,
        COALESCE(SUM(total) FILTER (WHERE "voidedAt" IS NULL), 0) AS total,
        COALESCE(SUM("vatAmount") FILTER (WHERE "voidedAt" IS NULL), 0) AS vat,
        COALESCE(SUM(subtotal) FILTER (WHERE "voidedAt" IS NULL), 0) AS subtotal,
        COALESCE(SUM("costTotal") FILTER (WHERE "voidedAt" IS NULL), 0) AS cost,
        COALESCE(SUM(total - "amountPaid") FILTER (WHERE "voidedAt" IS NULL AND "paymentType" = 'CREDIT'), 0) AS credit
      FROM sale
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "deletedAt" IS NULL
        AND "soldAt" >= ${from}::timestamp AND "soldAt" < ${to}::timestamp
      GROUP BY "shopId", "paymentType"`,
    prisma.$queryRaw<{ shopId: string; total: bigint; credit: bigint }[]>`
      SELECT "shopId", COALESCE(SUM(total), 0) AS total, COALESCE(SUM(total - "amountPaid"), 0) AS credit FROM purchase
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL
        AND "purchasedAt" >= ${from}::timestamp AND "purchasedAt" < ${to}::timestamp
      GROUP BY "shopId"`,
    prisma.$queryRaw<{ shopId: string; total: bigint }[]>`
      SELECT "shopId", COALESCE(SUM(amount), 0) AS total FROM debt_payment
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL
        AND "paidAt" >= ${from}::timestamp AND "paidAt" < ${to}::timestamp
      GROUP BY "shopId"`,
    // Outstanding debt is "as of now", whatever the period.
    prisma.$queryRaw<{ shopId: string; total: bigint }[]>`
      SELECT "shopId", COALESCE(SUM(total - "amountPaid"), 0) AS total FROM sale
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "paymentType" = 'CREDIT' AND "voidedAt" IS NULL AND "deletedAt" IS NULL
      GROUP BY "shopId"`,
    prisma.$queryRaw<{ shopId: string; total: bigint }[]>`
      SELECT "shopId", COALESCE(SUM(amount), 0) AS total FROM debt_payment
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL
      GROUP BY "shopId"`,
    prisma.$queryRaw<{ shopId: string; value: string }[]>`
      SELECT p."shopId", COALESCE(SUM(GREATEST(m.qty, 0) * p."costPrice"), 0)::text AS value
      FROM product p
      JOIN (SELECT "productId", SUM(qty) AS qty FROM stock_movement WHERE "shopId" = ANY(${shopIds}::text[]) AND "deletedAt" IS NULL GROUP BY "productId") m
        ON m."productId" = p.id
      WHERE p."shopId" = ANY(${shopIds}::text[]) AND p."deletedAt" IS NULL
      GROUP BY p."shopId"`,
    prisma.$queryRaw<{ day: string; count: bigint; total: bigint; profit: bigint }[]>`
      SELECT to_char(("soldAt" AT TIME ZONE 'UTC') AT TIME ZONE ${input.tz}, 'YYYY-MM-DD') AS day,
        COUNT(*) AS count, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(subtotal - "costTotal"), 0) AS profit
      FROM sale
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL
        AND "soldAt" >= ${from}::timestamp AND "soldAt" < ${to}::timestamp
      GROUP BY day ORDER BY day`,
    prisma.$queryRaw<{ shopId: string; total: bigint }[]>`
      SELECT "shopId", COALESCE(SUM(amount), 0) AS total FROM supplier_payment
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL
        AND "paidAt" >= ${from}::timestamp AND "paidAt" < ${to}::timestamp
      GROUP BY "shopId"`,
    // What the shop owes suppliers today: unpaid parts of purchases minus payments made since.
    prisma.$queryRaw<{ shopId: string; total: bigint }[]>`
      SELECT "shopId", SUM(total)::bigint AS total FROM (
        SELECT "shopId", total - "amountPaid" AS total FROM purchase
          WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL AND total > "amountPaid"
        UNION ALL
        SELECT "shopId", -amount FROM supplier_payment
          WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL
      ) x GROUP BY "shopId"`,
  ]);

  const [topProducts, debtors, lowStock, creditors] = input.detailLists
    ? await Promise.all([
        prisma.$queryRaw<{ name: string; shopId: string; qty: string; revenue: string; profit: string }[]>`
          SELECT p.name, p."shopId", SUM(si.qty)::text AS qty,
            SUM(ROUND(si.qty * si."unitPrice"))::text AS revenue,
            SUM(ROUND(si.qty * (si."unitPrice" - si."unitCost")))::text AS profit
          FROM sale_item si
          JOIN sale s ON s.id = si."saleId"
          JOIN product p ON p.id = si."productId"
          WHERE s."shopId" = ANY(${shopIds}::text[]) AND s."voidedAt" IS NULL AND s."deletedAt" IS NULL
            AND s."soldAt" >= ${from}::timestamp AND s."soldAt" < ${to}::timestamp
          GROUP BY p.id, p.name, p."shopId"
          ORDER BY SUM(ROUND(si.qty * si."unitPrice")) DESC
          LIMIT 20`,
        prisma.$queryRaw<{ name: string; shopId: string; phone: string | null; address: string | null; owed: bigint }[]>`
          SELECT c.name, c."shopId", c.phone, c.address,
            (COALESCE(cr.total, 0) - COALESCE(pd.total, 0))::bigint AS owed
          FROM customer c
          LEFT JOIN (SELECT "customerId", SUM(total - "amountPaid") AS total FROM sale
                     WHERE "paymentType" = 'CREDIT' AND "voidedAt" IS NULL AND "deletedAt" IS NULL GROUP BY "customerId") cr ON cr."customerId" = c.id
          LEFT JOIN (SELECT "customerId", SUM(amount) AS total FROM debt_payment
                     WHERE "voidedAt" IS NULL AND "deletedAt" IS NULL GROUP BY "customerId") pd ON pd."customerId" = c.id
          WHERE c."shopId" = ANY(${shopIds}::text[]) AND c."deletedAt" IS NULL
            AND COALESCE(cr.total, 0) - COALESCE(pd.total, 0) > 0
          ORDER BY owed DESC
          LIMIT 20`,
        prisma.$queryRaw<{ name: string; shopId: string; stock: string; reorder: string }[]>`
          SELECT p.name, p."shopId", COALESCE(m.qty, 0)::text AS stock, p."reorderLevel"::text AS reorder
          FROM product p
          LEFT JOIN (SELECT "productId", SUM(qty) AS qty FROM stock_movement WHERE "shopId" = ANY(${shopIds}::text[]) AND "deletedAt" IS NULL GROUP BY "productId") m
            ON m."productId" = p.id
          WHERE p."shopId" = ANY(${shopIds}::text[]) AND p."deletedAt" IS NULL
            AND (COALESCE(m.qty, 0) <= 0 OR (p."reorderLevel" > 0 AND COALESCE(m.qty, 0) <= p."reorderLevel"))
          ORDER BY COALESCE(m.qty, 0) ASC
          LIMIT 30`,
        prisma.$queryRaw<{ name: string; shopId: string; phone: string | null; address: string | null; owed: bigint }[]>`
          SELECT s.name, s."shopId", s.phone, s.address,
            (COALESCE(cr.total, 0) - COALESCE(pd.total, 0))::bigint AS owed
          FROM supplier s
          LEFT JOIN (SELECT "supplierId", SUM(total - "amountPaid") AS total FROM purchase
                     WHERE "voidedAt" IS NULL AND "deletedAt" IS NULL GROUP BY "supplierId") cr ON cr."supplierId" = s.id
          LEFT JOIN (SELECT "supplierId", SUM(amount) AS total FROM supplier_payment
                     WHERE "voidedAt" IS NULL AND "deletedAt" IS NULL GROUP BY "supplierId") pd ON pd."supplierId" = s.id
          WHERE s."shopId" = ANY(${shopIds}::text[])
            AND COALESCE(cr.total, 0) - COALESCE(pd.total, 0) > 0
          ORDER BY owed DESC
          LIMIT 20`,
      ])
    : [[], [], [], []];

  // Roll branch-level figures up into the report's units (branches, or shops on the platform).
  const units = new Map<string, UnitRow>(
    input.units.map((u) => [u.id, { name: u.name, owner: u.owner, count: 0, revenue: 0, profit: 0, creditGiven: 0, debtOutstanding: 0, stockValue: 0 }]),
  );
  const unit = (shopId: string) => units.get(unitOf.get(shopId)!)!;

  const summary: ReportData["summary"] = {
    count: 0, voided: 0, revenue: 0, vat: 0, netSales: 0, cogs: 0, grossProfit: 0, margin: 0,
    purchases: 0, creditGiven: 0, debtCollected: 0, debtOutstanding: 0, stockValue: 0,
    boughtOnCredit: 0, suppliersPaid: 0, payableOutstanding: 0,
  };
  const byPayment = { CASH: 0, MOBILE_MONEY: 0, CREDIT: 0 };

  for (const r of sales) {
    const u = unit(r.shopId);
    summary.count += n(r.count);
    summary.voided += n(r.voided);
    summary.revenue += n(r.total);
    summary.vat += n(r.vat);
    summary.netSales += n(r.subtotal);
    summary.cogs += n(r.cost);
    summary.creditGiven += n(r.credit);
    byPayment[r.paymentType as keyof typeof byPayment] += n(r.total);
    u.count += n(r.count);
    u.revenue += n(r.total);
    u.profit += n(r.subtotal) - n(r.cost);
    u.creditGiven += n(r.credit);
  }
  for (const r of purchases) {
    summary.purchases += n(r.total);
    summary.boughtOnCredit += n(r.credit);
  }
  for (const r of supplierPaid) summary.suppliersPaid += n(r.total);
  for (const r of payables) summary.payableOutstanding += n(r.total);
  for (const r of payments) summary.debtCollected += n(r.total);
  for (const r of outstandingCredit) {
    summary.debtOutstanding += n(r.total);
    unit(r.shopId).debtOutstanding += n(r.total);
  }
  for (const r of outstandingPaid) {
    summary.debtOutstanding -= n(r.total);
    unit(r.shopId).debtOutstanding -= n(r.total);
  }
  for (const r of stock) {
    const v = Math.round(Number(r.value));
    summary.stockValue += v;
    unit(r.shopId).stockValue += v;
  }
  summary.grossProfit = summary.netSales - summary.cogs;
  summary.margin = summary.netSales > 0 ? summary.grossProfit / summary.netSales : 0;

  const branch = (id: string) => branchNames.get(id) ?? "";
  return {
    title: input.title,
    unitKind: input.unitKind,
    from: input.from,
    to: input.to,
    generatedAt: new Date(),
    generatedBy: input.generatedBy,
    summary,
    byPayment,
    units: [...units.values()].sort((a, b) => b.revenue - a.revenue),
    daily: daily.map((d) => ({ day: d.day, count: n(d.count), revenue: n(d.total), profit: n(d.profit) })),
    topProducts: topProducts.map((p) => ({ name: p.name, branch: branch(p.shopId), qty: Number(p.qty), revenue: Math.round(Number(p.revenue)), profit: Math.round(Number(p.profit)) })),
    debtors: debtors.map((d) => ({ name: d.name, branch: branch(d.shopId), phone: d.phone, address: d.address, owed: n(d.owed) })),
    creditors: creditors.map((d) => ({ name: d.name, branch: branch(d.shopId), phone: d.phone, address: d.address, owed: n(d.owed) })),
    lowStock: lowStock.map((p) => ({ name: p.name, branch: branch(p.shopId), stock: Number(p.stock), reorderLevel: Number(p.reorder) })),
  };
}
