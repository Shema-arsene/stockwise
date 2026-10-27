import { randomBytes } from "node:crypto";
import { z } from "zod";
import { HttpError, handle, json, requireShop, requireUser } from "@/lib/api/context";
import { actorFrom, logActivity } from "@/lib/api/activity";
import { manageableShopIds } from "@/lib/api/people";
import { prisma } from "@/lib/db/prisma";
import { newId } from "@/lib/ids";
import { canAssign } from "@/lib/permissions";
import { rateLimit } from "@/lib/api/rate-limit";

const INVITE_DAYS = 7;

const createSchema = z.object({
  role: z.enum(["MANAGER", "CASHIER"]),
  shopId: z.string().optional(), // defaults to the current branch
  allBranches: z.boolean().default(false), // managers only: every branch of the shop
  email: z.email().optional().or(z.literal("")),
});

/** Create a single-use invite link into one shop. Owners invite admins or cashiers; admins invite cashiers. */
export const POST = handle(async (req: Request) => {
  const ctx = await requireShop(req, "staff.manage");
  await rateLimit("staff", ctx.user.id);
  const input = createSchema.parse(await req.json());
  const shopId = input.shopId ?? ctx.shopId;
  if (!canAssign(ctx.role, input.role)) throw new HttpError(403, "forbidden");
  if (!(await manageableShopIds(ctx)).includes(shopId)) throw new HttpError(403, "forbidden");
  if (input.allBranches && (ctx.role !== "OWNER" || input.role !== "MANAGER")) throw new HttpError(403, "forbidden");

  const invitation = await prisma.invitation.create({
    data: {
      id: newId(),
      shopId,
      role: input.role,
      allBranches: input.allBranches,
      email: input.email || null,
      token: randomBytes(24).toString("base64url"),
      invitedBy: ctx.user.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  await logActivity(actorFrom(ctx.user, ctx.role), {
    action: "staff.invite",
    businessId: ctx.businessId,
    shopId,
    entity: "invitation",
    entityId: invitation.id,
    summary: { role: input.role, allBranches: input.allBranches },
  });
  return json({ id: invitation.id, token: invitation.token, role: invitation.role, expiresAt: invitation.expiresAt }, { status: 201 });
});

/** Revoke a pending invite. */
export const DELETE = handle(async (req: Request) => {
  const ctx = await requireShop(req, "staff.manage");
  await rateLimit("staff", ctx.user.id);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const inv = await prisma.invitation.findUnique({ where: { id } });
  if (!inv || inv.acceptedAt || !(await manageableShopIds(ctx)).includes(inv.shopId) || !canAssign(ctx.role, inv.role)) {
    throw new HttpError(404, "not_found");
  }
  await prisma.invitation.delete({ where: { id } });
  await logActivity(actorFrom(ctx.user, ctx.role), { action: "staff.invite_revoke", businessId: ctx.businessId, shopId: inv.shopId, entity: "invitation", entityId: id });
  return json({ ok: true });
});

/** Public lookup used by the invite page before the person signs in. */
export const GET = handle(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const inv = await prisma.invitation.findUnique({ where: { token }, include: { shop: { select: { name: true, business: { select: { name: true } } } } } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new HttpError(404, "invalid_invite");
  return json({ shopName: inv.shop.business.name, branchName: inv.shop.name, role: inv.role, allBranches: inv.allBranches });
});

const acceptSchema = z.object({ token: z.string().min(10) });

/** Accept an invite as the signed-in user. */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { token } = acceptSchema.parse(await req.json());

  const shop = await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { token }, include: { shop: { select: { id: true, name: true, businessId: true } } } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new HttpError(404, "invalid_invite");
    // Single use: claim it first so a second person can't accept concurrently.
    const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (!claimed.count) throw new HttpError(404, "invalid_invite");

    const shopRole = await tx.businessMember.findUnique({ where: { businessId_userId: { businessId: inv.shop.businessId, userId: user.id } } });
    if (shopRole?.role === "OWNER") return { id: inv.shop.id, name: inv.shop.name, role: "OWNER" }; // owners already reach every branch

    if (inv.allBranches) {
      if (shopRole) await tx.businessMember.update({ where: { id: shopRole.id }, data: { role: "MANAGER", deletedAt: null, disabledAt: null } });
      else await tx.businessMember.create({ data: { id: newId(), businessId: inv.shop.businessId, userId: user.id, role: "MANAGER" } });
    } else {
      const existing = await tx.membership.findUnique({ where: { shopId_userId: { shopId: inv.shopId, userId: user.id } } });
      if (existing && !existing.deletedAt && !existing.disabledAt) return { id: inv.shop.id, name: inv.shop.name, role: existing.role };
      if (existing) {
        await tx.membership.update({ where: { id: existing.id }, data: { deletedAt: null, disabledAt: null, role: inv.role } });
      } else {
        await tx.membership.create({ data: { id: newId(), shopId: inv.shopId, userId: user.id, role: inv.role } });
      }
    }
    await logActivity(
      { id: user.id, name: user.name, role: inv.role, ip: user.ip },
      { action: "staff.join", businessId: inv.shop.businessId, shopId: inv.allBranches ? null : inv.shopId, entity: "invitation", entityId: inv.id, summary: { role: inv.role, allBranches: inv.allBranches } },
      tx,
    );
    return { id: inv.shop.id, name: inv.shop.name, role: inv.role };
  });

  return json(shop);
});
