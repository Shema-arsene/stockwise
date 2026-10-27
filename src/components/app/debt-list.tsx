"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowDownUp, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { MoneyInput } from "@/components/app/inputs";
import { Money } from "@/components/app/page-parts";
import { DEBT_FILTER_DEFAULTS as DEFAULTS, filterDebts, type DebtFilters as Filters, type DebtRow } from "@/lib/debt-filter";
import { toNgwee } from "@/lib/money";
import { cn } from "@/lib/utils";

export type { DebtRow };
type Age = Filters["age"];
type Activity = Filters["activity"];
type Sort = Filters["sort"];
const DAY = 86_400_000;
const daysSince = (iso: string | null, now: number) => (iso ? (now - Date.parse(iso)) / DAY : Infinity);

/**
 * A searchable, filterable list of balances with a summary card. Used for both
 * "Customers owe you" and "You owe suppliers" on the Debts page.
 */
export function DebtList({
  rows,
  kind,
  empty,
}: {
  rows: DebtRow[] | undefined;
  kind: "customers" | "suppliers";
  empty: React.ReactNode;
}) {
  const t = useTranslations("debts");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [f, setF] = useState<Filters>(DEFAULTS);
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const visible = useMemo(() => (rows ? filterDebts(rows, f, now) : []), [rows, f, now]);
  const active = (["status", "age", "activity", "min", "max"] as const).filter((k) => f[k] !== DEFAULTS[k]).length;
  const minBad = f.min.trim() !== "" && toNgwee(f.min) === null;
  const maxBad = f.max.trim() !== "" && toNgwee(f.max) === null;

  // Totals of everyone who owes (unfiltered), for the summary card.
  const totals = useMemo(() => {
    const out = { owed: 0, d0_30: 0, d31_60: 0, d60plus: 0, count: 0 };
    for (const r of rows ?? []) {
      if (r.owed <= 0) continue;
      out.owed += r.owed;
      out.d0_30 += r.aging.d0_30;
      out.d31_60 += r.aging.d31_60;
      out.d60plus += r.aging.d60plus;
      out.count++;
    }
    return out;
  }, [rows]);
  const filteredOwed = visible.reduce((s, r) => s + Math.max(r.owed, 0), 0);

  const buckets = [
    { key: "d0_30" as const, label: t("age.d0_30"), value: totals.d0_30, tone: "bg-primary" },
    { key: "d31_60" as const, label: t("age.d31_60"), value: totals.d31_60, tone: "bg-amber-500" },
    { key: "d60plus" as const, label: t("age.d60plus"), value: totals.d60plus, tone: "bg-destructive" },
  ];

  if (rows === undefined) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-36 w-full rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <>{empty}</>;

  return (
    <>
      {totals.owed > 0 && (
        <section className="mb-4 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t(`${kind}.total`)}</p>
          <Money value={totals.owed} className="mt-1 block text-3xl font-semibold" />
          <p className="text-xs text-muted-foreground">{t(`${kind}.count`, { count: totals.count })}</p>
          <p className="mt-4 mb-2 text-xs font-medium text-muted-foreground">{t("aging")}</p>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("aging")}>
            {buckets.map((b) => b.value > 0 && <div key={b.key} className={b.tone} style={{ width: `${(b.value / totals.owed) * 100}%` }} />)}
          </div>
          {/* Each age bucket doubles as a quick filter. */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {buckets.map((b) => (
              <button
                key={b.key}
                type="button"
                aria-pressed={f.age === b.key}
                onClick={() => setF((prev) => ({ ...prev, status: "owing", age: prev.age === b.key ? "any" : b.key }))}
                className={cn("rounded-lg p-1.5 text-left transition-colors hover:bg-muted", f.age === b.key && "bg-muted ring-1 ring-foreground/15")}
              >
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={cn("size-2 rounded-full", b.tone)} />
                  {b.label}
                </span>
                <Money value={b.value} className="text-sm font-medium" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mb-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("search")}
            placeholder={t("search")}
            value={f.query}
            onChange={(e) => set("query", e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <Button variant={open || active ? "secondary" : "outline"} className="h-10 shrink-0" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <SlidersHorizontal />
          <span className="sr-only sm:not-sr-only">{t("filters")}</span>
          {active > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{active}</span>}
        </Button>
      </div>

      {/* Status chips are always visible; the rest sit behind the Filters button. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["owing", "settled", "overpaid", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={f.status === s}
            onClick={() => set("status", s)}
            className={cn("rounded-full border px-3 py-1 text-sm", f.status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {t(`status.${s}`)}
          </button>
        ))}
      </div>

      {open && (
        <section className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("filters")}>
          <Field label={t("ageLabel")}>
            <Select value={f.age} onValueChange={(v) => set("age", v as Age)}>
              <SelectTrigger className="h-10 w-full" aria-label={t("ageLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("age.any")}</SelectItem>
                <SelectItem value="d0_30">{t("age.d0_30")}</SelectItem>
                <SelectItem value="d31_60">{t("age.d31_60")}</SelectItem>
                <SelectItem value="d60plus">{t("age.d60plus")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("activityLabel")}>
            <Select value={f.activity} onValueChange={(v) => set("activity", v as Activity)}>
              <SelectTrigger className="h-10 w-full" aria-label={t("activityLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["any", "week", "month", "quiet90"] as const).map((a) => (
                  <SelectItem key={a} value={a}>
                    {t(`activity.${a}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("minAmount")} htmlFor={`${kind}-min`} error={minBad ? tc("invalidAmount") : undefined}>
            <MoneyInput id={`${kind}-min`} value={f.min} onChange={(e) => set("min", e.target.value)} aria-invalid={minBad} />
          </Field>
          <Field label={t("maxAmount")} htmlFor={`${kind}-max`} error={maxBad ? tc("invalidAmount") : undefined}>
            <MoneyInput id={`${kind}-max`} value={f.max} onChange={(e) => set("max", e.target.value)} aria-invalid={maxBad} />
          </Field>
        </section>
      )}

      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {t("results", { count: visible.length })}
          {visible.length > 0 && f.status !== "settled" && (
            <>
              {" · "}
              <Money value={filteredOwed} className="font-medium text-foreground" />
            </>
          )}
        </p>
        <div className="flex items-center gap-1">
          {(active > 0 || f.query) && (
            <Button variant="ghost" size="sm" onClick={() => setF({ ...DEFAULTS, sort: f.sort })}>
              <X />
              {t("clear")}
            </Button>
          )}
          <Select value={f.sort} onValueChange={(v) => set("sort", v as Sort)}>
            <SelectTrigger size="sm" className="w-auto gap-1" aria-label={t("sortLabel")}>
              <ArrowDownUp className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {(["amount", "oldest", "name", "recent"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`sort.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((r) => {
            const oldDays = r.owed > 0 ? daysSince(r.aging.oldestUnpaidAt, now) : 0;
            return (
              <li key={r.id}>
                <Link href={r.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase">{r.name.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        r.owed > 0 && r.aging.oldestUnpaidAt ? t("oldest", { time: format.relativeTime(new Date(r.aging.oldestUnpaidAt), new Date()) }) : null,
                        r.lastActivityAt ? t("lastActivity", { time: format.relativeTime(new Date(r.lastActivityAt), new Date()) }) : null,
                        r.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ") || " "}
                    </p>
                  </div>
                  {r.owed > 0 ? (
                    <Money value={r.owed} className={cn("text-sm font-semibold", oldDays > 60 ? "text-destructive" : oldDays > 30 ? "text-amber-700 dark:text-amber-400" : "")} />
                  ) : r.owed < 0 ? (
                    <span className="text-right text-xs text-muted-foreground">
                      {t("status.overpaid")}
                      <Money value={-r.owed} className="block text-sm font-medium text-foreground" />
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("status.settled")}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
