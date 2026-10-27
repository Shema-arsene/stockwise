import { handle, json, requireUser } from "@/lib/api/context";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/permissions";

const RANK: Record<Role, number> = { CASHIER: 1, MANAGER: 2, OWNER: 3 };

/**
 * The signed-in user, their platform role, and every branch they can use with their effective role:
 * every branch of a shop they own (OWNER) or manage shop-wide (MANAGER), plus branches they are
 * assigned to individually (MANAGER / CASHIER).
 */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const [shopRoles, memberships, account] = await Promise.all([
    prisma.businessMember.findMany({
      where: { userId: user.id, deletedAt: null, disabledAt: null },
      include: { business: { include: { shops: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { userId: user.id, deletedAt: null, disabledAt: null },
      include: { shop: { select: { id: true, name: true, business: { select: { id: true, name: true, status: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { username: true, managedByBusinessId: true } }),
  ]);

  type Entry = { id: string; name: string; role: Role; businessId: string; businessName: string; suspended: boolean };
  const shops = new Map<string, Entry>();
  const add = (e: Entry) => {
    const prev = shops.get(e.id);
    if (!prev || RANK[e.role] > RANK[prev.role]) shops.set(e.id, e);
  };
  for (const r of shopRoles) {
    for (const s of r.business.shops) {
      add({ id: s.id, name: s.name, role: r.role, businessId: r.business.id, businessName: r.business.name, suspended: r.business.status === "SUSPENDED" });
    }
  }
  for (const m of memberships) {
    add({
      id: m.shop.id,
      name: m.shop.name,
      role: m.role,
      businessId: m.shop.business.id,
      businessName: m.shop.business.name,
      suspended: m.shop.business.status === "SUSPENDED",
    });
  }

  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      platformRole: user.platformRole,
      username: account?.username ?? null,
      pinAccount: !!account?.managedByBusinessId,
    },
    shops: [...shops.values()],
  });
});
