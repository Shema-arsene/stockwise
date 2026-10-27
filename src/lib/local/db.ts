// On-device database (IndexedDB via Dexie). One database per shop, so switching shops or
// signing out never mixes data. The UI reads and writes here first; the sync engine moves
// changes to and from the server in the background.

import Dexie, { type EntityTable } from "dexie";
import type {
  Category,
  Customer,
  DebtPayment,
  Member,
  Product,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  ShopSettings,
  StockMovement,
  Supplier,
  SupplierPayment,
  TableName,
} from "@/lib/sync/tables";

export interface StockLevel {
  productId: string;
  qty: number;
}

export interface CustomerBalance {
  customerId: string;
  owed: number; // ngwee
  lastActivityAt: string | null;
}

export interface OutboxEntry {
  seq?: number;
  table: TableName;
  rowId: string;
  row: Record<string, unknown>;
  createdAt: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type ShopDB = Dexie & {
  categories: EntityTable<Category, "id">;
  suppliers: EntityTable<Supplier, "id">;
  customers: EntityTable<Customer, "id">;
  products: EntityTable<Product, "id">;
  stockMovements: EntityTable<StockMovement, "id">;
  sales: EntityTable<Sale, "id">;
  saleItems: EntityTable<SaleItem, "id">;
  purchases: EntityTable<Purchase, "id">;
  purchaseItems: EntityTable<PurchaseItem, "id">;
  debtPayments: EntityTable<DebtPayment, "id">;
  supplierPayments: EntityTable<SupplierPayment, "id">;
  // Derived tables, recomputed locally from the ledgers above (never synced).
  stockLevels: EntityTable<StockLevel, "productId">;
  balances: EntityTable<CustomerBalance, "customerId">;
  // Local changes waiting to be pushed, in order.
  outbox: EntityTable<OutboxEntry, "seq">;
  meta: EntityTable<MetaEntry, "key">;
};

const dbs = new Map<string, ShopDB>();

export function dbName(shopId: string) {
  return `stockwise-shop-${shopId}`;
}

export function openShopDB(shopId: string): ShopDB {
  const existing = dbs.get(shopId);
  if (existing) return existing;

  const db = new Dexie(dbName(shopId)) as ShopDB;
  db.version(1).stores({
    categories: "id, name",
    suppliers: "id, name",
    customers: "id, name",
    products: "id, name, categoryId",
    stockMovements: "id, productId, refId, createdAt",
    sales: "id, soldAt, customerId",
    saleItems: "id, saleId, productId",
    purchases: "id, purchasedAt, supplierId",
    purchaseItems: "id, purchaseId, productId",
    debtPayments: "id, customerId, paidAt",
    stockLevels: "productId",
    balances: "customerId",
    outbox: "++seq, table, rowId",
    meta: "key",
  });
  // v2: buying on credit. Purchases record how much was paid; payments to suppliers are a new ledger.
  db.version(2)
    .stores({ supplierPayments: "id, supplierId, paidAt" })
    .upgrade((tx) =>
      tx
        .table("purchases")
        .toCollection()
        .modify((p: Purchase) => {
          if (typeof p.amountPaid !== "number") p.amountPaid = p.paid ? p.total : 0;
        }),
    );
  dbs.set(shopId, db);
  return db;
}

export async function deleteShopDB(shopId: string) {
  dbs.get(shopId)?.close();
  dbs.delete(shopId);
  await Dexie.delete(dbName(shopId));
}

/** Removes every shop database on this device (used on sign-out). */
export async function deleteAllShopDBs() {
  const names = await Dexie.getDatabaseNames();
  await Promise.all(
    names.filter((n) => n.startsWith("stockwise-shop-")).map((n) => Dexie.delete(n)),
  );
  dbs.forEach((db) => db.close());
  dbs.clear();
}

// ───────────── Meta helpers ─────────────

export const META = {
  cursor: "cursor",
  shop: "shop",
  members: "members",
  role: "role",
  lastSyncedAt: "lastSyncedAt",
  deviceId: "deviceId",
  receiptCounter: "receiptCounter",
} as const;

export async function getMeta<T>(db: ShopDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(db: ShopDB, key: string, value: unknown) {
  await db.meta.put({ key, value });
}

export type { ShopSettings, Member };
