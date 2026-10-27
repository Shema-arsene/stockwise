import { randomInt } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { HttpError, handle, json, requirePlatform } from "@/lib/api/context";
import { logActivity } from "@/lib/api/activity";
import { prisma } from "@/lib/db/prisma";
import { canManagePerson, highestRole, type AnyRole } from "@/lib/permissions";
import { rateLimit } from "@/lib/api/rate-limit";

/** Every role a person holds anywhere, for the rank check. */
async function rolesOf(userId: string): Promise<{ highest: AnyRole | null; platformRole: AnyRole | null }> {
  const [user, owns, shopWide, branch] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } }),
    prisma.businessMember.findFirst({ where: { userId, role: "OWNER" } }),
    prisma.businessMember.findFirst({ where: { userId, role: "MANAGER", deletedAt: null } }),
    prisma.membership.findMany({ where: { userId, deletedAt: null }, select: { role: true } }),
  ]);
  return {
    platformRole: user?.platformRole ?? null,
    highest: highestRole(user?.platformRole, owns ? "OWNER" : null, shopWide ? "MANAGER" : null, ...branch.map((b) => b.role)),
  };
}

/** Search all accounts (founder / super admins). */
export const GET = handle(async (req: Request) => {
  await requirePlatform(req, "platform.view");
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { username: { contains: q.toLowerCase() } }] }
      : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      platformRole: true,
      managedByBusinessId: true,
      lockedUntil: true,
      deactivatedAt: true,
      createdAt: true,
      businessRoles: { where: { deletedAt: null }, select: { role: true, disabledAt: true, business: { select: { id: true, name: true } } } },
      memberships: { where: { deletedAt: null }, select: { role: true, disabledAt: true, shop: { select: { name: true, business: { select: { id: true, name: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json({
    accounts: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.managedByBusinessId ? null : u.email,
      username: u.username,
      platformRole: u.platformRole,
      locked: !!u.lockedUntil && u.lockedUntil > new Date(),
      deactivated: !!u.deactivatedAt,
      createdAt: u.createdAt,
      roles: [
        ...u.businessRoles.map((b) => ({ role: b.role, shop: b.business.name, businessId: b.business.id, branch: null, disabled: !!b.disabledAt })),
        ...u.memberships.map((m) => ({ role: m.role, shop: m.shop.business.name, businessId: m.shop.business.id, branch: m.shop.name, disabled: !!m.disabledAt })),
      ],
    })),
  });
});

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const tempPassword = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

const actionSchema = z.object({
  userId: z.string(),
  action: z.enum(["reset_password", "unlock", "deactivate", "reactivate"]),
});

/**
 * Account actions on anyone ranked below the caller. Accounts are never deleted: deactivation
 * blocks sign-in everywhere and is reversible, and history stays intact.
 */
export const POST = handle(async (req: Request) => {
  const actor = await requirePlatform(req, "accounts.manage");
  await rateLimit("platform", actor.id);
  const { userId, action } = actionSchema.parse(await req.json());
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, username: true } });
  if (!target) throw new HttpError(404, "not_found");
  const { highest } = await rolesOf(userId);
  // Accounts with no role at all yet (just signed up) count as the lowest rank.
  if (!canManagePerson({ userId: actor.id, role: actor.platformRole }, { userId, role: highest ?? "CASHIER" })) {
    throw new HttpError(403, userId === actor.id ? "cannot_change_self" : "forbidden");
  }

  const who = { id: actor.id, name: actor.name, role: actor.platformRole, ip: actor.ip };
  const log = (a: string) => logActivity(who, { action: `account.${a}`, entity: "user", entityId: userId, summary: { name: target.name, login: target.username ?? target.email } });
  let temporaryPassword: string | undefined;

  if (action === "reset_password") {
    temporaryPassword = tempPassword();
    await prisma.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: await hashPassword(temporaryPassword) } });
    await prisma.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
    await prisma.session.deleteMany({ where: { userId } });
  } else if (action === "unlock") {
    await prisma.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
  } else if (action === "deactivate") {
    await prisma.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
    await prisma.session.deleteMany({ where: { userId } });
  } else {
    await prisma.user.update({ where: { id: userId }, data: { deactivatedAt: null, failedLogins: 0, lockedUntil: null } });
  }
  await log(action);
  return json({ ok: true, temporaryPassword, login: target.username ?? target.email });
});
