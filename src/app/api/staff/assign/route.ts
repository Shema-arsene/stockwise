import { z } from "zod";
import { HttpError, handle, json, requireShop } from "@/lib/api/context";
import { actorFrom } from "@/lib/api/activity";
import { manageableShopIds } from "@/lib/api/people";
import { assign, peopleOfBusiness } from "@/lib/api/staff";
import { newId } from "@/lib/ids";
import { canAssign, canManagePerson, highestRole } from "@/lib/permissions";
import { rateLimit } from "@/lib/api/rate-limit";

const schema = z.object({
  userId: z.string(),
  /** A branch id, or "all" for every branch (managers only, owner only). */
  shopId: z.string(),
  role: z.enum(["MANAGER", "CASHIER"]),
});

/**
 * Allocates someone already working in this shop to another branch (or to every branch).
 * Owners allocate managers and cashiers; managers move cashiers between branches they run.
 */
export const POST = handle(async (req: Request) => {
  const ctx = await requireShop(req, "staff.manage");
  await rateLimit("staff", ctx.user.id);
  const input = schema.parse(await req.json());
  if (!canAssign(ctx.role, input.role)) throw new HttpError(403, "forbidden");

  const { people } = await peopleOfBusiness(ctx.businessId);
  const person = people.find((p) => p.userId === input.userId);
  if (!person) throw new HttpError(404, "not_found");
  const currentRole = highestRole(...person.assignments.map((a) => a.role))!;
  if (!canManagePerson({ userId: ctx.user.id, role: ctx.role }, { userId: person.userId, role: currentRole })) throw new HttpError(403, "forbidden");

  const allBranches = input.shopId === "all";
  if (allBranches ? ctx.role !== "OWNER" || input.role !== "MANAGER" : !(await manageableShopIds(ctx)).includes(input.shopId)) {
    throw new HttpError(403, "forbidden");
  }
  await assign(actorFrom(ctx.user, ctx.role), { userId: person.userId, userName: person.name, businessId: ctx.businessId, shopId: allBranches ? null : input.shopId, role: input.role }, newId);
  return json({ ok: true });
});
