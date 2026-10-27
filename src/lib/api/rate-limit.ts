import "server-only";
import { prisma } from "@/lib/db/prisma";
import { HttpError } from "./context";

// Fixed-window request limits, counted in Postgres so every serverless instance shares them
// (the same reason Better Auth keeps its sign-in limits in the database).

const enabled = () => process.env.NODE_ENV === "production" && process.env.DISABLE_AUTH_RATE_LIMIT !== "1";

/** Requests allowed per minute, per person, for each kind of call. */
export const LIMITS = {
  api: 300, // any signed-in API call
  push: 120, // sync uploads
  export: 10, // PDF / Excel / CSV downloads
  staff: 30, // creating logins, resetting passwords, invitations
  platform: 60, // founder / super admin account actions
} as const;

export type LimitBucket = keyof typeof LIMITS;

/** Counts one request and throws 429 (with Retry-After) once `who` is over the limit for this minute. */
export async function rateLimit(bucket: LimitBucket, who: string, opts: { max?: number; windowSec?: number; force?: boolean } = {}) {
  if (!enabled() && !opts.force) return;
  const windowSec = opts.windowSec ?? 60;
  const max = opts.max ?? LIMITS[bucket];
  const key = `${bucket}:${who}`;
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO api_rate_limit (key, count, "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN api_rate_limit."resetAt" <= now() THEN 1 ELSE api_rate_limit.count + 1 END,
      "resetAt" = CASE WHEN api_rate_limit."resetAt" <= now() THEN now() + make_interval(secs => ${windowSec}) ELSE api_rate_limit."resetAt" END
    RETURNING count, "resetAt"`;
  // Now and then, drop windows that ended long ago so the table stays small.
  if (Math.random() < 0.01) await prisma.$executeRaw`DELETE FROM api_rate_limit WHERE "resetAt" < now() - interval '1 hour'`;
  const { count, resetAt } = rows[0];
  if (count > max) {
    const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
    throw new HttpError(429, "rate_limited", "Too many requests", { "retry-after": String(retryAfter) });
  }
}
