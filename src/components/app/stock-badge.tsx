"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQty } from "./page-parts";

export function StockBadge({ stock, status, unit, className }: { stock: number; status: "ok" | "low" | "out"; unit: string; className?: string }) {
  const t = useTranslations("products");
  const qty = useQty();
  return (
    <Badge
      variant="outline"
      className={cn(
        "tabular font-medium",
        status === "out" && "border-destructive/30 bg-destructive/10 text-destructive",
        status === "low" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        status === "ok" && "border-primary/20 bg-primary/5 text-primary",
        className,
      )}
    >
      {status === "out" ? t("outOfStock") : `${qty(stock)} ${t(`units.${unit}` as "units.pcs")}`}
    </Badge>
  );
}
