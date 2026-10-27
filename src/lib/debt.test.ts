import { describe, expect, it } from "vitest";
import { ageDebt, agePayable } from "./debt";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const sale = (days: number, total: number, amountPaid = 0, voided = false) => ({
  soldAt: daysAgo(days),
  total,
  amountPaid,
  voidedAt: voided ? daysAgo(0) : null,
  deletedAt: null,
});
const pay = (amount: number, voided = false) => ({ amount, voidedAt: voided ? daysAgo(0) : null, deletedAt: null });

describe("ageDebt", () => {
  it("buckets unpaid credit by age", () => {
    const a = ageDebt([sale(5, 1000), sale(45, 2000), sale(90, 3000)], [], NOW);
    expect(a).toMatchObject({ owed: 6000, d0_30: 1000, d31_60: 2000, d60plus: 3000 });
    expect(a.oldestUnpaidAt).toBe(daysAgo(90));
  });

  it("applies payments to the oldest debt first", () => {
    const a = ageDebt([sale(90, 3000), sale(5, 1000)], [pay(3500)], NOW);
    expect(a).toMatchObject({ owed: 500, d0_30: 500, d31_60: 0, d60plus: 0 });
    expect(a.oldestUnpaidAt).toBe(daysAgo(5));
  });

  it("counts only the unpaid part of a partly-paid credit sale", () => {
    expect(ageDebt([sale(1, 5000, 2000)], [], NOW).owed).toBe(3000);
  });

  it("ignores voided sales and voided payments", () => {
    const a = ageDebt([sale(1, 5000), sale(1, 9999, 0, true)], [pay(5000, true)], NOW);
    expect(a.owed).toBe(5000);
  });

  it("shows overpayment as a negative balance", () => {
    expect(ageDebt([sale(1, 1000)], [pay(1500)], NOW).owed).toBe(-500);
  });
});

describe("agePayable", () => {
  const buy = (days: number, total: number, amountPaid = 0, voided = false) => ({
    purchasedAt: daysAgo(days),
    total,
    amountPaid,
    voidedAt: voided ? daysAgo(0) : null,
    deletedAt: null,
  });

  it("adds up several credit purchases and pays them back in instalments, oldest first", () => {
    const a = agePayable([buy(40, 50000, 10000), buy(3, 20000)], [pay(15000), pay(25000)], NOW);
    // 40 000 owed on the old bill is cleared by the two instalments; the new bill is untouched.
    expect(a).toMatchObject({ owed: 20000, d0_30: 20000, d31_60: 0 });
    expect(a.oldestUnpaidAt).toBe(daysAgo(3));
  });

  it("ignores voided purchases and voided payments", () => {
    const a = agePayable([buy(10, 5000), buy(10, 9000, 0, true)], [pay(2000), pay(3000, true)], NOW);
    expect(a.owed).toBe(3000);
  });

  it("shows an overpayment as a negative balance", () => {
    expect(agePayable([buy(1, 1000)], [pay(1500)], NOW).owed).toBe(-500);
  });
});
