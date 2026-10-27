import "server-only";
import { prisma } from "@/lib/db/prisma";
import { newId } from "@/lib/ids";
import { HttpError } from "./context";
import { logActivity, type ActivityActor } from "./activity";

/**
 * Hands a shop (and its bill) to someone already working in it. The new owner must have their own
 * email login (not a username login the shop created). The previous owner stays on as a manager of
 * every branch.
 */
export async function transferOwnership(who: ActivityActor, businessId: string, toUserId: string) {
  const owner = await prisma.businessMember.findFirst({ where: { businessId, role: "OWNER" }, include: { user: { select: { name: true } } } });
  if (!owner) throw new HttpError(404, "not_found");
  if (owner.userId === toUserId) throw new HttpError(400, "already_owner");

  const target = await prisma.user.findUnique({ where: { id: toUserId }, select: { name: true, managedByBusinessId: true, deactivatedAt: true } });
  const works =
    (await prisma.membership.findFirst({ where: { userId: toUserId, shop: { businessId }, deletedAt: null, disabledAt: null } })) ||
    (await prisma.businessMember.findFirst({ where: { userId: toUserId, businessId, role: "MANAGER", deletedAt: null, disabledAt: null } }));
  if (!target || !works || target.deactivatedAt) throw new HttpError(404, "not_found");
  if (target.managedByBusinessId) throw new HttpError(400, "shop_login_cannot_own");

  await prisma.$transaction(async (tx) => {
    // The new owner reaches every branch through ownership; their other assignments are redundant.
    await tx.businessMember.deleteMany({ where: { businessId, userId: toUserId, role: "MANAGER" } });
    await tx.membership.deleteMany({ where: { userId: toUserId, shop: { businessId } } });
    await tx.businessMember.update({ where: { id: owner.id }, data: { userId: toUserId } });
    // The previous owner keeps working as manager of every branch.
    await tx.businessMember.create({ data: { id: newId(), businessId, userId: owner.userId, role: "MANAGER" } });
    await logActivity(who, { action: "business.transfer_ownership", businessId, entity: "user", entityId: toUserId, summary: { to: target.name, from: owner.user.name } }, tx);
  });
}
