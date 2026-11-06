import { handle, json, requirePlatform } from "@/lib/api/context";
import { probeNeonServices } from "@/lib/neon/probes";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Platform-only operational check; it returns booleans, never credentials. */
export const GET = handle(async (req: Request) => {
  await requirePlatform(req, "platform.view");
  const services = await probeNeonServices();
  const healthy = Object.values(services).every(Boolean);
  return json({ healthy, services }, { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } });
});
