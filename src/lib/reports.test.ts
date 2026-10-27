import { describe, expect, it } from "vitest";
import { presetRange, summarizeSales, toCsv } from "./reports";
import type { Sale, SaleItem } from "./sync/tables";

const base = { createdAt: "", updatedAt: "", deletedAt: null };

function mkSale(id: string, soldAt: Date, p: Partial<Sale>): Sale {
  return {
    ...base,
    id,
    number: id,
    customerId: null,
    paymentType: "CASH",
    subtotal: 0,
    vatAmount: 0,
    total: 0,
    amountPaid: 0,
    costTotal: 0,
    note: null,
    userId: "u",
    soldAt: soldAt.toISOString(),
    voidedAt: null,
    ...p,
  };
}

function mkItem(saleId: string, productId: string, qty: number, unitPrice: number, unitCost: number): SaleItem {
  return { ...base, id: `${saleId}-${productId}`, saleId, productId, qty, unitPrice, unitCost, vatAmount: 0, lineTotal: qty * unitPrice };
}

describe("summarizeSales", () => {
  const day1 = new Date(2026, 9, 1, 10);
  const day2 = new Date(2026, 9, 2, 15);
  const range = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 3) };
  const sales = [
    mkSale("a", day1, { subtotal: 10000, total: 11600, vatAmount: 1600, costTotal: 6000, amountPaid: 11600 }),
    mkSale("b", day2, { subtotal: 5000, total: 5000, costTotal: 3000, paymentType: "CREDIT", amountPaid: 1000 }),
    mkSale("c", day2, { subtotal: 99999, total: 99999, costTotal: 1, voidedAt: day2.toISOString() }),
  ];
  const items = [mkItem("a", "p1", 2, 5000, 3000), mkItem("b", "p2", 1, 5000, 3000), mkItem("c", "p1", 100, 999, 1)];
  const s = summarizeSales(sales, items, range);

  it("totals revenue, VAT, cost and profit, excluding voided sales", () => {
    expect(s).toMatchObject({ count: 2, revenue: 16600, vat: 1600, netSales: 15000, cogs: 9000, grossProfit: 6000 });
    expect(s.margin).toBeCloseTo(0.4);
  });

  it("tracks new credit and payment mix", () => {
    expect(s.creditGiven).toBe(4000);
    expect(s.byPayment).toEqual({ CASH: 11600, MOBILE_MONEY: 0, CREDIT: 5000 });
  });

  it("fills every day in the range, including empty ones", () => {
    expect(s.byDay.map((d) => [d.key, d.sales, d.count])).toEqual([
      ["2026-10-01", 11600, 1],
      ["2026-10-02", 5000, 1],
    ]);
  });

  it("ranks products by revenue, ignoring voided sales", () => {
    expect(s.topProducts.map((p) => [p.productId, p.qty, p.revenue, p.profit])).toEqual([
      ["p1", 2, 10000, 4000],
      ["p2", 1, 5000, 2000],
    ]);
  });
});

describe("presetRange", () => {
  const now = new Date(2026, 9, 20, 14, 30);
  it("today is midnight to midnight", () => {
    const r = presetRange("today", now);
    expect(r.from).toEqual(new Date(2026, 9, 20));
    expect(r.to).toEqual(new Date(2026, 9, 21));
  });
  it("last month covers the whole previous month", () => {
    const r = presetRange("lastMonth", now);
    expect(r.from).toEqual(new Date(2026, 8, 1));
    expect(r.to).toEqual(new Date(2026, 9, 1));
  });
});

describe("toCsv", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "x\ny", 3]])).toBe('﻿"a,b","say ""hi""","x\ny",3');
  });
});
