import { z } from "zod";
import { HttpError, handle, json, requirePlatform } from "@/lib/api/context";
import { logActivity } from "@/lib/api/activity";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/api/rate-limit";

/** Platform staff. Visible to founder and super admins; only the founder can change it. */
export const GET = handle(async (req: Request) => {
  await requirePlatform(req, "platform.view");
  const people = await prisma.user.findMany({
    where: { platformRole: { not: null } },
    select: { id: true, name: true, email: true, platformRole: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return json({ people });
});

const addSchema = z.object({ email: z.email() });

/** Make an existing account a super admin (they sign up first, then the founder promotes them). */
export const POST = handle(async (req: Request) => {
  const actor = await requirePlatform(req, "superadmin.manage");
  await rateLimit("platform", actor.id);
  const { email } = addSchema.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new HttpError(404, "no_account");
  if (user.platformRole) throw new HttpError(409, "already_platform");
  if (user.managedByBusinessId) throw new HttpError(400, "pin_account");
  await prisma.user.update({ where: { id: user.id }, data: { platformRole: "SUPER_ADMIN" } });
  await logActivity({ id: actor.id, name: actor.name, role: actor.platformRole, ip: actor.ip }, { action: "platform.superadmin_add", entity: "user", entityId: user.id, summary: { name: user.name, email: user.email } });
  return json({ ok: true }, { status: 201 });
});

/** Remove super admin rights. The founder can never be demoted here. */
export const DELETE = handle(async (req: Request) => {
  const actor = await requirePlatform(req, "superadmin.manage");
  await rateLimit("platform", actor.id);
  const userId = new URL(req.url).searchParams.get("userId") ?? "";
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.platformRole !== "SUPER_ADMIN") throw new HttpError(404, "not_found");
  await prisma.user.update({ where: { id: userId }, data: { platformRole: null } });
  await prisma.session.deleteMany({ where: { userId } });
  await logActivity({ id: actor.id, name: actor.name, role: actor.platformRole, ip: actor.ip }, { action: "platform.superadmin_remove", entity: "user", entityId: userId, summary: { name: user.name, email: user.email } });
  return json({ ok: true });
});
