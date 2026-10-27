import type { DebtPayment, Purchase, Sale, SupplierPayment } from "@/lib/sync/tables";

export interface Aging {
  owed: number;
  d0_30: number;
  d31_60: number;
  d60plus: number;
  oldestUnpaidAt: string | null;
}

const DAY = 86_400_000;

/** Anything bought on credit: a credit sale (customer owes us) or a credit purchase (we owe a supplier). */
export interface Charge {
  at: string;
  total: number;
  amountPaid: number;
  voidedAt: string | null;
  deletedAt: string | null;
}
type Payment = { amount: number; voidedAt: string | null; deletedAt: string | null };

/**
 * Splits an outstanding balance by age. Payments are applied to the oldest unpaid charge
 * first (first-in, first-out), which is how shop keepers think about it.
 */
export function ageBalance(charges: Charge[], payments: Payment[], now = Date.now()): Aging {
  const debts = charges
    .filter((c) => !c.voidedAt && !c.deletedAt && c.total > c.amountPaid)
    .map((c) => ({ at: c.at, remaining: c.total - c.amountPaid }))
    .sort((a, b) => a.at.localeCompare(b.at));

  let credit = payments.filter((p) => !p.voidedAt && !p.deletedAt).reduce((sum, p) => sum + p.amount, 0);
  for (const d of debts) {
    const applied = Math.min(credit, d.remaining);
    d.remaining -= applied;
    credit -= applied;
  }

  const out: Aging = { owed: 0, d0_30: 0, d31_60: 0, d60plus: 0, oldestUnpaidAt: null };
  for (const d of debts) {
    if (d.remaining <= 0) continue;
    out.owed += d.remaining;
    out.oldestUnpaidAt ??= d.at;
    const days = (now - Date.parse(d.at)) / DAY;
    if (days <= 30) out.d0_30 += d.remaining;
    else if (days <= 60) out.d31_60 += d.remaining;
    else out.d60plus += d.remaining;
  }
  // Payments beyond what was owed (overpayment) show as negative balance.
  out.owed -= credit;
  return out;
}

/** What a customer owes the shop, by age. */
export function ageDebt(sales: Pick<Sale, "soldAt" | "total" | "amountPaid" | "voidedAt" | "deletedAt">[], payments: Pick<DebtPayment, "amount" | "voidedAt" | "deletedAt">[], now = Date.now()): Aging {
  return ageBalance(sales.map((s) => ({ ...s, at: s.soldAt })), payments, now);
}

/** What the shop owes a supplier, by age. */
export function agePayable(purchases: Pick<Purchase, "purchasedAt" | "total" | "amountPaid" | "voidedAt" | "deletedAt">[], payments: Pick<SupplierPayment, "amount" | "voidedAt" | "deletedAt">[], now = Date.now()): Aging {
  return ageBalance(purchases.map((p) => ({ ...p, at: p.purchasedAt })), payments, now);
}
