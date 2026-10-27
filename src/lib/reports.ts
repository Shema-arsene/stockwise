// Report maths, kept pure (plain arrays in, numbers out) so it is easy to test.
// All money is integer ngwee. Voided rows never count.

import type { DebtPayment, Purchase, Sale, SaleItem } from "@/lib/sync/tables";
import { lineAmount } from "@/lib/money";

export interface Range {
  from: Date; // inclusive
  to: Date; // exclusive
}

/** Local calendar day key, e.g. "2026-10-20". */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export type Preset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth";

export function presetRange(preset: Preset, now = new Date()): Range {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "yesterday":
      return { from: addDays(today, -1), to: today };
    case "last7":
      return { from: addDays(today, -6), to: addDays(today, 1) };
    case "thisMonth":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
    case "lastMonth":
      return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
  }
}

export interface DayPoint {
  key: string;
  date: Date;
  sales: number; // total incl. VAT
  profit: number; // net sales - cost
  count: number;
}

export interface ProductRank {
  productId: string;
  qty: number;
  revenue: number; // before VAT
  profit: number;
}

export interface SalesSummary {
  count: number;
  revenue: number;
  vat: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  margin: number; // 0..1 of net sales
  creditGiven: number;
  byPayment: Record<Sale["paymentType"], number>;
  byDay: DayPoint[];
  topProducts: ProductRank[];
}

export function summarizeSales(sales: Sale[], items: SaleItem[], range: Range): SalesSummary {
  const live = sales.filter((s) => !s.voidedAt && !s.deletedAt);
  const liveIds = new Set(live.map((s) => s.id));

  const days = new Map<string, DayPoint>();
  for (let d = startOfDay(range.from); d < range.to; d = addDays(d, 1)) {
    days.set(dayKey(d), { key: dayKey(d), date: d, sales: 0, profit: 0, count: 0 });
  }

  const out: SalesSummary = {
    count: live.length,
    revenue: 0,
    vat: 0,
    netSales: 0,
    cogs: 0,
    grossProfit: 0,
    margin: 0,
    creditGiven: 0,
    byPayment: { CASH: 0, MOBILE_MONEY: 0, CREDIT: 0 },
    byDay: [],
    topProducts: [],
  };

  for (const s of live) {
    out.revenue += s.total;
    out.vat += s.vatAmount;
    out.netSales += s.subtotal;
    out.cogs += s.costTotal;
    out.byPayment[s.paymentType] += s.total;
    if (s.paymentType === "CREDIT") out.creditGiven += s.total - s.amountPaid;
    const day = days.get(dayKey(new Date(s.soldAt)));
    if (day) {
      day.sales += s.total;
      day.profit += s.subtotal - s.costTotal;
      day.count += 1;
    }
  }
  out.grossProfit = out.netSales - out.cogs;
  out.margin = out.netSales > 0 ? out.grossProfit / out.netSales : 0;
  out.byDay = [...days.values()];

  const ranks = new Map<string, ProductRank>();
  for (const i of items) {
    if (!liveIds.has(i.saleId)) continue;
    const r = ranks.get(i.productId) ?? { productId: i.productId, qty: 0, revenue: 0, profit: 0 };
    const revenue = lineAmount(i.unitPrice, i.qty);
    r.qty += i.qty;
    r.revenue += revenue;
    r.profit += revenue - lineAmount(i.unitCost, i.qty);
    ranks.set(i.productId, r);
  }
  out.topProducts = [...ranks.values()].sort((a, b) => b.revenue - a.revenue);
  return out;
}

export function sumPurchases(purchases: Purchase[]): number {
  return purchases.filter((p) => !p.voidedAt && !p.deletedAt).reduce((s, p) => s + p.total, 0);
}

export function sumPayments(payments: DebtPayment[]): number {
  return payments.filter((p) => !p.voidedAt && !p.deletedAt).reduce((s, p) => s + p.amount, 0);
}

/** Escapes and joins rows into CSV text (Excel-friendly, with BOM). */
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
