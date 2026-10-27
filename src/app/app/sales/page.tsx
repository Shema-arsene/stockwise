"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, FilterX, Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Money, PageHeader, RequirePermission, useMoney } from "@/components/app/page-parts";
import { useShop } from "@/components/app/shop-context";
import { addDays, dayKey, downloadText, presetRange, startOfDay, toCsv, type Preset } from "@/lib/reports";
import type { Sale } from "@/lib/sync/tables";
import { cn } from "@/lib/utils";

const PAGE = 50;
type Period = Preset | "custom" | "all";
type PaymentFilter = "ALL" | Sale["paymentType"];
type StatusFilter = "all" | "completed" | "unpaid" | "voided";

interface Row {
  sale: Sale;
  customer: string | null;
  items: number;
  balance: number; // still owed on this sale (credit), before later debt payments
}

export default function SalesPage() {
  return (
    <RequirePermission permission="sale.create">
      <SalesList />
    </RequirePermission>
  );
}

function SalesList() {
  const t = useTranslations("sales");
  const tl = useTranslations("salesList");
  const tr = useTranslations("reports");
  const tc = useTranslations("common");
  const format = useFormatter();
  const money = useMoney();
  const { db, members, memberName, can, shop } = useShop();
  const router = useRouter();

  const [period, setPeriod] = useState<Period>("last7");
  const [from, setFrom] = useState(dayKey(addDays(new Date(), -30)));
  const [to, setTo] = useState(dayKey(new Date()));
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<PaymentFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [staff, setStaff] = useState("all");
  const [limit, setLimit] = useState(PAGE);

  const range = useMemo(() => {
    if (period === "all") return null;
    if (period === "custom") return { from: startOfDay(new Date(from + "T00:00")), to: addDays(startOfDay(new Date(to + "T00:00")), 1) };
    return presetRange(period);
  }, [period, from, to]);

  // Everything in the period, newest first, with customer names and item counts.
  const rows = useLiveQuery(async (): Promise<Row[]> => {
    const sales = range
      ? await db.sales.where("soldAt").between(range.from.toISOString(), range.to.toISOString(), true, false).reverse().toArray()
      : await db.sales.orderBy("soldAt").reverse().toArray();
    const [customers, items] = await Promise.all([
      db.customers.toArray(),
      db.saleItems.where("saleId").anyOf(sales.map((s) => s.id)).toArray(),
    ]);
    const names = new Map(customers.map((c) => [c.id, c.name]));
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.saleId, (counts.get(i.saleId) ?? 0) + 1);
    return sales.map((s) => ({
      sale: s,
      customer: s.customerId ? (names.get(s.customerId) ?? null) : null,
      items: counts.get(s.id) ?? 0,
      balance: s.voidedAt ? 0 : s.total - s.amountPaid,
    }));
  }, [db, range?.from.getTime(), range?.to.getTime()]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(({ sale, customer, balance }) => {
      if (payment !== "ALL" && sale.paymentType !== payment) return false;
      if (status === "voided" && !sale.voidedAt) return false;
      if (status === "completed" && sale.voidedAt) return false;
      if (status === "unpaid" && !(balance > 0)) return false;
      if (staff !== "all" && sale.userId !== staff) return false;
      if (q && !sale.number.toLowerCase().includes(q) && !(customer ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, payment, status, staff]);

  const totals = useMemo(() => {
    const live = filtered.filter((r) => !r.sale.voidedAt);
    const total = live.reduce((s, r) => s + r.sale.total, 0);
    return {
      count: live.length,
      total,
      average: live.length ? Math.round(total / live.length) : 0,
      profit: live.reduce((s, r) => s + r.sale.subtotal - r.sale.costTotal, 0),
      unpaid: live.reduce((s, r) => s + Math.max(r.balance, 0), 0),
    };
  }, [filtered]);

  const filtersActive = query || payment !== "ALL" || status !== "all" || staff !== "all";
  const clearFilters = () => {
    setQuery("");
    setPayment("ALL");
    setStatus("all");
    setStaff("all");
  };

  const visible = filtered.slice(0, limit);
  const groups = useMemo(() => {
    const out: { key: string; date: Date; rows: Row[]; total: number }[] = [];
    for (const r of visible) {
      const d = new Date(r.sale.soldAt);
      const key = d.toDateString();
      let g = out[out.length - 1];
      if (!g || g.key !== key) out.push((g = { key, date: d, rows: [], total: 0 }));
      g.rows.push(r);
      if (!r.sale.voidedAt) g.total += r.sale.total;
    }
    return out;
  }, [visible]);

  function exportCsv() {
    const header = [tl("csv.receipt"), tl("csv.date"), t("customer"), t("payment"), t("items"), t("subtotal"), "VAT", t("total"), t("paidAmount"), t("balanceDue"), tl("csv.servedBy"), tl("csv.status")];
    const lines = filtered.map(({ sale, customer, items, balance }) => [
      sale.number,
      sale.soldAt,
      customer ?? "",
      t(sale.paymentType),
      items,
      (sale.subtotal / 100).toFixed(2),
      (sale.vatAmount / 100).toFixed(2),
      (sale.total / 100).toFixed(2),
      (sale.amountPaid / 100).toFixed(2),
      (Math.max(balance, 0) / 100).toFixed(2),
      memberName(sale.userId),
      sale.voidedAt ? tc("voided") : balance > 0 ? tl("status.unpaid") : tl("status.completed"),
    ]);
    const suffix = range ? `${dayKey(range.from)}_${dayKey(addDays(range.to, -1))}` : "all";
    downloadText(`sales_${shop.name.replace(/\W+/g, "-")}_${suffix}.csv`, toCsv([header, ...lines]));
  }

  const statusBadge = (r: Row) =>
    r.sale.voidedAt ? (
      <Badge variant="outline" className="text-muted-foreground">{tc("voided")}</Badge>
    ) : r.balance > 0 ? (
      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">{tl("status.unpaid")}</Badge>
    ) : (
      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">{tl("status.completed")}</Badge>
    );

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={tl("subtitle")}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download />
              <span className="sr-only sm:not-sr-only">{tc("exportCsv")}</span>
            </Button>
            <Button asChild>
              <Link href="/app/sales/new">
                <Plus />
                <span className="sr-only sm:not-sr-only">{t("new")}</span>
              </Link>
            </Button>
          </>
        }
      />

      {/* Period */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={tr("range")}>
        {(["today", "yesterday", "last7", "thisMonth", "lastMonth", "custom", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setPeriod(p);
              setLimit(PAGE);
            }}
            aria-pressed={period === p}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", period === p ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {p === "all" ? tl("allTime") : tr(p)}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="mb-3 grid max-w-sm grid-cols-2 gap-2">
          <Input type="date" aria-label={tr("from")} value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10" />
          <Input type="date" aria-label={tr("to")} value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10" />
        </div>
      )}

      {/* Search + filters */}
      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder={tl("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 pl-9" aria-label={tc("search")} />
        </div>
        <Select value={payment} onValueChange={(v) => setPayment(v as PaymentFilter)}>
          <SelectTrigger className="h-10 w-full" aria-label={t("payment")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{tl("allPayments")}</SelectItem>
            {(["CASH", "MOBILE_MONEY", "CREDIT"] as const).map((p) => (
              <SelectItem key={p} value={p}>
                {t(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-10 w-full" aria-label={tl("csv.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["all", "completed", "unpaid", "voided"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {tl(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={staff} onValueChange={setStaff}>
          <SelectTrigger className="h-10 w-full" aria-label={tl("csv.servedBy")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tl("allStaff")}</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive ? (
          <Button variant="ghost" className="h-10" onClick={clearFilters}>
            <FilterX />
            {tl("clear")}
          </Button>
        ) : (
          <span className="hidden lg:block" />
        )}
      </div>

      {rows === undefined ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Totals for what is shown */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Summary label={tl("count")} value={format.number(totals.count)} />
            <Summary label={tl("totalSales")} value={money(totals.total)} strong />
            <Summary label={tl("average")} value={money(totals.average)} />
            {can("cost.view") ? <Summary label={t("profit")} value={money(totals.profit)} /> : <Summary label={tl("unpaidCredit")} value={money(totals.unpaid)} />}
          </div>

          {filtered.length === 0 ? (
            rows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={t("empty")}
                hint={t("emptyHint")}
                action={
                  <Button asChild>
                    <Link href="/app/sales/new">
                      <Plus />
                      {t("new")}
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                {tl("noMatch")}
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <FilterX />
                  {tl("clear")}
                </Button>
              </div>
            )
          ) : (
            <>
              {/* Large screens: one readable table */}
              <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tl("csv.receipt")}</TableHead>
                      <TableHead>{tl("csv.date")}</TableHead>
                      <TableHead>{t("customer")}</TableHead>
                      <TableHead>{t("payment")}</TableHead>
                      <TableHead className="text-right">{t("items")}</TableHead>
                      <TableHead>{tl("csv.servedBy")}</TableHead>
                      <TableHead>{tl("csv.status")}</TableHead>
                      <TableHead className="text-right">{t("total")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => (
                      <TableRow key={r.sale.id} className="cursor-pointer" onClick={() => router.push(`/app/sales/view?id=${r.sale.id}`)}>
                        <TableCell className="font-medium">
                          <Link href={`/app/sales/view?id=${r.sale.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            #{r.sale.number}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{format.dateTime(new Date(r.sale.soldAt), { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                        <TableCell className="max-w-40 truncate">{r.customer ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{t(r.sale.paymentType)}</TableCell>
                        <TableCell className="text-right tabular">{r.items}</TableCell>
                        <TableCell className="max-w-32 truncate text-muted-foreground">{memberName(r.sale.userId)}</TableCell>
                        <TableCell>{statusBadge(r)}</TableCell>
                        <TableCell className="text-right">
                          <Money value={r.sale.total} className={cn("font-medium", r.sale.voidedAt && "text-muted-foreground line-through")} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Phones: cards grouped by day */}
              <div className="space-y-6 md:hidden">
                {groups.map((g) => (
                  <section key={g.key}>
                    <div className="mb-2 flex items-baseline justify-between px-1">
                      <h2 className="text-sm font-medium text-muted-foreground">{format.dateTime(g.date, { weekday: "long", day: "numeric", month: "long" })}</h2>
                      <Money value={g.total} className="text-sm font-semibold" />
                    </div>
                    <ul className="divide-y rounded-xl border bg-card">
                      {g.rows.map((r) => (
                        <li key={r.sale.id}>
                          <Link href={`/app/sales/view?id=${r.sale.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{r.customer ?? `#${r.sale.number}`}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {format.dateTime(new Date(r.sale.soldAt), { timeStyle: "short" })} · {t(r.sale.paymentType)} · {tl("itemsCount", { count: r.items })} · {memberName(r.sale.userId)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Money value={r.sale.total} className={cn("font-semibold", r.sale.voidedAt && "text-muted-foreground line-through")} />
                              {(r.sale.voidedAt || r.balance > 0) && statusBadge(r)}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <p className="mt-4 text-center text-xs text-muted-foreground">{tl("showing", { shown: visible.length, total: filtered.length })}</p>
              {filtered.length > limit && (
                <Button variant="outline" className="mt-3 w-full" onClick={() => setLimit((l) => l + PAGE)}>
                  {tl("loadMore")}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 tabular", strong ? "text-xl font-bold" : "text-lg font-semibold")}>{value}</p>
    </div>
  );
}
