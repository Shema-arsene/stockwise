"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useShop } from "@/components/app/shop-context";
import type { Category, Customer, Product, Supplier } from "@/lib/sync/tables";
import { agePayable, type Aging } from "@/lib/debt";
import { groupBy } from "@/lib/utils";

export interface ProductWithStock extends Product {
  stock: number;
  category: Category | null;
  status: "ok" | "low" | "out";
}

export function stockStatus(stock: number, reorderLevel: number): ProductWithStock["status"] {
  if (stock <= 0) return "out";
  if (reorderLevel > 0 && stock <= reorderLevel) return "low";
  return "ok";
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** All active products with their current stock. Re-renders whenever stock or products change. */
export function useProducts(): ProductWithStock[] | undefined {
  const { db } = useShop();
  return useLiveQuery(async () => {
    const [products, levels, categories] = await Promise.all([
      db.products.toArray(),
      db.stockLevels.toArray(),
      db.categories.toArray(),
    ]);
    const stock = new Map(levels.map((l) => [l.productId, l.qty]));
    const cats = new Map(categories.map((c) => [c.id, c]));
    return products
      .filter((p) => !p.deletedAt)
      .map((p) => {
        const s = stock.get(p.id) ?? 0;
        return { ...p, stock: s, category: (p.categoryId && cats.get(p.categoryId)) || null, status: stockStatus(s, p.reorderLevel) };
      })
      .sort(byName);
  }, [db]);
}

export function useCategories(): Category[] | undefined {
  const { db } = useShop();
  return useLiveQuery(async () => (await db.categories.toArray()).filter((c) => !c.deletedAt).sort(byName), [db]);
}

export interface CustomerWithBalance extends Customer {
  owed: number;
  lastActivityAt: string | null;
}

export function useCustomers(): CustomerWithBalance[] | undefined {
  const { db } = useShop();
  return useLiveQuery(async () => {
    const [customers, balances] = await Promise.all([db.customers.toArray(), db.balances.toArray()]);
    const bal = new Map(balances.map((b) => [b.customerId, b]));
    return customers
      .filter((c) => !c.deletedAt)
      .map((c) => ({ ...c, owed: bal.get(c.id)?.owed ?? 0, lastActivityAt: bal.get(c.id)?.lastActivityAt ?? null }))
      .sort(byName);
  }, [db]);
}

export interface SupplierWithBalance extends Supplier {
  /** What the shop owes this supplier, oldest bills first (see agePayable). */
  owed: number;
  aging: Aging;
  lastActivityAt: string | null;
}

/** Suppliers with what the shop owes each one, from credit purchases minus payments. */
export function useSuppliers(): SupplierWithBalance[] | undefined {
  const { db } = useShop();
  return useLiveQuery(async () => {
    const [suppliers, purchases, payments] = await Promise.all([
      db.suppliers.toArray(),
      db.purchases.where("supplierId").above("").toArray(),
      db.supplierPayments.toArray(),
    ]);
    const buys = groupBy(purchases, (p) => p.supplierId!);
    const pays = groupBy(payments, (p) => p.supplierId);
    return suppliers
      .filter((s) => !s.deletedAt)
      .map((s) => {
        const b = (buys.get(s.id) ?? []).filter((p) => !p.voidedAt);
        const pay = (pays.get(s.id) ?? []).filter((p) => !p.voidedAt);
        const aging = agePayable(b, pay);
        const last = [...b.map((p) => p.purchasedAt), ...pay.map((p) => p.paidAt)].sort().at(-1) ?? null;
        return { ...s, owed: aging.owed, aging, lastActivityAt: last };
      })
      .sort(byName);
  }, [db]);
}

export { matches } from "@/lib/utils";
