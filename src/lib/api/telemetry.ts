import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Context = { requestId: string; route: string; method: string; sampled: boolean };
const requests = new AsyncLocalStorage<Context>();

function successSampleRate() {
  const configured = Number(process.env.TELEMETRY_SUCCESS_SAMPLE_RATE ?? "0.1");
  return Number.isFinite(configured) ? Math.min(1, Math.max(0, configured)) : 0.1;
}

// Only explicitly named numeric counters and timings enter logs. Never log bodies, URLs,
// headers, account identifiers, or exception messages here.
export function metric(event: string, values: Record<string, number | string | boolean> = {}) {
  if (process.env.TELEMETRY_ENABLED === "0") return;
  const ctx = requests.getStore();
  const isError = values.ok === false || (typeof values.status === "number" && values.status >= 400) || event.endsWith("error");
  if (ctx && !ctx.sampled && !isError) return;
  try {
    console.info(JSON.stringify({ event, requestId: ctx?.requestId, route: ctx?.route, method: ctx?.method, ...values }));
  } catch {
    // Logging must never turn a successful write into a failed one.
  }
}

export async function timed<T>(event: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await work();
    metric(event, { durationMs: Math.round(performance.now() - start), ok: true });
    return result;
  } catch (error) {
    metric(event, { durationMs: Math.round(performance.now() - start), ok: false });
    throw error;
  }
}

export function withRequest<T>(req: Request, work: () => Promise<T>): Promise<T> {
  const requestId = randomUUID();
  const route = new URL(req.url).pathname;
  return requests.run({ requestId, route, method: req.method, sampled: Math.random() < successSampleRate() }, work);
}

export function requestId(): string | undefined {
  return requests.getStore()?.requestId;
}
