"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Banknote, Boxes, HandCoins, Plus, ShoppingCart, TrendingUp, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Money, PageHeader, StatCard, useMoney, useQty } from "@/components/app/page-parts";
import { BarList, MoneyColumns } from "@/components/app/charts";
import { StockBadge } from "@/components/app/stock-badge";
import { useShop } from "@/components/app/shop-context";
import { useProducts, useSuppliers } from "@/lib/local/hooks";
import { lineAmount } from "@/lib/money";
import { addDays, startOfDay, summarizeSales } from "@/lib/reports";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const ts = useTranslations("sales");
  const tp = useTranslations("products");
  const format = useFormatter();
  const money = useMoney();
  const qty = useQty();
  const { db, user, can } = useShop();
  const products = useProducts();
  const showCost = can("cost.view");
  const showPayables = can("purchase.manage");
  const suppliers = useSuppliers();
  const owedSuppliers = (suppliers ?? []).filter((s) => s.owed > 0);

  const data = useLiveQuery(async () => {
    const now = new Date();
    const today = startOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const trendStart = addDays(today, -13);
    const since = monthStart < trendStart ? monthStart : trendStart;
    const tomorrow = addDays(today, 1);

    const sales = await db.sales.where("soldAt").aboveOrEqual(since.toISOString()).toArray();
    const items = await db.saleItems.where("saleId").anyOf(sales.map((s) => s.id)).toArray();
    const inRange = (from: Date) => sales.filter((s) => new Date(s.soldAt) >= from);

    const balances = await db.balances.toArray();
    const debtors = balances.filter((b) => b.owed > 0);
    const recent = await db.sales.orderBy("soldAt").reverse().limit(5).toArray();
    const customers = await db.customers.bulkGet(recent.map((s) => s.customerId ?? ""));

    return {
      today: summarizeSales(inRange(today), [], { from: today, to: tomorrow }),
      week: summarizeSales(inRange(addDays(today, -6)), [], { from: addDays(today, -6), to: tomorrow }),
      month: summarizeSales(inRange(monthStart), items, { from: monthStart, to: tomorrow }),
      trend: summarizeSales(inRange(trendStart), [], { from: trendStart, to: tomorrow }).byDay,
      owed: debtors.reduce((s, b) => s + b.owed, 0),
      debtorCount: debtors.length,
      recent: recent.map((s, i) => ({ sale: s, customer: customers[i]?.name })),
    };
  }, [db]);

  const productName = new Map((products ?? []).map((p) => [p.id, p]));
  const lowStock = (products ?? []).filter((p) => p.status !== "ok").sort((a, b) => a.stock - b.stock);
  const stockValue = (products ?? []).reduce((s, p) => s + (p.stock > 0 ? lineAmount(p.costPrice, p.stock) : 0), 0);

  return (
    <>
      <PageHeader title={t("greeting", { name: user.name.split(" ")[0] })} subtitle={format.dateTime(new Date(), { dateStyle: "full" })} />

      {/* Quick actions */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {can("sale.create") && (
          <Button asChild size="lg" className="h-12">
            <Link href="/app/sales/new">
              <ShoppingCart />
              {t("quickSell")}
            </Link>
          </Button>
        )}
        {can("product.manage") && (
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link href="/app/products/edit">
              <Plus />
              {t("quickProduct")}
            </Link>
          </Button>
        )}
        {can("purchase.manage") && (
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link href="/app/purchases/new">
              <Truck />
              {t("quickPurchase")}
            </Link>
          </Button>
        )}
        {can("debt.record") && (
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link href="/app/customers">
              <HandCoins />
              {t("quickPayment")}
            </Link>
          </Button>
        )}
      </div>

      {!data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t("todaySales")} value={money(data.today.revenue)} hint={t("transactions", { count: data.today.count })} icon={Banknote} tone="success" href="/app/sales" />
            {showCost ? (
              <StatCard label={t("todayProfit")} value={money(data.today.grossProfit)} hint={`${t("monthSales")}: ${money(data.month.grossProfit)}`} icon={TrendingUp} />
            ) : (
              <StatCard label={t("weekSales")} value={money(data.week.revenue)} hint={t("transactions", { count: data.week.count })} icon={TrendingUp} />
            )}
            <StatCard label={t("debtOwed")} value={money(data.owed)} hint={t("debtors", { count: data.debtorCount })} icon={HandCoins} tone={data.owed > 0 ? "warning" : "default"} href="/app/customers" />
            {showCost ? (
              <StatCard label={t("stockValue")} value={money(stockValue)} hint={t("stockValueHint")} icon={Wallet} href="/app/products" />
            ) : (
              <StatCard label={t("lowStock")} value={lowStock.length} icon={AlertTriangle} tone={lowStock.length ? "warning" : "default"} href="/app/products" />
            )}
          </div>
          {showPayables && owedSuppliers.length > 0 && (
            <div className="mt-3">
              <StatCard
                label={t("owedToSuppliers")}
                value={money(owedSuppliers.reduce((sum, s) => sum + s.owed, 0))}
                hint={t("suppliersOwed", { count: owedSuppliers.length })}
                icon={Truck}
                tone="warning"
                href="/app/customers?tab=suppliers"
              />
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-5">
            <section className="rounded-xl border bg-card p-4 lg:col-span-3">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">{t("salesTrend")}</h2>
                <Money value={data.trend.reduce((s, d) => s + d.sales, 0)} className="text-sm text-muted-foreground" />
              </div>
              <MoneyColumns
                data={data.trend.map((d) => ({ key: d.key, date: d.date, label: format.dateTime(d.date, { day: "numeric" }), sales: d.sales }))}
                series={[{ key: "sales", name: ts("title") }]}
              />
            </section>

            <section className="rounded-xl border bg-card p-4 lg:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                {t("lowStock")}
                {lowStock.length > 0 && <span className="rounded-full bg-amber-500/15 px-2 text-xs text-amber-700 dark:text-amber-400">{lowStock.length}</span>}
              </h2>
              {products === undefined ? null : lowStock.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Boxes className="size-4" />
                  {t("lowStockEmpty")}
                </p>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {lowStock.slice(0, 6).map((p) => (
                    <li key={p.id}>
                      <Link href={`/app/products/view?id=${p.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                        <span className="truncate text-sm">{p.name}</span>
                        <StockBadge stock={p.stock} status={p.status} unit={p.unit} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 font-semibold">{t("topProducts")}</h2>
              {data.month.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noSalesYet")}</p>
              ) : (
                <BarList
                  format={money}
                  rows={data.month.topProducts.slice(0, 5).map((r) => {
                    const p = productName.get(r.productId);
                    return {
                      key: r.productId,
                      label: p?.name ?? "—",
                      value: r.revenue,
                      hint: `${ts("qty")}: ${qty(r.qty)} ${p ? tp(`units.${p.unit}` as "units.pcs") : ""}`,
                    };
                  })}
                />
              )}
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{t("recentSales")}</h2>
                {data.recent.length > 0 && (
                  <Link href="/app/sales" className="text-sm text-primary hover:underline">
                    {ts("title")}
                  </Link>
                )}
              </div>
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noSalesYet")}</p>
              ) : (
                <ul className="-mx-2">
                  {data.recent.map(({ sale, customer }) => (
                    <li key={sale.id}>
                      <Link href={`/app/sales/view?id=${sale.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{customer ?? `#${sale.number}`}</span>
                          <span className="block text-xs text-muted-foreground">
                            {format.relativeTime(new Date(sale.soldAt), new Date())} · {ts(sale.paymentType)}
                          </span>
                        </span>
                        <Money value={sale.total} className={sale.voidedAt ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
