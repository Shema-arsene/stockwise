import { handle, json, requireShop } from "@/lib/api/context";
import { buildPull } from "@/lib/sync/server";
import { metric, timed } from "@/lib/api/telemetry";

export const GET = handle(async (req: Request) => {
  const ctx = await requireShop(req);
  const since = Math.max(0, Number(new URL(req.url).searchParams.get("since")) || 0);
  const result = await timed("sync.pull", () => buildPull(ctx, since));
  metric("sync.pull_rows", { rows: Object.values(result.changes).reduce((n, rows) => n + (rows?.length ?? 0), 0), hasMore: result.hasMore });
  return json(result);
});
