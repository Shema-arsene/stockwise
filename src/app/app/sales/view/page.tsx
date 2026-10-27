"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Ban, Plus, Printer, Share2 } from "lucide-react";
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
import { Money, PageHeader, useMoney, useQty } from "@/components/app/page-parts";
import { useShop } from "@/components/app/shop-context";
import { voidSale } from "@/lib/local/ops";
import { lineAmount } from "@/lib/money";

export default function SaleViewPage() {
  return (
    <Suspense>
      <SaleView />
    </Suspense>
  );
}

function SaleView() {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const tp = useTranslations("products");
  const format = useFormatter();
  const money = useMoney();
  const qty = useQty();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const isNew = params.get("new") === "1";
  const { db, user, shop, can, memberName } = useShop();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");

  const data = useLiveQuery(async () => {
    const sale = await db.sales.get(id);
    if (!sale) return null;
    const items = await db.saleItems.where("saleId").equals(id).toArray();
    const products = await db.products.bulkGet(items.map((i) => i.productId));
    const customer = sale.customerId ? await db.customers.get(sale.customerId) : undefined;
    return { sale, items: items.map((item, i) => ({ item, product: products[i] })), customer };
  }, [db, id]);

  if (data === undefined) return null;
  if (data === null) return <PageHeader title={tc("noResults")} back="/app/sales" />;
  const { sale, items, customer } = data;
  const balance = sale.total - sale.amountPaid;
  const date = format.dateTime(new Date(sale.soldAt), { dateStyle: "medium", timeStyle: "short" });

  function receiptText() {
    const lines = [
      shop.name,
      t("receiptNo", { number: sale.number }),
      date,
      "",
      ...items.map(({ item, product }) => `${product?.name ?? "?"}  ${qty(item.qty)} × ${money(item.unitPrice)} = ${money(item.lineTotal)}`),
      "",
      `${t("total")}: ${money(sale.total)}`,
      `${t("payment")}: ${t(sale.paymentType)}`,
      ...(balance > 0 ? [`${t("balanceDue")}: ${money(balance)}`] : []),
      "",
      t("thanks"),
    ];
    return lines.join("\n");
  }

  async function share() {
    const text = receiptText();
    if (navigator.share) {
      try {
        await navigator.share({ title: t("receiptNo", { number: sale.number }), text });
        return;
      } catch {
        // cancelled: fall through to WhatsApp
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  async function onVoid() {
    await voidSale({ db, userId: user.id }, id, reason.trim() || null);
    toast.success(t("voidedOk"));
    setVoidOpen(false);
  }

  return (
    <>
      <PageHeader
        title={t("receiptNo", { number: sale.number })}
        back="/app/sales"
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => window.print()} aria-label={tc("print")}>
              <Printer />
            </Button>
            <Button variant="outline" size="icon" onClick={() => void share()} aria-label={t("share")}>
              <Share2 />
            </Button>
          </>
        }
      />

      {isNew && (
        <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="h-11 flex-1">
            <Link href="/app/sales/new">
              <Plus />
              {t("new")}
            </Link>
          </Button>
        </div>
      )}

      {/* The receipt itself: also what gets printed */}
      <article className="mx-auto max-w-md rounded-xl border bg-card p-5 font-mono text-sm print:max-w-none print:border-0 print:p-0">
        <header className="mb-4 text-center">
          <p className="font-sans text-base font-semibold">{shop.name}</p>
          {shop.address && <p className="text-xs text-muted-foreground">{shop.address}</p>}
          {shop.phone && <p className="text-xs text-muted-foreground">{shop.phone}</p>}
          {shop.vatEnabled && shop.tpin && <p className="text-xs text-muted-foreground">{t("vatTpin", { tpin: shop.tpin })}</p>}
        </header>

        <div className="mb-3 flex justify-between text-xs text-muted-foreground">
          <span>#{sale.number}</span>
          <span>{date}</span>
        </div>
        {sale.voidedAt && (
          <Badge variant="destructive" className="mb-3 w-full justify-center py-1">
            {tc("voided")} · {format.dateTime(new Date(sale.voidedAt), { dateStyle: "medium", timeStyle: "short" })}
          </Badge>
        )}

        <ul className="space-y-2 border-y border-dashed py-3">
          {items.map(({ item, product }) => (
            <li key={item.id}>
              <p className="font-sans">{product?.name ?? "—"}</p>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {qty(item.qty)} {tp(`units.${product?.unit ?? "pcs"}` as "units.pcs")} × {money(item.unitPrice)}
                </span>
                <span className="text-foreground">{money(lineAmount(item.unitPrice, item.qty))}</span>
              </div>
            </li>
          ))}
        </ul>

        <dl className="space-y-1 pt-3">
          {sale.vatAmount > 0 && (
            <>
              <div className="flex justify-between">
                <dt>{t("subtotal")}</dt>
                <dd>{money(sale.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("vat", { rate: shop.vatRate / 100 })}</dt>
                <dd>{money(sale.vatAmount)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between text-base font-semibold">
            <dt>{t("total")}</dt>
            <dd>{money(sale.total)}</dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>{t("payment")}</dt>
            <dd>{t(sale.paymentType)}</dd>
          </div>
          {sale.paymentType === "CREDIT" && (
            <>
              <div className="flex justify-between text-muted-foreground">
                <dt>{t("paidAmount")}</dt>
                <dd>{money(sale.amountPaid)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>{t("balanceDue")}</dt>
                <dd>{money(balance)}</dd>
              </div>
            </>
          )}
          {customer && (
            <div className="flex justify-between text-muted-foreground">
              <dt>{t("customer")}</dt>
              <dd>
                <Link href={`/app/customers/view?id=${customer.id}`} className="underline-offset-2 hover:underline">
                  {customer.name}
                </Link>
              </dd>
            </div>
          )}
        </dl>

        {sale.note && <p className="mt-3 border-t border-dashed pt-3 text-xs text-muted-foreground">{sale.note}</p>}

        <footer className="mt-4 border-t border-dashed pt-3 text-center text-xs text-muted-foreground">
          <p>{t("soldBy", { name: memberName(sale.userId) })}</p>
          <p className="mt-1">{t("thanks")}</p>
        </footer>
      </article>

      {can("cost.view") && !sale.voidedAt && (
        <p className="no-print mx-auto mt-3 max-w-md text-center text-sm text-muted-foreground">
          {t("profit")}: <Money value={sale.subtotal - sale.costTotal} className="font-medium text-foreground" />
        </p>
      )}

      {can("sale.void") && !sale.voidedAt && (
        <div className="no-print mx-auto mt-6 max-w-md">
          <Button variant="destructive" className="w-full" onClick={() => setVoidOpen(true)}>
            <Ban />
            {tc("void")}
          </Button>
        </div>
      )}

      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("voidTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("voidHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input placeholder={t("voidReason")} value={reason} onChange={(e) => setReason(e.target.value)} className="h-10" />
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
