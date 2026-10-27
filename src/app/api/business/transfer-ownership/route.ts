import { z } from "zod";
import { handle, json, requireShop } from "@/lib/api/context";
import { actorFrom } from "@/lib/api/activity";
import { transferOwnership } from "@/lib/api/ownership";
import { rateLimit } from "@/lib/api/rate-limit";

const schema = z.object({ userId: z.string() });

/** The owner hands the current shop to someone working in it. */
export const POST = handle(async (req: Request) => {
  const ctx = await requireShop(req, "ownership.transfer");
  await rateLimit("staff", ctx.user.id);
  const { userId } = schema.parse(await req.json());
  await transferOwnership(actorFrom(ctx.user, ctx.role), ctx.businessId, userId);
  return json({ ok: true });
});
