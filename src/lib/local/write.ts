import { roundQty } from "@/lib/money";
import type { RowByTable, TableName } from "@/lib/sync/tables";
import type { ShopDB } from "./db";

export type Change = { [T in TableName]: { table: T; row: RowByTable[T] } }[TableName];

const LEDGER_TABLES: TableName[] = [
  "categories",
  "suppliers",
  "customers",
  "products",
  "stockMovements",
  "sales",
  "saleItems",
  "purchases",
  "purchaseItems",
  "debtPayments",
  "supplierPayments",
];

type Listener = () => void;
const writeListeners = new Set<Listener>();

/** The sync engine subscribes so local writes are pushed promptly. */
export function onLocalWrite(listener: Listener) {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

/**
 * Saves rows locally and queues them for the server, atomically.
 * All UI writes go through here.
 */
export async function writeLocal(db: ShopDB, changes: Change[]) {
  const now = new Date().toISOString();
  await db.transaction("rw", [...LEDGER_TABLES.map((t) => db.table(t)), db.outbox, db.stockLevels, db.balances], async () => {
    for (const c of changes) {
      await db.table(c.table).put(c.row);
      await db.outbox.add({ table: c.table, rowId: c.row.id, row: c.row as unknown as Record<string, unknown>, createdAt: now });
    }
    await refreshDerived(db, changes);
  });
  writeListeners.forEach((l) => l());
}

/** Recomputes stock levels / customer balances touched by these rows. */
export async function refreshDerived(db: ShopDB, changes: Change[]) {
  const productIds = new Set<string>();
  const customerIds = new Set<string>();
  const saleIds = new Set<string>();

  for (const c of changes) {
    if (c.table === "stockMovements") productIds.add(c.row.productId);
    if (c.table === "products") productIds.add(c.row.id);
    if (c.table === "sales" && c.row.customerId) customerIds.add(c.row.customerId);
    if (c.table === "debtPayments") customerIds.add(c.row.customerId);
    if (c.table === "customers") customerIds.add(c.row.id);
    if (c.table === "sales") saleIds.add(c.row.id);
  }
  // A sale can move to a different customer only via void + re-sale, but its customer
  // may have been unknown when the row arrived; look it up to be safe.
  for (const id of saleIds) {
    const sale = await db.sales.get(id);
    if (sale?.customerId) customerIds.add(sale.customerId);
  }

  for (const productId of productIds) {
    const moves = await db.stockMovements.where("productId").equals(productId).toArray();
    const qty = roundQty(moves.reduce((sum, m) => (m.deletedAt ? sum : sum + m.qty), 0));
    await db.stockLevels.put({ productId, qty });
  }

  for (const customerId of customerIds) {
    const [sales, payments] = await Promise.all([
      db.sales.where("customerId").equals(customerId).toArray(),
      db.debtPayments.where("customerId").equals(customerId).toArray(),
    ]);
    let owed = 0;
    let last: string | null = null;
    for (const s of sales) {
      if (s.voidedAt || s.deletedAt) continue;
      owed += s.total - s.amountPaid;
      if (!last || s.soldAt > last) last = s.soldAt;
    }
    for (const p of payments) {
      if (p.voidedAt || p.deletedAt) continue;
      owed -= p.amount;
      if (!last || p.paidAt > last) last = p.paidAt;
    }
    await db.balances.put({ customerId, owed, lastActivityAt: last });
  }
}

/** Rebuilds every derived row (after first download or a repair). */
export async function rebuildAllDerived(db: ShopDB) {
  await db.transaction("rw", [...LEDGER_TABLES.map((t) => db.table(t)), db.stockLevels, db.balances], async () => {
    await db.stockLevels.clear();
    await db.balances.clear();
    const [products, customers] = await Promise.all([db.products.toArray(), db.customers.toArray()]);
    await refreshDerived(db, [
      ...products.map((row) => ({ table: "products" as const, row })),
      ...customers.map((row) => ({ table: "customers" as const, row })),
    ]);
  });
}
