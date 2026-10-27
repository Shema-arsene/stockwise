import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ShopContext } from "./context";

/**
 * Branches whose people this actor may manage: every branch for the owner; for a manager, the
 * branches they are actively assigned to (all of them if they are a shop-wide manager).
 */
export async function manageableShopIds(ctx: ShopContext): Promise<string[]> {
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return [];
  const all = async () => (await prisma.shop.findMany({ where: { businessId: ctx.businessId }, select: { id: true } })).map((s) => s.id);
  if (ctx.role === "OWNER") return all();
  const shopWide = await prisma.businessMember.findFirst({
    where: { businessId: ctx.businessId, userId: ctx.user.id, role: "MANAGER", deletedAt: null, disabledAt: null },
  });
  if (shopWide) return all();
  const rows = await prisma.membership.findMany({
    where: { userId: ctx.user.id, role: "MANAGER", deletedAt: null, disabledAt: null, shop: { businessId: ctx.businessId } },
    select: { shopId: true },
  });
  return rows.map((r) => r.shopId);
}

export interface ShopTotals {
  shopId: string;
  salesToday: number;
  salesMonth: number;
  profitMonth: number;
  salesCountToday: number;
  debtOwed: number;
  products: number;
  people: number;
}

/**
 * Headline numbers per shop, computed in the database. `todayFrom` / `monthFrom` come from the
 * viewer's device so "today" means their local day.
 */
export async function shopTotals(shopIds: string[], todayFrom: Date, monthFrom: Date): Promise<ShopTotals[]> {
  if (!shopIds.length) return [];
  // Timestamps are stored as UTC without a zone; compare against UTC wall-clock strings.
  const utc = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");
  const today = utc(todayFrom);
  const month = utc(monthFrom);
  const [sales, debts, payments, products, people] = await Promise.all([
    prisma.$queryRaw<{ shopId: string; today: bigint | null; month: bigint | null; profit: bigint | null; count_today: bigint }[]>`
      SELECT "shopId",
        SUM(total) FILTER (WHERE "soldAt" >= ${today}::timestamp) AS today,
        SUM(total) FILTER (WHERE "soldAt" >= ${month}::timestamp) AS month,
        SUM(subtotal - "costTotal") FILTER (WHERE "soldAt" >= ${month}::timestamp) AS profit,
        COUNT(*) FILTER (WHERE "soldAt" >= ${today}::timestamp) AS count_today
      FROM sale
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL
        AND "soldAt" >= LEAST(${today}::timestamp, ${month}::timestamp)
      GROUP BY "shopId"`,
    prisma.$queryRaw<{ shopId: string; owed: bigint | null }[]>`
      SELECT "shopId", SUM(total - "amountPaid") AS owed FROM sale
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "paymentType" = 'CREDIT' AND "voidedAt" IS NULL AND "deletedAt" IS NULL
      GROUP BY "shopId"`,
    prisma.$queryRaw<{ shopId: string; paid: bigint | null }[]>`
      SELECT "shopId", SUM(amount) AS paid FROM debt_payment
      WHERE "shopId" = ANY(${shopIds}::text[]) AND "voidedAt" IS NULL AND "deletedAt" IS NULL
      GROUP BY "shopId"`,
    prisma.product.groupBy({ by: ["shopId"], where: { shopId: { in: shopIds }, deletedAt: null }, _count: true }),
    prisma.membership.groupBy({ by: ["shopId"], where: { shopId: { in: shopIds }, deletedAt: null }, _count: true }),
  ]);
  const n = (v: bigint | null | undefined) => Number(v ?? 0);
  return shopIds.map((shopId) => {
    const s = sales.find((r) => r.shopId === shopId);
    return {
      shopId,
      salesToday: n(s?.today),
      salesMonth: n(s?.month),
      profitMonth: n(s?.profit),
      salesCountToday: n(s?.count_today),
      debtOwed: n(debts.find((r) => r.shopId === shopId)?.owed) - n(payments.find((r) => r.shopId === shopId)?.paid),
      products: products.find((r) => r.shopId === shopId)?._count ?? 0,
      people: people.find((r) => r.shopId === shopId)?._count ?? 0,
    };
  });
}

/** Parses ?today=ISO&month=ISO, falling back to UTC boundaries. */
export function periodFromQuery(url: URL) {
  const now = new Date();
  const parse = (v: string | null, fallback: Date) => {
    const d = v ? new Date(v) : fallback;
    return Number.isNaN(d.getTime()) ? fallback : d;
  };
  return {
    todayFrom: parse(url.searchParams.get("today"), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))),
    monthFrom: parse(url.searchParams.get("month"), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
  };
}
