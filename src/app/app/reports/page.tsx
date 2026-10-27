"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Download, FileDown, Printer, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field } from "@/components/form-field";
import { Money, PageHeader, RequirePermission, useMoney, useQty } from "@/components/app/page-parts";
import { BarList, MoneyColumns } from "@/components/app/charts";
import { useShop } from "@/components/app/shop-context";
import { ReportDialog, type ScopeOption } from "@/components/app/report-dialog";
import { useCustomers, useProducts } from "@/lib/local/hooks";
import { lineAmount } from "@/lib/money";
import { addDays, dayKey, downloadText, presetRange, startOfDay, summarizeSales, sumPayments, sumPurchases, toCsv, type Preset, type Range } from "@/lib/reports";
import { cn } from "@/lib/utils";

const PRESETS: Preset[] = ["today", "yesterday", "last7", "thisMonth", "lastMonth"];

export default function ReportsPage() {
  return (
    <RequirePermission permission="report.view">
      <Reports />
    </RequirePermission>
  );
}

function Reports() {
  const t = useTranslations("reports");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const tp = useTranslations("products");
  const format = useFormatter();
  const money = useMoney();
  const qty = useQty();
  const { db, shop, session, role } = useShop();
  const tg = useTranslations("reportsGen");
  const [genOpen, setGenOpen] = useState(false);
  const products = useProducts();
  const customers = useCustomers();

  const [preset, setPreset] = useState<Preset | "custom">("thisMonth");
  const [customFrom, setCustomFrom] = useState(dayKey(addDays(new Date(), -30)));
  const [customTo, setCustomTo] = useState(dayKey(new Date()));
  const [showTable, setShowTable] = useState(false);

  const range: Range = useMemo(() => {
    if (preset !== "custom") return presetRange(preset);
    const from = startOfDay(new Date(customFrom + "T00:00"));
    const to = addDays(startOfDay(new Date(customTo + "T00:00")), 1);
    return to > from ? { from, to } : { from, to: addDays(from, 1) };
  }, [preset, customFrom, customTo]);

  const data = useLiveQuery(async () => {
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();
    const [sales, purchases, payments] = await Promise.all([
      db.sales.where("soldAt").between(fromIso, toIso, true, false).toArray(),
      db.purchases.where("purchasedAt").between(fromIso, toIso, true, false).toArray(),
      db.debtPayments.where("paidAt").between(fromIso, toIso, true, false).toArray(),
    ]);
    const items = await db.saleItems.where("saleId").anyOf(sales.map((s) => s.id)).toArray();
    return {
      sales,
      items,
      summary: summarizeSales(sales, items, range),
      purchases: sumPurchases(purchases),
      collected: sumPayments(payments),
    };
  }, [db, range.from.getTime(), range.to.getTime()]);

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const inventory = useMemo(() => {
    const rows = (products ?? []).map((p) => ({
      p,
      costValue: p.stock > 0 ? lineAmount(p.costPrice, p.stock) : 0,
      sellValue: p.stock > 0 ? lineAmount(p.sellPrice, p.stock) : 0,
    }));
    return {
      rows,
      cost: rows.reduce((s, r) => s + r.costValue, 0),
      sell: rows.reduce((s, r) => s + r.sellValue, 0),
    };
  }, [products]);
  const debtors = (customers ?? []).filter((c) => c.owed > 0).sort((a, b) => b.owed - a.owed);

  const rangeLabel = `${format.dateTime(range.from, { dateStyle: "medium" })} – ${format.dateTime(addDays(range.to, -1), { dateStyle: "medium" })}`;
  const fileSuffix = `${dayKey(range.from)}_${dayKey(addDays(range.to, -1))}`;

  function exportSales() {
    if (!data) return;
    const header = ["Receipt", "Date", "Product", "Qty", "Unit price", "VAT", "Line total", "Payment", "Voided"];
    const saleById = new Map(data.sales.map((s) => [s.id, s]));
    const rows = data.items.map((i) => {
      const s = saleById.get(i.saleId)!;
      return [s.number, s.soldAt, productMap.get(i.productId)?.name ?? "", i.qty, (i.unitPrice / 100).toFixed(2), (i.vatAmount / 100).toFixed(2), (i.lineTotal / 100).toFixed(2), s.paymentType, s.voidedAt ? "yes" : ""];
    });
    downloadText(`sales_${fileSuffix}.csv`, toCsv([header, ...rows]));
  }

  function exportInventory() {
    const header = ["Product", "Category", "Unit", "Stock", "Cost price", "Selling price", "Stock value (cost)", "Stock value (selling)"];
    const rows = inventory.rows.map(({ p, costValue, sellValue }) => [p.name, p.category?.name ?? "", p.unit, p.stock, (p.costPrice / 100).toFixed(2), (p.sellPrice / 100).toFixed(2), (costValue / 100).toFixed(2), (sellValue / 100).toFixed(2)]);
    downloadText(`inventory_${dayKey(new Date())}.csv`, toCsv([header, ...rows]));
  }

  function exportDebtors() {
    const header = ["Customer", "Phone", "Owes", "Last activity"];
    const rows = debtors.map((c) => [c.name, c.phone ?? "", (c.owed / 100).toFixed(2), c.lastActivityAt ?? ""]);
    downloadText(`debtors_${dayKey(new Date())}.csv`, toCsv([header, ...rows]));
  }

  const s = data?.summary;
  const sameShopBranches = session.shops.filter((b) => b.businessId === shop.businessId).length;
  const reportScopes: ScopeOption[] = [
    { value: "branch", label: shop.name },
    ...(sameShopBranches > 1 ? [{ value: "shop", label: role === "OWNER" ? tg("allBranches") : tg("myBranches") }] : []),
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={rangeLabel}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => window.print()} aria-label={tc("print")}>
              <Printer />
            </Button>
            <Button onClick={() => setGenOpen(true)}>
              <FileDown />
              <span className="sr-only sm:not-sr-only">{tg("button")}</span>
            </Button>
          </>
        }
      />
      <ReportDialog open={genOpen} onOpenChange={setGenOpen} scopes={reportScopes} />
      <p className="hidden print:block mb-4 text-sm">
        {shop.name} · {t("generated", { time: format.dateTime(new Date(), { dateStyle: "medium", timeStyle: "short" }) })}
      </p>

      {/* Filters: one row above the charts */}
      <div className="no-print mb-6 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[...PRESETS, "custom" as const].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", preset === p ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {t(p)}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="grid max-w-sm grid-cols-2 gap-2">
            <Field label={t("from")} htmlFor="from">
              <Input id="from" type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="h-10" />
            </Field>
            <Field label={t("to")} htmlFor="to">
              <Input id="to" type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="h-10" />
            </Field>
          </div>
        )}
      </div>

      {!s || !data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{t("salesReport")}</h2>
              <Button variant="ghost" size="sm" className="no-print" onClick={exportSales} disabled={!data.items.length}>
                <Download />
                {tc("exportCsv")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Metric label={t("revenue")} value={<Money value={s.revenue} />} strong />
              <Metric label={t("grossProfit")} value={<Money value={s.grossProfit} className={s.grossProfit < 0 ? "text-destructive" : ""} />} strong />
              <Metric label={t("margin")} value={format.number(s.margin, { style: "percent", maximumFractionDigits: 1 })} strong />
              <Metric label={t("salesCount")} value={s.count} />
              {shop.vatEnabled && <Metric label={t("vatCollected")} value={<Money value={s.vat} />} />}
              <Metric label={t("netSales")} value={<Money value={s.netSales} />} />
              <Metric label={t("cogs")} value={<Money value={s.cogs} />} />
              <Metric label={t("purchasesTotal")} value={<Money value={data.purchases} />} />
              <Metric label={t("creditGiven")} value={<Money value={s.creditGiven} />} />
              <Metric label={t("debtCollected")} value={<Money value={data.collected} />} />
            </div>
          </section>

          {s.count === 0 ? (
            <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t("noData")}</p>
          ) : (
            <>
              <section className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{t("byDay")}</h2>
                  <Button variant="ghost" size="icon-sm" className="no-print" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable} aria-label={showTable ? t("byDay") : t("summary")}>
                    {showTable ? <BarChart3 /> : <Table2 />}
                  </Button>
                </div>
                {showTable ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tc("date")}</TableHead>
                        <TableHead className="text-right">{t("salesCount")}</TableHead>
                        <TableHead className="text-right">{ts("title")}</TableHead>
                        <TableHead className="text-right">{t("grossProfit")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.byDay.map((d) => (
                        <TableRow key={d.key}>
                          <TableCell>{format.dateTime(d.date, { weekday: "short", day: "numeric", month: "short" })}</TableCell>
                          <TableCell className="text-right tabular">{d.count}</TableCell>
                          <TableCell className="text-right"><Money value={d.sales} /></TableCell>
                          <TableCell className="text-right"><Money value={d.profit} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <MoneyColumns
                    height={260}
                    data={s.byDay.map((d) => ({ key: d.key, date: d.date, label: format.dateTime(d.date, { day: "numeric", month: s.byDay.length > 31 ? "short" : undefined }), sales: d.sales, profit: d.profit }))}
                    series={[
                      { key: "sales", name: ts("title") },
                      { key: "profit", name: t("grossProfit") },
                    ]}
                  />
                )}
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border bg-card p-4">
                  <h2 className="mb-3 font-semibold">{t("byPayment")}</h2>
                  <BarList
                    format={money}
                    max={s.revenue}
                    rows={(["CASH", "MOBILE_MONEY", "CREDIT"] as const).map((p) => ({
                      key: p,
                      label: ts(p),
                      value: s.byPayment[p],
                      hint: s.revenue ? format.number(s.byPayment[p] / s.revenue, { style: "percent", maximumFractionDigits: 0 }) : undefined,
                    }))}
                  />
                </section>
                <section className="rounded-xl border bg-card p-4">
                  <h2 className="mb-3 font-semibold">{t("topProducts")}</h2>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("products")}</TableHead>
                        <TableHead className="text-right">{t("qtySold")}</TableHead>
                        <TableHead className="text-right">{ts("title")}</TableHead>
                        <TableHead className="text-right">{ts("profit")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.topProducts.slice(0, 10).map((r) => (
                        <TableRow key={r.productId}>
                          <TableCell className="max-w-40 truncate">{productMap.get(r.productId)?.name ?? "—"}</TableCell>
                          <TableCell className="text-right tabular">{qty(r.qty)}</TableCell>
                          <TableCell className="text-right"><Money value={r.revenue} /></TableCell>
                          <TableCell className="text-right"><Money value={r.profit} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              </div>
            </>
          )}

          {/* Inventory snapshot (always "now", not affected by the period) */}
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{t("inventoryReport")}</h2>
              <Button variant="ghost" size="sm" className="no-print" onClick={exportInventory} disabled={!inventory.rows.length}>
                <Download />
                {tc("exportCsv")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Metric label={t("products")} value={inventory.rows.length} />
              <Metric label={t("stockValueCost")} value={<Money value={inventory.cost} />} strong />
              <Metric label={t("stockValueSell")} value={<Money value={inventory.sell} />} />
              <Metric label={tp("filterLow")} value={inventory.rows.filter((r) => r.p.status === "low").length} />
              <Metric label={tp("filterOut")} value={inventory.rows.filter((r) => r.p.status === "out").length} />
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{t("debtReport")}</h2>
              <Button variant="ghost" size="sm" className="no-print" onClick={exportDebtors} disabled={!debtors.length}>
                <Download />
                {tc("exportCsv")}
              </Button>
            </div>
            {debtors.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <BarList format={money} rows={debtors.slice(0, 10).map((c) => ({ key: c.id, label: c.name, value: c.owed }))} />
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular", strong ? "text-lg font-semibold" : "text-sm font-medium")}>{value}</p>
    </div>
  );
}
