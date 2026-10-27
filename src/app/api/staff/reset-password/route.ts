import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { HttpError, handle, json, requireShop } from "@/lib/api/context";
import { actorFrom, logActivity } from "@/lib/api/activity";
import { assertCanManage, authorityOf, loadAssignment, staffPassword } from "@/lib/api/staff";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/api/rate-limit";

const schema = z.object({ kind: z.enum(["branch", "shop"]), id: z.string(), password: staffPassword });

/**
 * Sets a new password for a username login this shop created. People who registered with their
 * own email keep control of their own password: a shop can only remove them, never change their login.
 */
export const POST = handle(async (req: Request) => {
  const ctx = await requireShop(req, "staff.manage");
  await rateLimit("staff", ctx.user.id);
  const input = schema.parse(await req.json());
  const a = await loadAssignment(input.kind, input.id);
  assertCanManage(await authorityOf(ctx), a);
  if (a.managedByBusinessId !== ctx.businessId) throw new HttpError(403, "not_a_shop_login");

  await prisma.$transaction(async (tx) => {
    await tx.account.updateMany({ where: { userId: a.userId, providerId: "credential" }, data: { password: await hashPassword(input.password) } });
    await tx.user.update({ where: { id: a.userId }, data: { failedLogins: 0, lockedUntil: null } });
    await tx.session.deleteMany({ where: { userId: a.userId } });
    await logActivity(
      actorFrom(ctx.user, ctx.role),
      { action: "staff.reset_password", businessId: ctx.businessId, shopId: a.shopId, entity: "user", entityId: a.userId, summary: { name: a.userName } },
      tx,
    );
  });
  return json({ ok: true });
});
