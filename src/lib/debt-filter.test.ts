import { describe, expect, it } from "vitest";
import { DEBT_FILTER_DEFAULTS, filterDebts, type DebtRow } from "./debt-filter";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const row = (id: string, owed: number, oldestDays: number | null, lastDays: number | null, extra: Partial<DebtRow> = {}): DebtRow => ({
  id,
  name: id,
  phone: null,
  address: null,
  owed,
  aging: { owed, d0_30: 0, d31_60: 0, d60plus: 0, oldestUnpaidAt: oldestDays === null ? null : ago(oldestDays) },
  lastActivityAt: lastDays === null ? null : ago(lastDays),
  href: "#",
  ...extra,
});

const rows = [
  row("Bwalya", 50000, 70, 2, { phone: "0971234567", address: "Kamwala South" }),
  row("Mutale", 12000, 10, 10, { address: "Chilenje market" }),
  row("Chanda", 0, null, 100),
  row("Ruth", -3000, null, 40),
  row("Joseph", 30000, 45, 95),
];
const run = (f: Partial<typeof DEBT_FILTER_DEFAULTS>) => filterDebts(rows, { ...DEBT_FILTER_DEFAULTS, ...f }, NOW).map((r) => r.id);

describe("filterDebts", () => {
  it("shows people who owe, biggest first, by default", () => {
    expect(run({})).toEqual(["Bwalya", "Joseph", "Mutale"]);
  });

  it("filters by status", () => {
    expect(run({ status: "settled" })).toEqual(["Chanda"]);
    expect(run({ status: "overpaid" })).toEqual(["Ruth"]);
    expect(run({ status: "all" })).toHaveLength(5);
  });

  it("searches name, phone and address", () => {
    expect(run({ query: "chilenje" })).toEqual(["Mutale"]);
    expect(run({ query: "0971" })).toEqual(["Bwalya"]);
  });

  it("filters by the age of the oldest unpaid bill", () => {
    expect(run({ age: "d0_30" })).toEqual(["Mutale"]);
    expect(run({ age: "d31_60" })).toEqual(["Joseph"]);
    expect(run({ age: "d60plus" })).toEqual(["Bwalya"]);
  });

  it("filters by amount range (in kwacha) and by last activity", () => {
    expect(run({ min: "200", max: "400" })).toEqual(["Joseph"]);
    expect(run({ activity: "week" })).toEqual(["Bwalya"]);
    expect(run({ activity: "quiet90" })).toEqual(["Joseph"]);
  });

  it("sorts by oldest debt, name or recent activity", () => {
    expect(run({ sort: "oldest" })).toEqual(["Bwalya", "Joseph", "Mutale"]);
    expect(run({ sort: "name" })).toEqual(["Bwalya", "Joseph", "Mutale"]);
    expect(run({ status: "all", sort: "recent" })).toEqual(["Bwalya", "Mutale", "Ruth", "Joseph", "Chanda"]);
  });
});
