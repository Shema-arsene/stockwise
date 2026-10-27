"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import { apiStatus, http, isNetworkError } from "@/lib/http";
import { addDays, dayKey, startOfDay } from "@/lib/reports";
import { useLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

type Preset = "thisMonth" | "lastMonth" | "last30" | "thisYear" | "custom" | "entire";

export interface ScopeOption {
  value: string; // "branch" | "shop" | "platform" | "platform:<businessId>"
  label: string;
}

/**
 * Generate a report (PDF or Excel) for a chosen scope and period. Used by owners and managers on
 * the Reports page, and by the founder / super admins in the Platform console.
 */
export function ReportDialog({ open, onOpenChange, scopes }: { open: boolean; onOpenChange: (o: boolean) => void; scopes: ScopeOption[] }) {
  const t = useTranslations("reportsGen");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [scope, setScope] = useState(scopes[0]?.value ?? "branch");
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [from, setFrom] = useState(dayKey(addDays(new Date(), -30)));
  const [to, setTo] = useState(dayKey(new Date()));
  const [pending, setPending] = useState(false);

  function range(): { from?: Date; to?: Date } {
    const today = startOfDay(new Date());
    switch (preset) {
      case "thisMonth":
        return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
      case "lastMonth":
        return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
      case "last30":
        return { from: addDays(today, -29), to: addDays(today, 1) };
      case "thisYear":
        return { from: new Date(today.getFullYear(), 0, 1), to: addDays(today, 1) };
      case "custom":
        return { from: startOfDay(new Date(from + "T00:00")), to: addDays(startOfDay(new Date(to + "T00:00")), 1) };
      case "entire":
        return {};
    }
  }

  async function generate() {
    setPending(true);
    try {
      const r = range();
      const [scopeKind, businessId] = scope.split(":");
      const res = await http.get<Blob>("/reports/export", {
        params: {
          format,
          scope: scopeKind,
          businessId,
          from: r.from?.toISOString(),
          to: r.to?.toISOString(),
          locale,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        responseType: "blob",
        timeout: 2 * 60_000,
      });
      const name = /filename="([^"]+)"/.exec(String(res.headers["content-disposition"] ?? ""))?.[1] ?? `stockwise-report.${format}`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(t("ready"));
      onOpenChange(false);
    } catch (err) {
      toast.error(isNetworkError(err) ? tc("needsInternet") : apiStatus(err) === 404 ? t("nothing") : apiStatus(err) === 429 ? tc("rateLimited") : tc("somethingWrong"));
    } finally {
      setPending(false);
    }
  }

  const chip = (active: boolean) => cn("rounded-full border px-3 py-1.5 text-sm", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <Field label={t("format")}>
            <div className="grid grid-cols-2 gap-2">
              {(["pdf", "xlsx"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={format === f}
                  onClick={() => setFormat(f)}
                  className={cn("flex items-center gap-3 rounded-xl border p-3 text-left", format === f ? "border-primary bg-primary/5" : "hover:bg-muted")}
                >
                  {f === "pdf" ? <FileText className="size-6 text-red-600" /> : <FileSpreadsheet className="size-6 text-green-700" />}
                  <span>
                    <span className="block text-sm font-semibold">{t(`${f}.name`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`${f}.hint`)}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {scopes.length > 1 && (
            <Field label={t("scope")}>
              <div className="flex flex-wrap gap-2">
                {scopes.map((s) => (
                  <button key={s.value} type="button" aria-pressed={scope === s.value} onClick={() => setScope(s.value)} className={chip(scope === s.value)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label={t("period")}>
            <div className="flex flex-wrap gap-2">
              {(["thisMonth", "lastMonth", "last30", "thisYear", "custom", "entire"] as const).map((p) => (
                <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)} className={chip(preset === p)}>
                  {t(`presets.${p}`)}
                </button>
              ))}
            </div>
          </Field>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("from")} htmlFor="rep-from">
                <Input id="rep-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10" />
              </Field>
              <Field label={t("to")} htmlFor="rep-to">
                <Input id="rep-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10" />
              </Field>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void generate()} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : format === "pdf" ? <FileText /> : <FileSpreadsheet />}
            {pending ? t("generating") : t("generate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
