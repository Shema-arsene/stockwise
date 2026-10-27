import { describe, expect, it } from "vitest";
import { normalisePurchase, pushBodySchema, saleSchema, stockMovementSchema } from "./tables";

const t = "2026-10-20T10:00:00.000Z";
const id = "01a15915-cbda-7303-a99e-e49b09c7ae4b";

describe("sync row validation", () => {
  it("accepts a valid stock movement and fills defaults", () => {
    const row = stockMovementSchema.parse({ id, productId: id, qty: -1.5, type: "SALE", userId: "u", createdAt: t, updatedAt: t });
    expect(row).toMatchObject({ refId: null, note: null, deletedAt: null });
  });

  it("rejects zero quantity movements", () => {
    expect(stockMovementSchema.safeParse({ id, productId: id, qty: 0, type: "SALE", userId: "u", createdAt: t, updatedAt: t }).success).toBe(false);
  });

  it("rejects fractional ngwee amounts", () => {
    const sale = { id, number: "A-1", paymentType: "CASH", subtotal: 100.5, vatAmount: 0, total: 100, amountPaid: 100, userId: "u", soldAt: t, createdAt: t, updatedAt: t };
    expect(saleSchema.safeParse(sale).success).toBe(false);
  });

  it("caps push batches at 500 mutations", () => {
    const mutations = Array.from({ length: 501 }, () => ({ table: "products", row: {} }));
    expect(pushBodySchema.safeParse({ deviceId: "d", mutations }).success).toBe(false);
  });
});

describe("normalisePurchase", () => {
  const row = { total: 10000 };

  it("fills amountPaid for app versions that only sent `paid`", () => {
    expect(normalisePurchase({ ...row, paid: true })).toMatchObject({ amountPaid: 10000, paid: true });
    expect(normalisePurchase({ ...row, paid: false })).toMatchObject({ amountPaid: 0, paid: false });
  });

  it("keeps amountPaid within the total and derives paid", () => {
    expect(normalisePurchase({ ...row, amountPaid: 4000, paid: true })).toMatchObject({ amountPaid: 4000, paid: false });
    expect(normalisePurchase({ ...row, amountPaid: 12000 })).toMatchObject({ amountPaid: 10000, paid: true });
  });
});
