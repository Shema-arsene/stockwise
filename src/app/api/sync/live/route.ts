import { createRealtime, rawSql } from "@neon/realtime/server";
import { handle, HttpError, json, requireShop } from "@/lib/api/context";

export const runtime = "nodejs";

/** Seals a shop-scoped change counter; no ledger or customer rows leave this query. */
export const GET = handle(async (req: Request) => {
  const ctx = await requireShop(req);
  const url = process.env.NEON_REALTIME_URL;
  const secret = process.env.NEON_REALTIME_SECRET;
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url || !secret || !databaseUrl) throw new HttpError(503, "realtime_unavailable");
  const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  const realtime = createRealtime({ secret, db });
  const query = rawSql<{ id: string; seq: string }>(
    `SELECT s.id, s.seq FROM shop s
     JOIN business b ON b.id = s."businessId" AND b.status = 'ACTIVE'
     JOIN "user" u ON u.id = $2 AND u."deactivatedAt" IS NULL
     WHERE s.id = $1 AND (
       EXISTS (SELECT 1 FROM business_member bm WHERE bm."businessId" = s."businessId"
         AND bm."userId" = u.id AND bm."deletedAt" IS NULL AND bm."disabledAt" IS NULL)
       OR EXISTS (SELECT 1 FROM membership m WHERE m."shopId" = s.id
         AND m."userId" = u.id AND m."deletedAt" IS NULL AND m."disabledAt" IS NULL)
     )`,
    [ctx.shopId, ctx.user.id],
  );
  return json({ url, sealed: await realtime.seal({ query }) }, { headers: { "cache-control": "no-store" } });
});
