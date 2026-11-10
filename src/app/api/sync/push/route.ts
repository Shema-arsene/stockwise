import { handle, json, requireShop } from "@/lib/api/context";
import { applyPush } from "@/lib/sync/server";
import { pushBodySchema } from "@/lib/sync/tables";
import { rateLimit } from "@/lib/api/rate-limit";
import { metric, timed } from "@/lib/api/telemetry";

export const POST = handle(async (req: Request) => {
  // Former staff may still upload what they recorded offline before losing access (see applyPush).
  const ctx = await requireShop(req, undefined, { allowFormer: true });
  await rateLimit("push", ctx.user.id);
  const body = pushBodySchema.parse(await req.json());
  const result = await timed("sync.push", () => applyPush(ctx, body.mutations, body.deviceId));
  metric("sync.push_rows", { received: body.mutations.length, applied: result.applied, rejected: result.rejected.length });
  return json(result);
});
