import type { Instrumentation } from "next";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.TELEMETRY_ENABLED !== "0") {
    console.info(JSON.stringify({ event: "server.start", service: "stockwise" }));
  }
}

export const onRequestError: Instrumentation.onRequestError = async (_error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.TELEMETRY_ENABLED === "0") return;
  try {
    console.error(JSON.stringify({ event: "server.unhandled_error", route: context.routePath, method: request.method }));
  } catch {
    // Error reporting must not interfere with the original response.
  }
};
