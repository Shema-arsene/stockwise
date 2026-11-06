import { createTranslator } from "next-intl";
import { z } from "zod";
import { handle } from "@/lib/api/context";
import { logActivity } from "@/lib/api/activity";
import { buildReport } from "@/lib/api/report-data";
import { formatters, renderPdf, renderXlsx, type Label } from "@/lib/api/report-render";
import { resolveReportScope } from "@/lib/api/report-scope";
import en from "@/i18n/messages/en.json";
import fr from "@/i18n/messages/fr.json";
import { timed } from "@/lib/api/telemetry";

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

  const { units, title, unitKind, detailLists, actor, logBusinessId } =
    await timed("report.scope", () => resolveReportScope(req, q, t));

  const report = await timed("report.query", () => buildReport({
    title,
    unitKind,
    units,
    from: q.from ? new Date(q.from) : null,
    to: q.to ? new Date(q.to) : null,
    tz,
    generatedBy: actor.name,
    detailLists,
  }));
  const f = formatters(q.locale, tz);
  const body = await timed("report.render", () => q.format === "pdf" ? renderPdf(report, t, f) : renderXlsx(report, t, f));

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
