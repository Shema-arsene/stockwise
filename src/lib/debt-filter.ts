import type { Aging } from "@/lib/debt";
import { toNgwee } from "@/lib/money";
import { matches } from "@/lib/utils";

/** One person in a debt list: a customer who owes the shop, or a supplier the shop owes. */
export interface DebtRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  owed: number;
  aging: Aging;
  lastActivityAt: string | null;
  href: string;
}

export type DebtStatus = "owing" | "settled" | "overpaid" | "all";
type Age = "any" | "d0_30" | "d31_60" | "d60plus";
type Activity = "any" | "week" | "month" | "quiet90";
type Sort = "amount" | "oldest" | "name" | "recent";

export interface DebtFilters {
  query: string;
  status: DebtStatus;
  age: Age;
  activity: Activity;
  min: string;
  max: string;
  sort: Sort;
}

export const DEBT_FILTER_DEFAULTS: DebtFilters = { query: "", status: "owing", age: "any", activity: "any", min: "", max: "", sort: "amount" };
const DAY = 86_400_000;

const daysSince = (iso: string | null, now: number) => (iso ? (now - Date.parse(iso)) / DAY : Infinity);

/** Search, filter and sort a list of balances (customers who owe, or suppliers the shop owes). */
export function filterDebts(rows: DebtRow[], f: DebtFilters, now = Date.now()): DebtRow[] {
  const min = f.min.trim() ? toNgwee(f.min) : null;
  const max = f.max.trim() ? toNgwee(f.max) : null;
  const list = rows.filter((r) => {
    if (!matches(f.query, r.name, r.phone, r.address)) return false;
    if (f.status === "owing" && r.owed <= 0) return false;
    if (f.status === "settled" && r.owed !== 0) return false;
    if (f.status === "overpaid" && r.owed >= 0) return false;
    if (min !== null && r.owed < min) return false;
    if (max !== null && r.owed > max) return false;
    if (f.age !== "any") {
      // Grouped by the oldest bill still unpaid.
      const d = daysSince(r.aging.oldestUnpaidAt, now);
      if (r.owed <= 0 || d === Infinity) return false;
      if (f.age === "d0_30" && d > 30) return false;
      if (f.age === "d31_60" && (d <= 30 || d > 60)) return false;
      if (f.age === "d60plus" && d <= 60) return false;
    }
    if (f.activity !== "any") {
      const d = daysSince(r.lastActivityAt, now);
      if (f.activity === "week" && d > 7) return false;
      if (f.activity === "month" && d > 30) return false;
      if (f.activity === "quiet90" && d <= 90) return false;
    }
    return true;
  });
  const oldest = (r: DebtRow) => r.aging.oldestUnpaidAt ?? "9999";
  const sorters: Record<Sort, (a: DebtRow, b: DebtRow) => number> = {
    amount: (a, b) => b.owed - a.owed,
    oldest: (a, b) => oldest(a).localeCompare(oldest(b)),
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    recent: (a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
  };
  return list.sort(sorters[f.sort]);
}

