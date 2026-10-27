"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Boxes, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Money, PageHeader } from "@/components/app/page-parts";
import { StockBadge } from "@/components/app/stock-badge";
import { useShop } from "@/components/app/shop-context";
import { matches, useProducts } from "@/lib/local/hooks";
import { cn } from "@/lib/utils";

type Filter = "all" | "low" | "out";

export default function ProductsPage() {
  const t = useTranslations("products");
  const { can } = useShop();
  const products = useProducts();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      all: products?.length ?? 0,
      low: products?.filter((p) => p.status === "low").length ?? 0,
      out: products?.filter((p) => p.status === "out").length ?? 0,
    }),
    [products],
  );

  const visible = useMemo(
    () =>
      (products ?? []).filter(
        (p) => (filter === "all" || p.status === filter) && matches(query, p.name, p.sku, p.category?.name),
      ),
    [products, query, filter],
  );

  const addButton = can("product.manage") && (
    <Button asChild>
      <Link href="/app/products/edit">
        <Plus />
        <span className="sr-only sm:not-sr-only">{t("add")}</span>
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title={t("title")} actions={addButton} />

      {products && products.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(["all", "low", "out"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
                  filter === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {t(f === "all" ? "filterAll" : f === "low" ? "filterLow" : "filterOut")}
                <span className="ml-1.5 tabular opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {products === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={t("empty")}
          hint={t("emptyHint")}
          action={
            can("product.manage") && (
              <Button asChild>
                <Link href="/app/products/edit">
                  <Plus />
                  {t("add")}
                </Link>
              </Button>
            )
          }
        />
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((p) => (
            <li key={p.id}>
              <Link href={`/app/products/view?id=${p.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.category?.name, p.sku].filter(Boolean).join(" · ") || " "}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Money value={p.sellPrice} className="text-sm font-medium" />
                  <StockBadge stock={p.stock} status={p.status} unit={p.unit} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
