// Business operations. Each one builds the rows that describe what happened and saves them
// locally in one transaction (see writeLocal); the sync engine sends them to the server.
// They work identically online and offline.

import { newId } from "@/lib/ids";
import { lineAmount, roundQty } from "@/lib/money";
import { computeTotals } from "@/lib/vat";
import type {
  Category,
  Customer,
  DebtPayment,
  Product,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  ShopSettings,
  StockMovement,
  Supplier,
  SupplierPayment,
} from "@/lib/sync/tables";
import { META, getMeta, setMeta, type ShopDB } from "./db";
import { writeLocal, type Change } from "./write";

export interface OpContext {
  db: ShopDB;
  userId: string;
}

const now = () => new Date().toISOString();

function movement(
  ctx: OpContext,
  productId: string,
  qty: number,
  type: StockMovement["type"],
  refId: string | null,
  note: string | null,
  at: string,
): StockMovement {
  return { id: newId(), productId, qty: roundQty(qty), type, refId, note, userId: ctx.userId, createdAt: at, updatedAt: at, deletedAt: null };
}

// ───────────── Categories ─────────────

export async function saveCategory(ctx: OpContext, input: { id?: string; name: string }): Promise<Category> {
  const at = now();
  const existing = input.id ? await ctx.db.categories.get(input.id) : undefined;
  const row: Category = existing
    ? { ...existing, name: input.name.trim(), updatedAt: at }
    : { id: newId(), name: input.name.trim(), createdAt: at, updatedAt: at, deletedAt: null };
  await writeLocal(ctx.db, [{ table: "categories", row }]);
  return row;
}

// ───────────── Products ─────────────

export interface ProductInput {
  id?: string;
  name: string;
  sku: string | null;
  unit: string;
  categoryId: string | null;
  costPrice: number;
  sellPrice: number;
  reorderLevel: number;
  vatApplicable: boolean;
  openingStock?: number; // only for new products
}

export async function saveProduct(ctx: OpContext, input: ProductInput): Promise<Product> {
  const at = now();
  const existing = input.id ? await ctx.db.products.get(input.id) : undefined;
  const fields = {
    name: input.name.trim(),
    sku: input.sku?.trim() || null,
    unit: input.unit,
    categoryId: input.categoryId,
    costPrice: input.costPrice,
    sellPrice: input.sellPrice,
    reorderLevel: roundQty(input.reorderLevel),
    vatApplicable: input.vatApplicable,
  };
  const row: Product = existing
    ? { ...existing, ...fields, updatedAt: at }
    : { id: newId(), ...fields, createdAt: at, updatedAt: at, deletedAt: null };

  const changes: Change[] = [{ table: "products", row }];
  if (!existing && input.openingStock && input.openingStock > 0) {
    changes.push({ table: "stockMovements", row: movement(ctx, row.id, input.openingStock, "OPENING", null, null, at) });
  }
  await writeLocal(ctx.db, changes);
  return row;
}

export async function deleteProduct(ctx: OpContext, id: string) {
  const p = await ctx.db.products.get(id);
  if (!p) return;
  const at = now();
  await writeLocal(ctx.db, [{ table: "products", row: { ...p, deletedAt: at, updatedAt: at } }]);
}

/** Positive delta adds stock, negative removes it. */
export async function adjustStock(ctx: OpContext, productId: string, delta: number, note: string | null) {
  if (roundQty(delta) === 0) return;
  await writeLocal(ctx.db, [{ table: "stockMovements", row: movement(ctx, productId, delta, "ADJUSTMENT", null, note, now()) }]);
}

// ───────────── Sales ─────────────

export interface SaleLineInput {
  productId: string;
  qty: number;
  unitPrice: number; // ngwee, before VAT
}

export interface SaleInput {
  items: SaleLineInput[];
  paymentType: Sale["paymentType"];
  customerId: string | null;
  amountPaid?: number; // only for CREDIT; defaults to 0
  note: string | null;
}

/** Totals for a draft sale, shared by the form (live preview) and recordSale. */
export function saleTotals(items: SaleLineInput[], products: Map<string, Product>, shop: Pick<ShopSettings, "vatEnabled" | "vatRate">) {
  const amounts = items.map((i) => lineAmount(i.unitPrice, i.qty));
  const totals = computeTotals(
    items.map((i, idx) => ({ amount: amounts[idx], vatApplicable: products.get(i.productId)?.vatApplicable ?? true })),
    shop.vatEnabled,
    shop.vatRate,
  );
  return { ...totals, amounts };
}

async function nextReceiptNumber(db: ShopDB): Promise<string> {
  let deviceId = await getMeta<string>(db, META.deviceId);
  if (!deviceId) {
    deviceId = newId();
    await setMeta(db, META.deviceId, deviceId);
  }
  const counter = ((await getMeta<number>(db, META.receiptCounter)) ?? 0) + 1;
  await setMeta(db, META.receiptCounter, counter);
  // The random tail of the device id keeps numbers unique across devices working offline.
  return `${deviceId.slice(-4).toUpperCase()}-${String(counter).padStart(5, "0")}`;
}

export async function recordSale(ctx: OpContext, input: SaleInput, shop: ShopSettings): Promise<Sale> {
  if (!input.items.length) throw new Error("A sale needs at least one item");
  if (input.paymentType === "CREDIT" && !input.customerId) throw new Error("Credit sales need a customer");

  const products = new Map((await ctx.db.products.bulkGet(input.items.map((i) => i.productId))).filter(Boolean).map((p) => [p!.id, p!]));
  const { subtotal, vatAmount, total, lineVat, amounts } = saleTotals(input.items, products, shop);
  const at = now();
  const saleId = newId();
  const amountPaid = input.paymentType === "CREDIT" ? Math.min(Math.max(input.amountPaid ?? 0, 0), total) : total;

  const items: SaleItem[] = input.items.map((i, idx) => ({
    id: newId(),
    saleId,
    productId: i.productId,
    qty: roundQty(i.qty),
    unitPrice: i.unitPrice,
    unitCost: products.get(i.productId)?.costPrice ?? 0, // server re-stamps this authoritatively
    vatAmount: lineVat[idx],
    lineTotal: amounts[idx] + lineVat[idx],
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }));

  const sale: Sale = {
    id: saleId,
    number: await nextReceiptNumber(ctx.db),
    customerId: input.customerId,
    paymentType: input.paymentType,
    subtotal,
    vatAmount,
    total,
    amountPaid,
    costTotal: items.reduce((s, i) => s + lineAmount(i.unitCost, i.qty), 0),
    note: input.note,
    userId: ctx.userId,
    soldAt: at,
    voidedAt: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };

  await writeLocal(ctx.db, [
    { table: "sales", row: sale },
    ...items.map((row) => ({ table: "saleItems" as const, row })),
    ...items.map((i) => ({ table: "stockMovements" as const, row: movement(ctx, i.productId, -i.qty, "SALE", saleId, null, at) })),
  ]);
  return sale;
}

/** Cancels a sale: returns its stock and removes any debt it created. */
export async function voidSale(ctx: OpContext, saleId: string, reason: string | null) {
  const sale = await ctx.db.sales.get(saleId);
  if (!sale || sale.voidedAt) return;
  const items = await ctx.db.saleItems.where("saleId").equals(saleId).toArray();
  const at = now();
  await writeLocal(ctx.db, [
    { table: "sales", row: { ...sale, voidedAt: at, updatedAt: at } },
    ...items.map((i) => ({ table: "stockMovements" as const, row: movement(ctx, i.productId, i.qty, "VOID", saleId, reason, at) })),
  ]);
}

// ───────────── Purchases ─────────────

export interface PurchaseInput {
  supplierId: string | null;
  items: { productId: string; qty: number; unitCost: number }[];
  /** Paid when buying. Anything less than the total is bought on credit and owed to the supplier. */
  amountPaid: number;
  note: string | null;
  updateCostPrices: boolean;
}

export async function recordPurchase(ctx: OpContext, input: PurchaseInput): Promise<Purchase> {
  if (!input.items.length) throw new Error("A purchase needs at least one item");
  const at = now();
  const purchaseId = newId();
  const items: PurchaseItem[] = input.items.map((i) => ({
    id: newId(),
    purchaseId,
    productId: i.productId,
    qty: roundQty(i.qty),
    unitCost: i.unitCost,
    lineTotal: lineAmount(i.unitCost, i.qty),
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }));
  const total = items.reduce((s, i) => s + i.lineTotal, 0);
  const amountPaid = Math.min(Math.max(input.amountPaid, 0), total);
  if (amountPaid < total && !input.supplierId) throw new Error("Buying on credit needs a supplier");
  const purchase: Purchase = {
    id: purchaseId,
    supplierId: input.supplierId,
    total,
    amountPaid,
    paid: amountPaid >= total,
    note: input.note,
    userId: ctx.userId,
    purchasedAt: at,
    voidedAt: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };

  const changes: Change[] = [
    { table: "purchases", row: purchase },
    ...items.map((row) => ({ table: "purchaseItems" as const, row })),
    ...items.map((i) => ({ table: "stockMovements" as const, row: movement(ctx, i.productId, i.qty, "PURCHASE", purchaseId, null, at) })),
  ];

  if (input.updateCostPrices) {
    const products = await ctx.db.products.bulkGet(items.map((i) => i.productId));
    const latestCost = new Map(items.map((i) => [i.productId, i.unitCost]));
    for (const p of products) {
      if (p && latestCost.get(p.id) !== p.costPrice) {
        changes.push({ table: "products", row: { ...p, costPrice: latestCost.get(p.id)!, updatedAt: at } });
      }
    }
  }
  await writeLocal(ctx.db, changes);
  return purchase;
}

export async function voidPurchase(ctx: OpContext, purchaseId: string, reason: string | null) {
  const purchase = await ctx.db.purchases.get(purchaseId);
  if (!purchase || purchase.voidedAt) return;
  const items = await ctx.db.purchaseItems.where("purchaseId").equals(purchaseId).toArray();
  const at = now();
  await writeLocal(ctx.db, [
    { table: "purchases", row: { ...purchase, voidedAt: at, updatedAt: at } },
    ...items.map((i) => ({ table: "stockMovements" as const, row: movement(ctx, i.productId, -i.qty, "VOID", purchaseId, reason, at) })),
  ]);
}

// ───────────── Customers & debt ─────────────

export async function saveCustomer(
  ctx: OpContext,
  input: { id?: string; name: string; phone: string | null; address?: string | null; note: string | null },
): Promise<Customer> {
  const at = now();
  const existing = input.id ? await ctx.db.customers.get(input.id) : undefined;
  const fields = { name: input.name.trim(), phone: input.phone?.trim() || null, address: input.address?.trim() || null, note: input.note?.trim() || null };
  const row: Customer = existing
    ? { ...existing, ...fields, updatedAt: at }
    : { id: newId(), ...fields, createdAt: at, updatedAt: at, deletedAt: null };
  await writeLocal(ctx.db, [{ table: "customers", row }]);
  return row;
}

export async function deleteCustomer(ctx: OpContext, id: string) {
  const c = await ctx.db.customers.get(id);
  if (!c) return;
  const at = now();
  await writeLocal(ctx.db, [{ table: "customers", row: { ...c, deletedAt: at, updatedAt: at } }]);
}

export async function recordDebtPayment(
  ctx: OpContext,
  input: { customerId: string; amount: number; method: DebtPayment["method"]; note: string | null },
): Promise<DebtPayment> {
  const at = now();
  const row: DebtPayment = {
    id: newId(),
    customerId: input.customerId,
    amount: input.amount,
    method: input.method,
    note: input.note,
    userId: ctx.userId,
    paidAt: at,
    voidedAt: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  await writeLocal(ctx.db, [{ table: "debtPayments", row }]);
  return row;
}

export async function voidDebtPayment(ctx: OpContext, id: string) {
  const p = await ctx.db.debtPayments.get(id);
  if (!p || p.voidedAt) return;
  const at = now();
  await writeLocal(ctx.db, [{ table: "debtPayments", row: { ...p, voidedAt: at, updatedAt: at } }]);
}

// ───────────── Suppliers ─────────────

export async function saveSupplier(ctx: OpContext, input: { id?: string; name: string; phone: string | null; address?: string | null }): Promise<Supplier> {
  const at = now();
  const existing = input.id ? await ctx.db.suppliers.get(input.id) : undefined;
  const fields = { name: input.name.trim(), phone: input.phone?.trim() || null, address: input.address?.trim() || null };
  const row: Supplier = existing
    ? { ...existing, ...fields, updatedAt: at }
    : { id: newId(), ...fields, createdAt: at, updatedAt: at, deletedAt: null };
  await writeLocal(ctx.db, [{ table: "suppliers", row }]);
  return row;
}

export async function deleteSupplier(ctx: OpContext, id: string) {
  const s = await ctx.db.suppliers.get(id);
  if (!s) return;
  const at = now();
  await writeLocal(ctx.db, [{ table: "suppliers", row: { ...s, deletedAt: at, updatedAt: at } }]);
}

/** Pays a supplier part or all of what the shop owes (one instalment). */
export async function recordSupplierPayment(
  ctx: OpContext,
  input: { supplierId: string; amount: number; method: SupplierPayment["method"]; note: string | null },
): Promise<SupplierPayment> {
  const at = now();
  const row: SupplierPayment = {
    id: newId(),
    supplierId: input.supplierId,
    amount: input.amount,
    method: input.method,
    note: input.note,
    userId: ctx.userId,
    paidAt: at,
    voidedAt: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  await writeLocal(ctx.db, [{ table: "supplierPayments", row }]);
  return row;
}

export async function voidSupplierPayment(ctx: OpContext, id: string) {
  const p = await ctx.db.supplierPayments.get(id);
  if (!p || p.voidedAt) return;
  const at = now();
  await writeLocal(ctx.db, [{ table: "supplierPayments", row: { ...p, voidedAt: at, updatedAt: at } }]);
}
