"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useShop } from "./shop-context";

/** Text input for kwacha amounts. Value is the raw text; parse with toNgwee() on submit. */
export function MoneyInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type" | "inputMode">) {
  const { shop } = useShop();
  const symbol = shop.currency === "ZMW" ? "K" : shop.currency;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{symbol}</span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        className={cn("h-10 pl-7 tabular", symbol.length > 1 && "pl-12", className)}
        {...props}
      />
    </div>
  );
}

/** Text input for quantities (allows decimals for kg / litres). */
export function QtyInput({ className, unit, ...props }: Omit<React.ComponentProps<typeof Input>, "type" | "inputMode"> & { unit?: string }) {
  return (
    <div className="relative">
      <Input type="text" inputMode="decimal" autoComplete="off" placeholder="0" className={cn("h-10 tabular", unit && "pr-14", className)} {...props} />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}

/** "1,5" | "1.5" → 1.5; returns null when not a valid non-negative number with ≤3 decimals. */
export function parseQty(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,3})?$/.test(s)) return null;
  return Number(s);
}
