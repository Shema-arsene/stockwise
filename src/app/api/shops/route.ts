import { z } from "zod";
import { HttpError, handle, json, requireUser } from "@/lib/api/context";
import { logActivity } from "@/lib/api/activity";
import { periodFromQuery, shopTotals } from "@/lib/api/people";
import { prisma } from "@/lib/db/prisma";
import { newId } from "@/lib/ids";
import { PLAN_DB } from "@/lib/plans";

// Vocabulary: a "shop" in the UI is a Business in code; a "branch" in the UI is a Shop in code.

const createSchema = z.object({
  /** Branch name. For a new shop this is also the shop's name unless shopName is given. */
  name: z.string().trim().min(2).max(80),
  /** Add a branch to this shop (must be its owner). Omit to open a new shop. */
  businessId: z.string().optional(),
  shopName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(32).optional(),
  address: z.string().trim().max(200).optional(),
  locale: z.enum(["en", "fr"]).default("en"),
  /** Package picked on the pricing page (new shops only). */
  plan: z.enum(["starter", "business", "pro"]).optional(),
});

/**
 * Opens a new shop (the caller becomes its owner, with a first branch), or adds a branch to a shop
 * the caller owns. Owners can run several separate shops. Shop-created logins cannot open shops.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const input = createSchema.parse(await req.json());
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
        id: newId(),
        businessId: business.id,
        name: input.name,
        phone: input.phone || null,
        address: input.address || null,
        locale: input.locale,
        currency: "ZMW",
      },
    });
    await logActivity(
      { id: user.id, name: user.name, role: "OWNER", ip: user.ip },
      {
        action: input.businessId ? "shop.create" : "business.create",
        businessId: business.id,
        shopId: branch.id,
        entity: "shop",
        entityId: branch.id,
        summary: { name: branch.name, business: business.name },
      },
      tx,
    );
    return { branch, business };
  });

  return json({ id: result.branch.id, name: result.branch.name, businessId: result.business.id, role: "OWNER" }, { status: 201 });
});

/** Every shop the caller owns, with its branches and headline numbers. Needs internet. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { todayFrom, monthFrom } = periodFromQuery(new URL(req.url));
  const owned = await prisma.businessMember.findMany({
    where: { userId: user.id, role: "OWNER" },
    include: { business: { include: { shops: { select: { id: true, name: true, address: true, createdAt: true }, orderBy: { createdAt: "asc" } } } } },
    orderBy: { createdAt: "asc" },
  });
  const totals = await shopTotals(owned.flatMap((o) => o.business.shops.map((s) => s.id)), todayFrom, monthFrom);
  return json({
    shops: owned.map((o) => ({
      id: o.business.id,
      name: o.business.name,
      plan: o.business.plan,
      status: o.business.status,
      branches: o.business.shops.map((s) => ({ ...s, ...totals.find((t) => t.shopId === s.id)! })),
    })),
  });
});
