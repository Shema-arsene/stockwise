import "server-only";
import { HttpError, requirePlatform, requireShop } from "./context";
import { manageableShopIds } from "./people";
import { rateLimit } from "./rate-limit";
import type { ReportUnit } from "./report-data";
import type { Label } from "./report-render";
import { prisma } from "@/lib/db/prisma";

interface ScopeQuery {
  scope: "branch" | "shop" | "platform";
  businessId?: string;
}

/** Resolve report scope and permissions before any report data is loaded. */
export async function resolveReportScope(req: Request, q: ScopeQuery, t: Label) {
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
    title = q.scope === "branch" || shops.length === 1
      ? `${business.name} — ${shops[0]?.name ?? ""}`
      : `${business.name} — ${allBranches ? t("allBranches") : t("myBranches")}`;
  }
  if (!units.length) throw new HttpError(404, "nothing_to_report");
  return { units, title, unitKind, detailLists, actor, logBusinessId };
}
