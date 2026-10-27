"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Ban,
  Boxes,
  Building2,
  Download,
  HandCoins,
  KeyRound,
  Loader2,
  type LucideIcon,
  Receipt,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import { apiStatus, http, isNetworkError } from "@/lib/http";
import { activitySentence, normaliseRole, type ActivityTranslator } from "@/lib/activity-text";
import { addDays, dayKey, startOfDay } from "@/lib/reports";
import { useLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

export interface ActivityEntry {
  id: string;
  at: string;
  clientAt: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  businessId: string | null;
  shopId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  summary: Record<string, unknown> | null;
  deviceId: string | null;
}

interface LogsPage {
  entries: ActivityEntry[];
  shopNames: Record<string, string>;
  businessNames: Record<string, string>;
  next: string | null;
}

const GROUPS = ["sale", "payment", "stock", "purchase", "product", "staff", "account", "settings", "reports", "auth", "platform"] as const;

const ICONS: Record<string, LucideIcon> = {
  sale: Receipt,
  payment: HandCoins,
  stock: Boxes,
  purchase: Truck,
  product: Boxes,
  category: Boxes,
  customer: HandCoins,
  supplier: Truck,
  staff: UserCog,
  account: UserCog,
  settings: Settings,
  shop: Building2,
  business: Building2,
  auth: KeyRound,
  platform: ShieldCheck,
  sync: WifiOff,
  logs: Download,
  reports: Download,
};

/** Translates any role code (including legacy "ADMIN") for display. */
export function useRoleLabel() {
  const tStaff = useTranslations("staff");
  const tPlatform = useTranslations("platform");
  return (role: string) => {
    const r = normaliseRole(role) ?? role;
    if (r === "FOUNDER" || r === "SUPER_ADMIN") return tPlatform(r);
    if (r === "OWNER" || r === "MANAGER" || r === "CASHIER") return tStaff(`roles.${r}`);
    return r;
  };
}

/**
 * Read-only timeline of the activity log (needs internet; logs are not synced to devices).
 * scope "business": the current shop. scope "platform": the whole app (founder/super admin).
 */
export function ActivityFeed({
  scope,
  businessId,
  shops,
}: {
  scope: "business" | "platform";
  businessId?: string;
  shops?: { id: string; name: string }[];
}) {
  const t = useTranslations("activity");
  const tc = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const roleLabel = useRoleLabel();
  const [group, setGroup] = useState<string>("all");
  const [shopId, setShopId] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ["logs", scope, businessId, group, shopId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await http.get<LogsPage>("/logs", {
          params: {
            scope,
            businessId,
            action: group === "all" ? undefined : group,
            shopId: shopId === "all" ? undefined : shopId,
            before: pageParam ?? undefined,
          },
        })
      ).data,
    getNextPageParam: (last) => last.next,
  });

  const pages = query.data?.pages ?? [];
  const entries = pages.flatMap((p) => p.entries);
  const shopNames = Object.assign({}, ...pages.map((p) => p.shopNames)) as Record<string, string>;
  const businessNames = Object.assign({}, ...pages.map((p) => p.businessNames)) as Record<string, string>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allActions")}</SelectItem>
            {GROUPS.filter((g) => scope === "platform" || g !== "platform").map((g) => (
              <SelectItem key={g} value={g}>
                {t(`filters.${g}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {shops && shops.length > 1 && (
          <Select value={shopId} onValueChange={setShopId}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allShops")}</SelectItem>
              {shops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" className="ml-auto h-9" onClick={() => setExportOpen(true)}>
          <Download />
          {t("download")}
        </Button>
      </div>

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <WifiOff className="size-6" />
          {isNetworkError(query.error) ? tc("needsInternet") : tc("somethingWrong")}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <ol className="divide-y rounded-xl border bg-card">
            {entries.map((e) => {
              const Icon = ICONS[e.action.split(".")[0]] ?? Ban;
              const at = new Date(e.at);
              const recordedOffline = e.clientAt && at.getTime() - new Date(e.clientAt).getTime() > 2 * 60_000;
              const alarming =
                e.action === "auth.sign_in_failed" || e.action === "auth.locked" || e.action.endsWith(".void") || e.action.endsWith(".delete") || e.action === "account.deactivate";
              return (
                <li key={e.id} className="flex gap-3 px-4 py-3">
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", alarming ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{e.actorName ?? "—"}</span>{" "}
                      {e.actorRole && <span className="text-xs text-muted-foreground">({roleLabel(e.actorRole)})</span>}
                    </p>
                    <p className="text-sm text-foreground/90">{activitySentence(t as unknown as ActivityTranslator, e, locale, roleLabel)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {format.dateTime(at, { dateStyle: "medium", timeStyle: "short" })}
                      {scope === "platform" && e.businessId && businessNames[e.businessId] && ` · ${businessNames[e.businessId]}`}
                      {e.shopId && shopNames[e.shopId] && ` · ${shopNames[e.shopId]}`}
                      {recordedOffline && ` · ${t("offlineAt", { time: format.dateTime(new Date(e.clientAt!), { dateStyle: "short", timeStyle: "short" }) })}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {query.hasNextPage && (
            <Button variant="outline" className="mt-4 w-full" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage && <Loader2 className="animate-spin" />}
              {t("loadMore")}
            </Button>
          )}
        </>
      )}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} scope={scope} businessId={businessId} shops={shops} />
    </div>
  );
}

type Preset = "entire" | "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";

/** Pick a period (or the entire history) and download the detailed log as CSV. */
function ExportDialog({
  open,
  onOpenChange,
  scope,
  businessId,
  shops,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: "business" | "platform";
  businessId?: string;
  shops?: { id: string; name: string }[];
}) {
  const t = useTranslations("activity.export");
  const tAct = useTranslations("activity");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(dayKey(addDays(new Date(), -30)));
  const [to, setTo] = useState(dayKey(new Date()));
  const [shopId, setShopId] = useState("all");
  const [pending, setPending] = useState(false);

  function range(): { from?: Date; to?: Date } {
    const today = startOfDay(new Date());
    switch (preset) {
      case "entire":
        return {};
      case "today":
        return { from: today, to: addDays(today, 1) };
      case "last7":
        return { from: addDays(today, -6), to: addDays(today, 1) };
      case "last30":
        return { from: addDays(today, -29), to: addDays(today, 1) };
      case "thisMonth":
        return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
      case "lastMonth":
        return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
      case "custom":
        return { from: startOfDay(new Date(from + "T00:00")), to: addDays(startOfDay(new Date(to + "T00:00")), 1) };
    }
  }

  async function download() {
    setPending(true);
    try {
      const r = range();
      const res = await http.get<Blob>("/logs/export", {
        params: {
          scope,
          businessId,
          shopId: shopId === "all" ? undefined : shopId,
          from: r.from?.toISOString(),
          to: r.to?.toISOString(),
          locale,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        responseType: "blob",
        timeout: 5 * 60_000,
      });
      const name = /filename="([^"]+)"/.exec(String(res.headers["content-disposition"] ?? ""))?.[1] ?? "stockwise-activity.csv";
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(t("done"));
      onOpenChange(false);
    } catch (err) {
      toast.error(isNetworkError(err) ? tc("needsInternet") : apiStatus(err) === 429 ? tc("rateLimited") : tc("somethingWrong"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={t("range")}>
            <div className="flex flex-wrap gap-2">
              {(["entire", "today", "last7", "last30", "thisMonth", "lastMonth", "custom"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  aria-pressed={preset === p}
                  className={cn("rounded-full border px-3 py-1 text-sm", preset === p ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {t(p)}
                </button>
              ))}
            </div>
          </Field>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("from")} htmlFor="exp-from">
                <Input id="exp-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10" />
              </Field>
              <Field label={t("to")} htmlFor="exp-to">
                <Input id="exp-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10" />
              </Field>
            </div>
          )}
          {shops && shops.length > 1 && (
            <Field label={t("branch")}>
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tAct("allShops")}</SelectItem>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void download()} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Download />}
            {pending ? t("downloading") : t("download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
