import { handle, json, requireShop } from "@/lib/api/context";
import { buildPull } from "@/lib/sync/server";

export const GET = handle(async (req: Request) => {
  const ctx = await requireShop(req);
  const since = Math.max(0, Number(new URL(req.url).searchParams.get("since")) || 0);
  return json(await buildPull(ctx, since));
});
