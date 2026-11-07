import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { metric, requestId, withRequest } from "@/lib/api/telemetry";

const handlers = toNextJsHandler(auth);

function observed(handler: (req: Request) => Promise<Response>) {
  return (req: Request) => withRequest(req, async () => {
    const start = performance.now();
    const response = await handler(req);
    response.headers.set("x-request-id", requestId()!);
    metric("api.request", { status: response.status, durationMs: Math.round(performance.now() - start) });
    return response;
  });
}

export const GET = observed(handlers.GET);
export const POST = observed(handlers.POST);
