import { startOfDay } from "@/lib/reports";

/** "today" and "this month" in the viewer's own timezone, sent to the server for totals. */
export function periodParams() {
  const now = new Date();
  return { today: startOfDay(now).toISOString(), month: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
}

export interface BranchTotals {
  id: string;
  name: string;
  address: string | null;
  salesToday: number;
  salesMonth: number;
  profitMonth: number;
  salesCountToday: number;
  debtOwed: number;
  products: number;
  people: number;
}
