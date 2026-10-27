// Turns an activity log entry into plain words. Shared by the on-screen timeline (browser) and the
// downloadable export (server) so both always say the same thing.

import { formatMoney } from "@/lib/money";

export interface ActivityLike {
  action: string;
  summary: unknown;
}

/** Minimal translator shape (next-intl's useTranslations / createTranslator for "activity"). */
export interface ActivityTranslator {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

const MONEY_KEYS = new Set(["total", "amount", "amountPaid", "owed", "sellPrice", "costPrice"]);

/** Role codes in old and new log entries. "ADMIN" was renamed "MANAGER". */
export function normaliseRole(role: unknown): string | null {
  if (typeof role !== "string" || !role) return null;
  return role === "ADMIN" ? "MANAGER" : role;
}

export function activitySentence(t: ActivityTranslator, e: ActivityLike, locale: string, roleLabel: (role: string) => string) {
  const s = (e.summary ?? {}) as Record<string, unknown>;
  const money = (v: unknown) => (typeof v === "number" ? formatMoney(v, "ZMW", locale) : "");
  const role = (v: unknown) => {
    const r = normaliseRole(v);
    return r ? roleLabel(r) : "";
  };
  const qty = typeof s.qty === "number" ? (s.qty > 0 ? `+${s.qty}` : String(s.qty)) : "";
  const values = {
    number: String(s.number ?? ""),
    total: money(s.total),
    amount: money(s.amount),
    owed: money(s.owed),
    qty,
    product: String(s.product ?? ""),
    name: String(s.name ?? s.owner ?? ""),
    login: String(s.login ?? ""),
    to: role(s.to),
    from: role(s.from),
    role: role(s.role),
    username: String(s.username ?? ""),
    rows: String(s.rows ?? ""),
    format: typeof s.format === "string" ? (s.format === "xlsx" ? "Excel" : s.format.toUpperCase()) : "",
    action: e.action,
  };
  // Legacy action names from before the rename, mapped to their current wording.
  const action = e.action === "staff.create_pin_account" ? "staff.create_login" : e.action === "staff.reset_pin" ? "staff.reset_password" : e.action;
  const key = `actions.${action}`;
  return t.has(key) ? t(key, values) : t("actions.other", values);
}

/** Every summary field as "key: value", money formatted, for the detailed export. */
export function activityDetails(e: ActivityLike, locale: string, roleLabel: (role: string) => string): string {
  const s = (e.summary ?? {}) as Record<string, unknown>;
  return Object.entries(s)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      if (MONEY_KEYS.has(k) && typeof v === "number") return `${k}: ${formatMoney(v, "ZMW", locale)}`;
      if ((k === "role" || k === "from" || k === "to") && typeof v === "string") return `${k}: ${roleLabel(normaliseRole(v)!)}`;
      if (typeof v === "object") return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${String(v)}`;
    })
    .join("; ");
}
