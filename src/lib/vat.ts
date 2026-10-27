import type { Ngwee } from "./money";

/** VAT is added on top of the selling price. rateBp is basis points: 1600 = 16%. */
export function vatOn(amount: Ngwee, rateBp: number): Ngwee {
  return Math.round((amount * rateBp) / 10_000);
}

export interface VatLine {
  amount: Ngwee; // price × qty, before VAT
  vatApplicable: boolean;
}

export function computeTotals(lines: VatLine[], vatEnabled: boolean, rateBp: number) {
  let subtotal = 0;
  let vatAmount = 0;
  const lineVat = lines.map((l) => {
    const v = vatEnabled && l.vatApplicable ? vatOn(l.amount, rateBp) : 0;
    subtotal += l.amount;
    vatAmount += v;
    return v;
  });
  return { subtotal, vatAmount, total: subtotal + vatAmount, lineVat };
}
