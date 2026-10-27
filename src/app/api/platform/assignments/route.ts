import { z } from "zod";
import { handle, json, requirePlatform } from "@/lib/api/context";
import { loadAssignment, removeAssignment, updateAssignment, type Authority } from "@/lib/api/staff";
import { transferOwnership } from "@/lib/api/ownership";
import { rateLimit } from "@/lib/api/rate-limit";

const ref = { kind: z.enum(["branch", "shop"]), id: z.string() };

async function platformActor(req: Request) {
  const actor = await requirePlatform(req, "accounts.manage");
  await rateLimit("platform", actor.id);
  const authority: Authority = { userId: actor.id, role: actor.platformRole }; // no shop scope: any shop
  const who = { id: actor.id, name: actor.name, role: actor.platformRole, ip: actor.ip };
  return { authority, who };
}

/** Change role / enable state of anyone's assignment in any shop (founder / super admins). */
export const PATCH = handle(async (req: Request) => {
  const { authority, who } = await platformActor(req);
  const input = z.object({ ...ref, role: z.enum(["MANAGER", "CASHIER"]).optional(), disabled: z.boolean().optional() }).parse(await req.json());
  await updateAssignment(authority, who, await loadAssignment(input.kind, input.id), input);
  return json({ ok: true });
});

/** Remove anyone's assignment in any shop. */
export const DELETE = handle(async (req: Request) => {
  const { authority, who } = await platformActor(req);
  const url = new URL(req.url);
  const input = z.object(ref).parse({ kind: url.searchParams.get("kind") ?? "branch", id: url.searchParams.get("id") ?? "" });
  await removeAssignment(authority, who, await loadAssignment(input.kind, input.id));
  return json({ ok: true });
});

/** Make someone working in a shop its owner (e.g. the owner has left). */
export const POST = handle(async (req: Request) => {
  const { who } = await platformActor(req);
  const input = z.object({ businessId: z.string(), userId: z.string() }).parse(await req.json());
  await transferOwnership(who, input.businessId, input.userId);
  return json({ ok: true });
});
