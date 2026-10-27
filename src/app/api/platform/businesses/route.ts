import { z } from "zod";
import { HttpError, handle, json, requirePlatform } from "@/lib/api/context";
import { logActivity } from "@/lib/api/activity";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/api/rate-limit";

/** All customer businesses with their owner, size and last activity. Founder / super admins. */
export const GET = handle(async (req: Request) => {
  await requirePlatform(req, "platform.view");
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const businesses = await prisma.business.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { members: { some: { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } } } },
          ],
        }
      : undefined,
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      shops: { select: { id: true, _count: { select: { memberships: { where: { deletedAt: null } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const lastActivity = await prisma.activityLog.groupBy({
    by: ["businessId"],
    where: { businessId: { in: businesses.map((b) => b.id) } },
    _max: { at: true },
  });
  const last = new Map(lastActivity.map((l) => [l.businessId, l._max.at]));
  const [totalUsers, totalBusinesses, suspended] = await Promise.all([
    prisma.user.count({ where: { platformRole: null } }),
    prisma.business.count(),
    prisma.business.count({ where: { status: "SUSPENDED" } }),
  ]);

  return json({
    stats: { businesses: totalBusinesses, suspended, users: totalUsers },
    businesses: businesses.map((b) => {
      const owner = b.members.find((m) => m.role === "OWNER")?.user ?? null;
      return {
        id: b.id,
        name: b.name,
        plan: b.plan,
        status: b.status,
        createdAt: b.createdAt,
        owner,
        shops: b.shops.length,
        people: b.shops.reduce((n, s) => n + s._count.memberships, 0) + (owner ? 1 : 0),
        lastActivityAt: last.get(b.id) ?? null,
      };
    }),
  });
});

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  plan: z.enum(["FREE", "TRIAL", "BASIC", "PRO"]).optional(),
});

/** Suspend / reactivate a business or change its plan. Never touches the business's records. */
export const PATCH = handle(async (req: Request) => {
  const actor = await requirePlatform(req, "business.admin");
  await rateLimit("platform", actor.id);
  const input = patchSchema.parse(await req.json());
  const before = await prisma.business.findUnique({ where: { id: input.id } });
  if (!before) throw new HttpError(404, "not_found");

  await prisma.business.update({ where: { id: input.id }, data: { status: input.status, plan: input.plan } });
  if (input.status === "SUSPENDED" && before.status !== "SUSPENDED") {
    // Sign everyone in the business out; their devices keep local data but cannot sync.
    const shops = await prisma.shop.findMany({ where: { businessId: input.id }, select: { id: true } });
    const people = await prisma.membership.findMany({ where: { shopId: { in: shops.map((s) => s.id) } }, select: { userId: true } });
    const owner = await prisma.businessMember.findMany({ where: { businessId: input.id }, select: { userId: true } });
    await prisma.session.deleteMany({ where: { userId: { in: [...people, ...owner].map((p) => p.userId) } } });
  }

  const who = { id: actor.id, name: actor.name, role: actor.platformRole, ip: actor.ip };
  if (input.status && input.status !== before.status) {
    await logActivity(who, { action: input.status === "SUSPENDED" ? "platform.business_suspend" : "platform.business_reactivate", businessId: input.id, entity: "business", entityId: input.id, summary: { name: before.name } });
  }
  if (input.plan && input.plan !== before.plan) {
    await logActivity(who, { action: "platform.business_plan", businessId: input.id, entity: "business", entityId: input.id, summary: { name: before.name, from: before.plan, to: input.plan } });
  }
  return json({ ok: true });
});
