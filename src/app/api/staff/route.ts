import { z } from "zod";
import { handle, json, requireShop } from "@/lib/api/context";
import { actorFrom } from "@/lib/api/activity";
import { manageableShopIds } from "@/lib/api/people";
import { authorityOf, loadAssignment, peopleOfBusiness, removeAssignment, updateAssignment } from "@/lib/api/staff";
import { prisma } from "@/lib/db/prisma";

/**
 * People this actor can see and manage in the current shop:
 *  - owner: everyone, in every branch, including shop-wide managers
 *  - manager: the cashiers of the branches they run (managers only manage cashiers)
 */
export const GET = handle(async (req: Request) => {
  const ctx = await requireShop(req, "staff.manage");
  const shopIds = await manageableShopIds(ctx);
  const [{ people, owner }, branches, invitations, business] = await Promise.all([
    peopleOfBusiness(ctx.businessId),
    prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({
      where: { shopId: { in: shopIds }, acceptedAt: null, expiresAt: { gt: new Date() }, ...(ctx.role === "MANAGER" ? { role: "CASHIER" } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { name: true } }),
  ]);

  const visible =
    ctx.role === "OWNER"
      ? people
      : people
          .map((p) => ({ ...p, assignments: p.assignments.filter((a) => a.role === "CASHIER" && a.shopId && shopIds.includes(a.shopId)) }))
          .filter((p) => p.assignments.length);

  return json({
    business: { id: ctx.businessId, name: business.name },
    owner,
    branches,
    people: visible,
    invitations: invitations.map((i) => ({ id: i.id, role: i.role, shopId: i.shopId, allBranches: i.allBranches, email: i.email, token: i.token, expiresAt: i.expiresAt })),
  });
});

const ref = { kind: z.enum(["branch", "shop"]), id: z.string() };
const patchSchema = z.object({ ...ref, role: z.enum(["MANAGER", "CASHIER"]).optional(), disabled: z.boolean().optional() });

/** Change someone's role in a branch, or disable / re-enable an assignment. */
export const PATCH = handle(async (req: Request) => {
  const ctx = await requireShop(req, "staff.manage");
  const input = patchSchema.parse(await req.json());
  const a = await loadAssignment(input.kind, input.id);
  await updateAssignment(await authorityOf(ctx), actorFrom(ctx.user, ctx.role), a, input);
  return json({ ok: true });
});

/** Remove an assignment (a branch, or shop-wide). The account remains. */
export const DELETE = handle(async (req: Request) => {
  const ctx = await requireShop(req, "staff.manage");
  const url = new URL(req.url);
  const input = z.object(ref).parse({ kind: url.searchParams.get("kind") ?? "branch", id: url.searchParams.get("id") ?? "" });
  const a = await loadAssignment(input.kind, input.id);
  await removeAssignment(await authorityOf(ctx), actorFrom(ctx.user, ctx.role), a);
  return json({ ok: true });
});
