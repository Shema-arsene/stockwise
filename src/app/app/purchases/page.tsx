"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Money, PageHeader, RequirePermission } from "@/components/app/page-parts";
import { useShop } from "@/components/app/shop-context";
import { cn } from "@/lib/utils";

const PAGE = 100;

export default function PurchasesPage() {
  return (
    <RequirePermission permission="purchase.manage">
      <PurchaseList />
    </RequirePermission>
  );
}

function PurchaseList() {
  const t = useTranslations("purchases");
  const tc = useTranslations("common");
  const format = useFormatter();
  const { db } = useShop();
  const [limit, setLimit] = useState(PAGE);

  const data = useLiveQuery(async () => {
    const purchases = await db.purchases.orderBy("purchasedAt").reverse().limit(limit + 1).toArray();
    const suppliers = await db.suppliers.toArray();
    const counts = new Map<string, number>();
    await Promise.all(
      purchases.map(async (p) => counts.set(p.id, await db.purchaseItems.where("purchaseId").equals(p.id).count())),
    );
    return { purchases: purchases.slice(0, limit), more: purchases.length > limit, names: new Map(suppliers.map((s) => [s.id, s.name])), counts };
  }, [db, limit]);

  const newButton = (
    <Button asChild>
      <Link href="/app/purchases/new">
        <Plus />
        <span className="sr-only sm:not-sr-only">{t("new")}</span>
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title={t("title")} actions={newButton} />
      {data === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : data.purchases.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={t("empty")}
          hint={t("emptyHint")}
          action={
            <Button asChild>
              <Link href="/app/purchases/new">
                <Plus />
                {t("new")}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y rounded-xl border bg-card">
            {data.purchases.map((p) => (
              <li key={p.id}>
                <Link href={`/app/purchases/view?id=${p.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{(p.supplierId && data.names.get(p.supplierId)) || t("noSupplier")}</p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(new Date(p.purchasedAt), { dateStyle: "medium" })} · {t("items", { count: data.counts.get(p.id) ?? 0 })}
                    </p>
                  </div>
                  {p.voidedAt ? (
                    <Badge variant="outline" className="text-muted-foreground">{tc("voided")}</Badge>
                  ) : (
                    p.total > p.amountPaid && (
                      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        {t("onCredit")}
                      </Badge>
                    )
                  )}
                  <Money value={p.total} className={cn("text-sm font-medium", p.voidedAt && "text-muted-foreground line-through")} />
                </Link>
              </li>
            ))}
          </ul>
          {data.more && (
            <Button variant="outline" className="mt-4 w-full" onClick={() => setLimit((l) => l + PAGE)}>
              {tc("viewAll")}
            </Button>
          )}
        </>
      )}
    </>
  );
}
