// Money is always an integer number of ngwee (K1 = 100 ngwee).
// JS numbers are exact for integers up to 9 quadrillion, far beyond any shop's totals.

export type Ngwee = number;

/** "12.50" | "12,50" | 12.5 → 1250. Returns null for invalid input. */
export function toNgwee(input: string | number): Ngwee | null {
  const str = String(input).trim().replace(/\s/g, "").replace(",", ".");
  if (str === "") return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(str)) return null;
  const negative = str.startsWith("-");
  const [whole, frac = ""] = str.replace("-", "").split(".");
  const value = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -value : value;
}

/** 1250 → "12.50" (for form inputs). */
export function ngweeToInput(value: Ngwee): string {
  return (value / 100).toFixed(2);
}

const formatters = new Map<string, Intl.NumberFormat>();

/** 1250 → "K12.50" (or "ZMW 12.50" depending on locale). */
export function formatMoney(value: Ngwee, currency = "ZMW", locale = "en"): string {
  const key = `${locale}|${currency}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale === "fr" ? "fr-ZM" : "en-ZM", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
    formatters.set(key, fmt);
  }
  return fmt.format(value / 100);
}

/** Price × quantity, rounded half-up to the nearest ngwee. Quantity may be fractional (kg, litres). */
export function lineAmount(unitPrice: Ngwee, qty: number): Ngwee {
  // Work in thousandths of a unit so the multiplication is exact integer maths.
  const qtyMilli = Math.round(qty * 1000);
  return Math.round((unitPrice * qtyMilli) / 1000);
}

/** Quantities have at most 3 decimals; this removes float noise like 0.30000000000000004. */
export function roundQty(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}
