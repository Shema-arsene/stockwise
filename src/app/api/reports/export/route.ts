import { createTranslator } from "next-intl";
import { z } from "zod";
import { HttpError, handle, requirePlatform, requireShop } from "@/lib/api/context";
import { logActivity } from "@/lib/api/activity";
import { manageableShopIds } from "@/lib/api/people";
import { buildReport, type ReportUnit } from "@/lib/api/report-data";
import { formatters, renderPdf, renderXlsx, type Label } from "@/lib/api/report-render";
import { prisma } from "@/lib/db/prisma";
import en from "@/i18n/messages/en.json";
import fr from "@/i18n/messages/fr.json";
import { rateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MESSAGES = { en, fr } as const;

const querySchema = z.object({
  format: z.enum(["pdf", "xlsx"]).default("pdf"),
  /**
   * branch:   the current branch
   * shop:     every branch the person may see in the current shop (owner: all; manager: theirs)
   * platform: founder / super admin — one shop (businessId) or every shop
   */
  scope: z.enum(["branch", "shop", "platform"]).default("branch"),
  businessId: z.string().optional(),
  from: z.iso.datetime({ offset: true }).optional(), // omit both for the entire history
  to: z.iso.datetime({ offset: true }).optional(),
  locale: z.enum(["en", "fr"]).default("en"),
  tz: z.string().max(64).default("Africa/Lusaka"),
});

/** Generates a sales, profit, debt and stock report as PDF or Excel for owners, managers and StockWise staff. */
export const GET = handle(async (req: Request) => {
  const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  let tz = q.tz;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "Africa/Lusaka";
  }
  const t = createTranslator({ locale: q.locale, messages: MESSAGES[q.locale], namespace: "reportDoc" }) as unknown as Label;

  let units: ReportUnit[];
  let title: string;
  let unitKind: "branch" | "shop" = "branch";
  let detailLists = true;
  let actor: { id: string; name: string; role: string | null; ip: string | null };
  let logBusinessId: string | null = null;

  if (q.scope === "platform") {
    const user = await requirePlatform(req, "platform.view");
    await rateLimit("export", user.id);
    actor = { id: user.id, name: user.name, role: user.platformRole, ip: user.ip };
    if (q.businessId) {
      const b = await prisma.business.findUnique({ where: { id: q.businessId }, include: { shops: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } } } });
      if (!b) throw new HttpError(404, "not_found");
      units = b.shops.map((s) => ({ id: s.id, name: s.name, shopIds: [s.id] }));
      title = `${b.name} — ${t("allBranches")}`;
      logBusinessId = b.id;
    } else {
      const all = await prisma.business.findMany({
        include: { shops: { select: { id: true } }, members: { where: { role: "OWNER" }, include: { user: { select: { name: true } } } } },
        orderBy: { name: "asc" },
      });
      units = all.filter((b) => b.shops.length).map((b) => ({ id: b.id, name: b.name, owner: b.members[0]?.user.name ?? null, shopIds: b.shops.map((s) => s.id) }));
      title = t("allShops");
      unitKind = "shop";
      detailLists = false;
    }
  } else {
    const ctx = await requireShop(req, "report.view");
    await rateLimit("export", ctx.user.id);
    actor = { id: ctx.user.id, name: ctx.user.name, role: ctx.role, ip: ctx.user.ip };
    logBusinessId = ctx.businessId;
    const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { name: true } });
    const ids = q.scope === "shop" ? await manageableShopIds(ctx) : [ctx.shopId];
    const shops = await prisma.shop.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
    units = shops.map((s) => ({ id: s.id, name: s.name, shopIds: [s.id] }));
    const allBranches = q.scope === "shop" && ctx.role === "OWNER";
    title =
      q.scope === "branch" || shops.length === 1
        ? `${business.name} — ${shops[0]?.name ?? ""}`
        : `${business.name} — ${allBranches ? t("allBranches") : t("myBranches")}`;
  }
  if (!units.length) throw new HttpError(404, "nothing_to_report");

  const report = await buildReport({
    title,
    unitKind,
    units,
    from: q.from ? new Date(q.from) : null,
    to: q.to ? new Date(q.to) : null,
    tz,
    generatedBy: actor.name,
    detailLists,
  });
  const f = formatters(q.locale, tz);
  const body = q.format === "pdf" ? await renderPdf(report, t, f) : await renderXlsx(report, t, f);

  await logActivity(actor, {
    action: "reports.download",
    businessId: logBusinessId,
    summary: { format: q.format, scope: q.scope, from: q.from ?? null, to: q.to ?? null, title },
  });

  const day = (iso: string | undefined, open: string) => (iso ? iso.slice(0, 10) : open);
  const slug = title.normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
  const name = `stockwise-report_${slug}_${q.from || q.to ? `${day(q.from, "start")}_${day(q.to, "now")}` : "entire-history"}.${q.format}`;
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": q.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
});
