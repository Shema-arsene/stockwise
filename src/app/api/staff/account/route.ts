import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { HttpError, handle, json, requireShop } from "@/lib/api/context";
import { actorFrom, logActivity } from "@/lib/api/activity";
import { manageableShopIds } from "@/lib/api/people";
import { USERNAME_RE, assign, staffPassword } from "@/lib/api/staff";
import { prisma } from "@/lib/db/prisma";
import { newId } from "@/lib/ids";
import { canAssign } from "@/lib/permissions";
import { rateLimit } from "@/lib/api/rate-limit";

const schema = z.object({
  /** A branch id, or "all" for every branch of the shop (managers only, owner only). */
  shopId: z.string(),
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().toLowerCase().regex(USERNAME_RE),
  password: staffPassword,
  role: z.enum(["MANAGER", "CASHIER"]).default("CASHIER"),
});

/**
 * Creates a username + password login for someone without email (usually a cashier), owned by this
 * shop, and assigns them. The account is written directly rather than through the auth sign-up
 * endpoint, so the person creating it is not signed in as the new user.
 */
export const POST = handle(async (req: Request) => {
  const ctx = await requireShop(req, "staff.manage");
  await rateLimit("staff", ctx.user.id);
  const input = schema.parse(await req.json());
  if (!canAssign(ctx.role, input.role)) throw new HttpError(403, "forbidden");
  const allBranches = input.shopId === "all";
  if (allBranches ? ctx.role !== "OWNER" || input.role !== "MANAGER" : !(await manageableShopIds(ctx)).includes(input.shopId)) {
    throw new HttpError(403, "forbidden");
  }
  if (await prisma.user.findUnique({ where: { username: input.username } })) throw new HttpError(409, "username_taken");

  const userId = newId();
  const password = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: userId,
        name: input.name,
        // Better Auth needs an email; this one can never receive mail and is never shown.
        email: `${input.username}@staff.stockwise.invalid`,
        username: input.username,
        managedByBusinessId: ctx.businessId,
      },
    });
    await tx.account.create({ data: { id: newId(), accountId: userId, providerId: "credential", userId, password } });
  });
  const who = actorFrom(ctx.user, ctx.role);
  await logActivity(who, {
    action: "staff.create_login",
    businessId: ctx.businessId,
    shopId: allBranches ? null : input.shopId,
    entity: "user",
    entityId: userId,
    summary: { name: input.name, username: input.username, role: input.role },
  });
  await assign(who, { userId, userName: input.name, businessId: ctx.businessId, shopId: allBranches ? null : input.shopId, role: input.role }, newId);

  return json({ userId, username: input.username }, { status: 201 });
});
