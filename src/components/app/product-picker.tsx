"use client";

import { useTranslations } from "next-intl";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProductWithStock } from "@/lib/local/hooks";
import { Money, useQty } from "./page-parts";
import { cn } from "@/lib/utils";

/** Searchable product list in a dialog. `price` chooses which price to display. */
export function ProductPicker({
  open,
  onOpenChange,
  products,
  onPick,
  price = "sell",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: ProductWithStock[];
  onPick: (p: ProductWithStock) => void;
  price?: "sell" | "cost";
}) {
  const t = useTranslations("sales");
  const tp = useTranslations("products");
  const tc = useTranslations("common");
  const qty = useQty();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-4 translate-y-0 gap-0 overflow-hidden p-0 sm:top-[10%]">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("pickProduct")}</DialogTitle>
        </DialogHeader>
        <Command
          filter={(value, search, keywords) => {
            const hay = [value, ...(keywords ?? [])].join(" ").toLowerCase();
            return search
              .toLowerCase()
              .split(/\s+/)
              .every((w) => hay.includes(w))
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder={t("searchProduct")} className="h-12" />
          <CommandList className="max-h-[60dvh]">
            <CommandEmpty>{tc("noResults")}</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.id}`}
                  keywords={[p.sku ?? "", p.category?.name ?? ""]}
                  onSelect={() => {
                    onPick(p);
                    onOpenChange(false);
                  }}
                  className="flex items-center gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className={cn("text-xs", p.status === "out" ? "text-destructive" : p.status === "low" ? "text-amber-600" : "text-muted-foreground")}>
                      {p.status === "out" ? tp("outOfStock") : `${qty(p.stock)} ${tp(`units.${p.unit}` as "units.pcs")}`}
                    </p>
                  </div>
                  <Money value={price === "sell" ? p.sellPrice : p.costPrice} className="text-sm" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
