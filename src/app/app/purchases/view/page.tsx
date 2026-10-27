"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Ban, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Money, PageHeader, RequirePermission, useQty } from "@/components/app/page-parts";
import { useShop } from "@/components/app/shop-context";
import { voidPurchase } from "@/lib/local/ops";

export default function PurchaseViewPage() {
  return (
    <RequirePermission permission="purchase.manage">
      <Suspense>
        <PurchaseView />
      </Suspense>
    </RequirePermission>
  );
}

function PurchaseView() {
  const t = useTranslations("purchases");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const tp = useTranslations("products");
  const format = useFormatter();
  const qty = useQty();
  const id = useSearchParams().get("id") ?? "";
  const { db, user, can, memberName } = useShop();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");

  const data = useLiveQuery(async () => {
    const purchase = await db.purchases.get(id);
    if (!purchase) return null;
    const items = await db.purchaseItems.where("purchaseId").equals(id).toArray();
    const products = await db.products.bulkGet(items.map((i) => i.productId));
    const supplier = purchase.supplierId ? await db.suppliers.get(purchase.supplierId) : undefined;
    return { purchase, items: items.map((item, i) => ({ item, product: products[i] })), supplier };
  }, [db, id]);

  if (data === undefined) return null;
  if (data === null) return <PageHeader title={tc("noResults")} back="/app/purchases" />;
  const { purchase, items, supplier } = data;

  async function onVoid() {
    await voidPurchase({ db, userId: user.id }, id, reason.trim() || null);
    toast.success(t("voidedOk"));
    setVoidOpen(false);
  }

  return (
    <>
      <PageHeader
        title={supplier?.name ?? t("purchase")}
        subtitle={`${format.dateTime(new Date(purchase.purchasedAt), { dateStyle: "medium", timeStyle: "short" })} · ${memberName(purchase.userId)}`}
        back="/app/purchases"
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {purchase.voidedAt && <Badge variant="destructive">{tc("voided")}</Badge>}
        <Badge variant="outline">{purchase.amountPaid >= purchase.total ? t("paidInFull") : t("onCredit")}</Badge>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {items.map(({ item, product }) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              {product ? (
                <Link href={`/app/products/view?id=${product.id}`} className="truncate font-medium hover:underline">
                  {product.name}
                </Link>
              ) : (
                "—"
              )}
              <p className="text-xs text-muted-foreground tabular">
                {qty(item.qty)} {tp(`units.${product?.unit ?? "pcs"}` as "units.pcs")} × <Money value={item.unitCost} />
              </p>
            </div>
            <Money value={item.lineTotal} className="text-sm font-medium" />
          </li>
        ))}
        <li className="flex items-center justify-between px-4 py-3">
          <span className="font-medium">{ts("total")}</span>
          <Money value={purchase.total} className="text-lg font-semibold" />
        </li>
        {purchase.amountPaid < purchase.total && (
          <>
            <li className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-muted-foreground">{t("paidAtPurchase")}</span>
              <Money value={purchase.amountPaid} />
            </li>
            <li className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-muted-foreground">{t("boughtOnCredit")}</span>
              <Money value={purchase.total - purchase.amountPaid} className="font-medium" />
            </li>
          </>
        )}
      </ul>
      {supplier && purchase.amountPaid < purchase.total && (
        <Button variant="outline" asChild className="mt-3 w-full sm:w-auto">
          <Link href={`/app/suppliers/view?id=${supplier.id}`}>
            <HandCoins />
            {t("seeSupplierBalance")}
          </Link>
        </Button>
      )}
      {purchase.note && <p className="mt-3 text-sm text-muted-foreground">{purchase.note}</p>}

      {can("sale.void") && !purchase.voidedAt && (
        <Button variant="destructive" className="mt-6 w-full sm:w-auto" onClick={() => setVoidOpen(true)}>
          <Ban />
          {tc("void")}
        </Button>
      )}

      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("voidTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("voidHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input placeholder={ts("voidReason")} value={reason} onChange={(e) => setReason(e.target.value)} className="h-10" />
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onVoid()}>
              {tc("void")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
