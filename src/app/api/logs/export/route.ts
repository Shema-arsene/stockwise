import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { handle, requirePlatform, requireShop } from "@/lib/api/context";
import { logActivity } from "@/lib/api/activity";
import { prisma } from "@/lib/db/prisma";
import { activityDetails, activitySentence, normaliseRole, type ActivityTranslator } from "@/lib/activity-text";
import { toCsv } from "@/lib/reports";
import en from "@/i18n/messages/en.json";
import fr from "@/i18n/messages/fr.json";
import { rateLimit } from "@/lib/api/rate-limit";

const MESSAGES = { en, fr } as const;
const BATCH = 2000;

const querySchema = z.object({
  scope: z.enum(["business", "platform"]).default("business"),
  businessId: z.string().optional(), // platform scope only
  shopId: z.string().optional(),
  from: z.iso.datetime({ offset: true }).optional(), // omit both for the entire history
  to: z.iso.datetime({ offset: true }).optional(),
  locale: z.enum(["en", "fr"]).default("en"),
  tz: z.string().max(64).default("Africa/Lusaka"),
});

/**
 * Detailed activity log as CSV for a chosen period (or the whole history). Owners and managers
 * export their shop; the founder and super admins can export everything. Streamed in batches so
 * years of history don't have to fit in memory. The export itself is logged.
 */
export const GET = handle(async (req: Request) => {
  const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  let tz = q.tz;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "Africa/Lusaka";
  }

  const where: Prisma.ActivityLogWhereInput = {};
  let actor;
  if (q.scope === "platform") {
    const user = await requirePlatform(req, "logs.view.all");
    await rateLimit("export", user.id);
    actor = { id: user.id, name: user.name, role: user.platformRole, ip: user.ip };
    if (q.businessId) where.businessId = q.businessId;
  } else {
    const ctx = await requireShop(req, "logs.view.business");
    await rateLimit("export", ctx.user.id);
    actor = { id: ctx.user.id, name: ctx.user.name, role: ctx.role, ip: ctx.user.ip };
    where.businessId = ctx.businessId;
  }
  if (q.shopId) where.shopId = q.shopId;
  if (q.from || q.to) where.at = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) };

  const t = createTranslator({ locale: q.locale, messages: MESSAGES[q.locale], namespace: "activity" }) as unknown as ActivityTranslator;
  const tRoles = createTranslator({ locale: q.locale, messages: MESSAGES[q.locale], namespace: "staff.roles" });
  const tPlatform = createTranslator({ locale: q.locale, messages: MESSAGES[q.locale], namespace: "platform" });
  const roleLabel = (r: string) =>
    r === "FOUNDER" || r === "SUPER_ADMIN" ? tPlatform(r) : ["OWNER", "MANAGER", "CASHIER"].includes(r) ? tRoles(r as "OWNER") : r;
  const col = (k: string) => t(`export.columns.${k}`, { tz });

  // "2026-10-21 14:03:22" in the viewer's timezone: sorts and filters well in spreadsheets.
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const stamp = (d: Date | null) => (d ? fmt.format(d).replace(",", "") : "");

  const logins = new Map<string, string>();
  const shopNames = new Map<string, string>();
  const businessNames = new Map<string, string>();

  await logActivity(actor, { action: "logs.export", businessId: where.businessId as string | undefined, summary: { from: q.from ?? null, to: q.to ?? null, shopId: q.shopId ?? null } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            toCsv([["time", "deviceTime", "person", "login", "role", "shop", "branch", "action", "details", "actionCode", "record", "device", "ip"].map(col)]),
          ),
        );
        let cursor: string | undefined;
        for (;;) {
          const rows = await prisma.activityLog.findMany({
            where,
            orderBy: [{ at: "asc" }, { id: "asc" }],
            take: BATCH,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          if (!rows.length) break;

          // Resolve names for this batch in three queries.
          const userIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x && !logins.has(x)))];
          const shopIds = [...new Set(rows.map((r) => r.shopId).filter((x): x is string => !!x && !shopNames.has(x)))];
          const bizIds = [...new Set(rows.map((r) => r.businessId).filter((x): x is string => !!x && !businessNames.has(x)))];
          const [users, shops, businesses] = await Promise.all([
            prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, username: true, managedByBusinessId: true } }),
            prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } }),
            prisma.business.findMany({ where: { id: { in: bizIds } }, select: { id: true, name: true } }),
          ]);
          users.forEach((u) => logins.set(u.id, u.username ?? (u.managedByBusinessId ? "" : u.email)));
          shops.forEach((s) => shopNames.set(s.id, s.name));
          businesses.forEach((b) => businessNames.set(b.id, b.name));

          const lines = rows.map((r) => {
            const role = normaliseRole(r.actorRole);
            const offline = r.clientAt && Math.abs(r.at.getTime() - r.clientAt.getTime()) > 2 * 60_000 ? stamp(r.clientAt) : "";
            return [
              stamp(r.at),
              offline,
              r.actorName ?? "",
              (r.actorId && logins.get(r.actorId)) ?? "",
              role ? roleLabel(role) : "",
              (r.businessId && businessNames.get(r.businessId)) ?? "",
              (r.shopId && shopNames.get(r.shopId)) ?? "",
              activitySentence(t, r, q.locale, roleLabel),
              activityDetails(r, q.locale, roleLabel),
              r.action,
              r.entityId ?? "",
              r.deviceId ?? "",
              r.ip ?? "",
            ];
          });
          // toCsv adds a byte-order mark; only the first chunk (the header) should have one.
          controller.enqueue(encoder.encode("\r\n" + toCsv(lines).replace(/^﻿/, "")));
          cursor = rows[rows.length - 1].id;
          if (rows.length < BATCH) break;
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  const day = (iso?: string) => (iso ? iso.slice(0, 10) : "all");
  const name = q.from || q.to ? `stockwise-activity_${day(q.from)}_${day(q.to)}.csv` : "stockwise-activity_entire-history.csv";
  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
});
