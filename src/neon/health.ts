import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const secret = process.env.STOCKWISE_ORIGIN_SECRET;
if (!secret) throw new Error("STOCKWISE_ORIGIN_SECRET is required");
const expected = Buffer.from(secret);

function authorized(request: Request): boolean {
  const supplied = request.headers.get("x-secret");
  if (!supplied) return false;
  const actual = Buffer.from(supplied);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

const handler = {
  async fetch(request: Request): Promise<Response> {
    if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return Response.json({ ok: false }, { status: 503 });
    const result = await neon(databaseUrl)`SELECT 1 AS ok`;
    return Response.json({ ok: result[0]?.ok === 1 });
  },
};

export default handler;
