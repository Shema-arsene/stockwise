import "server-only";
import { z } from "zod";
import { HttpError, type Actor } from "./context";
import { logActivity } from "./activity";
import { periodFromQuery, shopTotals } from "./people";
import { prisma } from "@/lib/db/prisma";
import { newId } from "@/lib/ids";
import { PLAN_DB } from "@/lib/plans";

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(80),
  businessId: z.string().optional(),
  shopName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(32).optional(),
  address: z.string().trim().max(200).optional(),
  locale: z.enum(["en", "fr"]).default("en"),
  plan: z.enum(["starter", "business", "pro"]).optional(),
});

/** Owns the business, branch, membership and activity write in one transaction. */
export async function createShop(user: Actor, input: z.infer<typeof createShopSchema>) {
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { managedByBusinessId: true } });
  if (account?.managedByBusinessId) throw new HttpError(403, "forbidden");

  const result = await prisma.$transaction(async (tx) => {
    let business;
    if (input.businessId) {
      const owns = await tx.businessMember.findFirst({ where: { businessId: input.businessId, userId: user.id, role: "OWNER" }, include: { business: true } });
      if (!owns) throw new HttpError(403, "forbidden");
      if (owns.business.status === "SUSPENDED") throw new HttpError(403, "business_suspended");
      business = owns.business;
    } else {
      business = await tx.business.create({ data: { id: newId(), name: input.shopName ?? input.name, plan: PLAN_DB[input.plan ?? "starter"] } });
      await tx.businessMember.create({ data: { id: newId(), businessId: business.id, userId: user.id, role: "OWNER" } });
    }
    const branch = await tx.shop.create({
      data: {
        id: newId(), businessId: business.id, name: input.name,
        phone: input.phone || null, address: input.address || null,
        locale: input.locale, currency: "ZMW",
      },
    });
    await logActivity(
      { id: user.id, name: user.name, role: "OWNER", ip: user.ip },
      {
        action: input.businessId ? "shop.create" : "business.create",
        businessId: business.id, shopId: branch.id, entity: "shop", entityId: branch.id,
        summary: { name: branch.name, business: business.name },
      },
      tx,
    );
    return { branch, business };
  });

  return { id: result.branch.id, name: result.branch.name, businessId: result.business.id, role: "OWNER" as const };
}

/** Read model for the owner's business list. */
export async function listOwnedShops(userId: string, url: URL) {
  const { todayFrom, monthFrom } = periodFromQuery(url);
  const owned = await prisma.businessMember.findMany({
    where: { userId, role: "OWNER" },
    include: { business: { include: { shops: { select: { id: true, name: true, address: true, createdAt: true }, orderBy: { createdAt: "asc" } } } } },
    orderBy: { createdAt: "asc" },
  });
  const totals = await shopTotals(owned.flatMap((o) => o.business.shops.map((s) => s.id)), todayFrom, monthFrom);
  return {
    shops: owned.map((o) => ({
      id: o.business.id, name: o.business.name, plan: o.business.plan, status: o.business.status,
      branches: o.business.shops.map((s) => ({ ...s, ...totals.find((t) => t.shopId === s.id)! })),
    })),
  };
}
