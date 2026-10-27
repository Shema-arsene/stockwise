import { describe, expect, it } from "vitest";
import { lineAmount, ngweeToInput, roundQty, toNgwee } from "./money";
import { computeTotals, vatOn } from "./vat";

describe("toNgwee", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12,50", 1250],
    ["0.05", 5],
    [" 1 000.10 ", 100010],
    [7.25, 725],
    ["-3.40", -340],
  ])("%s → %d", (input, expected) => {
    expect(toNgwee(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "1..2", "K12"])("rejects %s", (input) => {
    expect(toNgwee(input)).toBeNull();
  });

  it("round-trips through the input format", () => {
    expect(toNgwee(ngweeToInput(123456))).toBe(123456);
  });
});

describe("lineAmount", () => {
  it("multiplies exactly for whole quantities", () => {
    expect(lineAmount(5000, 3)).toBe(15000);
  });
  it("handles fractional quantities without float drift", () => {
    expect(lineAmount(1000, 0.3)).toBe(300); // 0.3 is not exact in binary
    expect(lineAmount(333, 1.5)).toBe(500); // 499.5 rounds half up
    expect(lineAmount(2599, 2.25)).toBe(5848); // 5847.75
  });
});

describe("roundQty", () => {
  it("removes float noise", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(20 - 3 - 0.7)).toBe(16.3);
  });
});

describe("VAT", () => {
  it("adds 16% at 1600 basis points", () => {
    expect(vatOn(10000, 1600)).toBe(1600);
    expect(vatOn(333, 1600)).toBe(53); // 53.28
  });

  it("only taxes VAT-able lines when enabled", () => {
    const lines = [
      { amount: 10000, vatApplicable: true },
      { amount: 5000, vatApplicable: false },
    ];
    expect(computeTotals(lines, true, 1600)).toMatchObject({ subtotal: 15000, vatAmount: 1600, total: 16600, lineVat: [1600, 0] });
    expect(computeTotals(lines, false, 1600)).toMatchObject({ subtotal: 15000, vatAmount: 0, total: 15000 });
  });
});
