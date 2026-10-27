// Shared description of every synced table, used by both the device (Dexie) and the server.
// Rows travel as plain JSON: money in integer ngwee, quantities as numbers, dates as ISO strings.

import { z } from "zod";

const id = z.uuid();
const iso = z.iso.datetime({ offset: true });
const ngwee = z.number().int().safe();
const qty = z.number().finite().refine((n) => Math.abs(n) < 1e11, "qty too large");
const text = (max: number) => z.string().trim().max(max);

const base = {
  id,
  createdAt: iso,
  updatedAt: iso,
  deletedAt: iso.nullable().default(null),
};

export const categorySchema = z.object({ ...base, name: text(80).min(1) });

export const productSchema = z.object({
  ...base,
  categoryId: id.nullable().default(null),
  name: text(120).min(1),
  sku: text(64).nullable().default(null),
  unit: text(16).min(1),
  costPrice: ngwee.nonnegative(),
  sellPrice: ngwee.nonnegative(),
  reorderLevel: qty.nonnegative(),
  vatApplicable: z.boolean(),
});

export const customerSchema = z.object({
  ...base,
  name: text(120).min(1),
  phone: text(32).nullable().default(null),
  address: text(200).nullable().default(null),
  note: text(500).nullable().default(null),
});

export const supplierSchema = z.object({
  ...base,
  name: text(120).min(1),
  phone: text(32).nullable().default(null),
  address: text(200).nullable().default(null),
});

export const movementTypes = ["OPENING", "PURCHASE", "SALE", "ADJUSTMENT", "VOID"] as const;
export const stockMovementSchema = z.object({
  ...base,
  productId: id,
  qty: qty.refine((n) => n !== 0, "qty cannot be zero"),
  type: z.enum(movementTypes),
  refId: id.nullable().default(null),
  note: text(200).nullable().default(null),
  userId: z.string(),
});

export const paymentTypes = ["CASH", "MOBILE_MONEY", "CREDIT"] as const;
export const saleSchema = z.object({
  ...base,
  number: text(32).min(1),
  customerId: id.nullable().default(null),
  paymentType: z.enum(paymentTypes),
  subtotal: ngwee.nonnegative(),
  vatAmount: ngwee.nonnegative(),
  total: ngwee.nonnegative(),
  amountPaid: ngwee.nonnegative(),
  costTotal: ngwee.nonnegative().default(0),
  note: text(500).nullable().default(null),
  userId: z.string(),
  soldAt: iso,
  voidedAt: iso.nullable().default(null),
});

export const saleItemSchema = z.object({
  ...base,
  saleId: id,
  productId: id,
  qty: qty.positive(),
  unitPrice: ngwee.nonnegative(),
  unitCost: ngwee.nonnegative().default(0),
  vatAmount: ngwee.nonnegative(),
  lineTotal: ngwee.nonnegative(),
});

export const purchaseSchema = z.object({
  ...base,
  supplierId: id.nullable().default(null),
  total: ngwee.nonnegative(),
  /** Paid when buying; the rest (total − amountPaid) is owed to the supplier. */
  amountPaid: ngwee.nonnegative(),
  /** amountPaid >= total. Kept so older app versions keep working. */
  paid: z.boolean(),
  note: text(500).nullable().default(null),
  userId: z.string(),
  purchasedAt: iso,
  voidedAt: iso.nullable().default(null),
});

/** Accepts purchases from app versions that only sent `paid`, and keeps both fields consistent. */
export function normalisePurchase(row: Record<string, unknown>): Record<string, unknown> {
  const total = typeof row.total === "number" ? row.total : 0;
  const amountPaid = typeof row.amountPaid === "number" ? Math.min(Math.max(row.amountPaid, 0), total) : row.paid === false ? 0 : total;
  return { ...row, amountPaid, paid: amountPaid >= total };
}

export const purchaseItemSchema = z.object({
  ...base,
  purchaseId: id,
  productId: id,
  qty: qty.positive(),
  unitCost: ngwee.nonnegative(),
  lineTotal: ngwee.nonnegative(),
});

export const debtPaymentSchema = z.object({
  ...base,
  customerId: id,
  amount: ngwee.positive(),
  method: z.enum(["CASH", "MOBILE_MONEY"]),
  note: text(500).nullable().default(null),
  userId: z.string(),
  paidAt: iso,
  voidedAt: iso.nullable().default(null),
});

export const supplierPaymentSchema = z.object({
  ...base,
  supplierId: id,
  amount: ngwee.positive(),
  method: z.enum(["CASH", "MOBILE_MONEY"]),
  note: text(500).nullable().default(null),
  userId: z.string(),
  paidAt: iso,
  voidedAt: iso.nullable().default(null),
});

/**
 * How the server merges a pushed row:
 * - mutable:  upsert, last write (by updatedAt) wins; delete = set deletedAt
 * - append:   insert once, never changed (ledger rows)
 * - voidable: insert once; afterwards only `voidedAt` may be set
 */
export type WriteMode = "mutable" | "append" | "voidable";

export const TABLES = {
  categories: { schema: categorySchema, mode: "mutable" },
  suppliers: { schema: supplierSchema, mode: "mutable" },
  customers: { schema: customerSchema, mode: "mutable" },
  products: { schema: productSchema, mode: "mutable" },
  sales: { schema: saleSchema, mode: "voidable" },
  purchases: { schema: purchaseSchema, mode: "voidable" },
  saleItems: { schema: saleItemSchema, mode: "append" },
  purchaseItems: { schema: purchaseItemSchema, mode: "append" },
  stockMovements: { schema: stockMovementSchema, mode: "append" },
  debtPayments: { schema: debtPaymentSchema, mode: "voidable" },
  supplierPayments: { schema: supplierPaymentSchema, mode: "voidable" },
} as const satisfies Record<string, { schema: z.ZodTypeAny; mode: WriteMode }>;

export type TableName = keyof typeof TABLES;
/** Server applies tables in this order so parents exist before children. */
export const TABLE_ORDER = Object.keys(TABLES) as TableName[];

export type Category = z.infer<typeof categorySchema>;
export type Product = z.infer<typeof productSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type Sale = z.infer<typeof saleSchema>;
export type SaleItem = z.infer<typeof saleItemSchema>;
export type Purchase = z.infer<typeof purchaseSchema>;
export type PurchaseItem = z.infer<typeof purchaseItemSchema>;
export type DebtPayment = z.infer<typeof debtPaymentSchema>;
export type SupplierPayment = z.infer<typeof supplierPaymentSchema>;

export interface RowByTable {
  categories: Category;
  suppliers: Supplier;
  customers: Customer;
  products: Product;
  sales: Sale;
  purchases: Purchase;
  saleItems: SaleItem;
  purchaseItems: PurchaseItem;
  stockMovements: StockMovement;
  debtPayments: DebtPayment;
  supplierPayments: SupplierPayment;
}

// ───────────── Wire protocol ─────────────

export const pushMutationSchema = z.object({
  table: z.enum(TABLE_ORDER as [TableName, ...TableName[]]),
  row: z.record(z.string(), z.unknown()),
});
export const pushBodySchema = z.object({
  deviceId: z.string().max(64),
  mutations: z.array(pushMutationSchema).max(500),
});
export type PushMutation = z.infer<typeof pushMutationSchema>;

export interface PushResult {
  applied: number;
  rejected: { table: TableName; id: string; reason: string }[];
}

export interface ShopSettings {
  id: string;
  businessId: string;
  businessName: string;
  name: string;
  phone: string | null;
  address: string | null;
  currency: string;
  locale: string;
  vatEnabled: boolean;
  vatRate: number;
  tpin: string | null;
  plan: string;
  trialEndsAt: string | null;
}

export interface Member {
  id: string; // membership id
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "CASHIER";
}

export interface PullResult {
  cursor: number;
  hasMore: boolean;
  changes: Partial<{ [T in TableName]: RowByTable[T][] }>;
  shop: ShopSettings;
  members: Member[];
  role: "OWNER" | "MANAGER" | "CASHIER";
}
