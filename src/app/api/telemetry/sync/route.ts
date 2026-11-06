import { z } from "zod";
import { handle, json, requireUser } from "@/lib/api/context";
import { metric } from "@/lib/api/telemetry";

const sample = z.object({
  durationMs: z.number().int().min(0).max(600_000),
  pending: z.number().int().min(0).max(100_000),
  oldestPendingMs: z.number().int().min(0).max(30 * 86_400_000),
  outcome: z.enum(["idle", "offline", "error", "signed-out", "suspended", "no-access"]),
});

export const POST = handle(async (req: Request) => {
  await requireUser(req);
  const data = sample.parse(await req.json());
  metric("sync.client", data);
  return json({ ok: true });
});
