import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { handle, json, requirePlatform, requireShop } from "@/lib/api/context";
import { prisma } from "@/lib/db/prisma";

const querySchema = z.object({
  scope: z.enum(["business", "platform"]).default("business"),
  businessId: z.string().optional(), // platform scope only
  shopId: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().max(40).optional(), // prefix, e.g. "sale" or "staff.role"
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  before: z.string().optional(), // cursor: id of the last entry already shown
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Read-only activity log. Owners and admins see their own business (all branches);
 * the founder and super admins see the whole app. There is deliberately no way to change entries.
 */
export const GET = handle(async (req: Request) => {
  const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));

  const where: Prisma.ActivityLogWhereInput = {};
  if (q.scope === "platform") {
    await requirePlatform(req, "logs.view.all");
    if (q.businessId) where.businessId = q.businessId;
  } else {
    const ctx = await requireShop(req, "logs.view.business");
    where.businessId = ctx.businessId;
  }
  if (q.shopId) where.shopId = q.shopId;
  if (q.actorId) where.actorId = q.actorId;
  if (q.action) where.action = { startsWith: q.action };
  if (q.from || q.to) where.at = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) };

  const entries = await prisma.activityLog.findMany({
    where,
    // ids are time-ordered UUIDv7, so (at, id) gives a stable newest-first order for the cursor.
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.before ? { cursor: { id: q.before }, skip: 1 } : {}),
  });

  const page = entries.slice(0, q.limit);
  const shopIds = [...new Set(page.map((e) => e.shopId).filter((s): s is string => !!s))];
  const businessIds = q.scope === "platform" ? [...new Set(page.map((e) => e.businessId).filter((s): s is string => !!s))] : [];
  const [shops, businesses] = await Promise.all([
    prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } }),
    prisma.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, name: true } }),
  ]);

  return json({
    entries: page,
    shopNames: Object.fromEntries(shops.map((s) => [s.id, s.name])),
    businessNames: Object.fromEntries(businesses.map((b) => [b.id, b.name])),
    next: entries.length > q.limit ? page[page.length - 1].id : null,
  });
});
