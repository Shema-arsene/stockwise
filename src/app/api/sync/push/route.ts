import { handle, json, requireShop } from "@/lib/api/context";
import { applyPush } from "@/lib/sync/server";
import { pushBodySchema } from "@/lib/sync/tables";
import { rateLimit } from "@/lib/api/rate-limit";

export const POST = handle(async (req: Request) => {
  // Former staff may still upload what they recorded offline before losing access (see applyPush).
  const ctx = await requireShop(req, undefined, { allowFormer: true });
  await rateLimit("push", ctx.user.id);
  const body = pushBodySchema.parse(await req.json());
  const result = await applyPush(ctx, body.mutations, body.deviceId);
  return json(result);
});
