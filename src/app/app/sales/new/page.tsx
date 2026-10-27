"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Banknote, CreditCard, Loader2, Minus, Plus, Smartphone, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Field } from "@/components/form-field";
import { EmptyState, Money, PageHeader, RequirePermission, useMoney, useQty } from "@/components/app/page-parts";
import { MoneyInput, parseQty } from "@/components/app/inputs";
import { ProductPicker } from "@/components/app/product-picker";
import { CustomerPicker } from "@/components/app/customer-picker";
import { useShop } from "@/components/app/shop-context";
import { useCustomers, useProducts, type ProductWithStock } from "@/lib/local/hooks";
import { recordSale, saleTotals } from "@/lib/local/ops";
import { ngweeToInput, roundQty, toNgwee } from "@/lib/money";
import type { Sale } from "@/lib/sync/tables";
import { cn } from "@/lib/utils";

export default function NewSalePage() {
  return (
    <RequirePermission permission="sale.create">
      <Suspense>
        <SaleForm />
      </Suspense>
    </RequirePermission>
  );
}

interface Line {
  productId: string;
  qty: string; // raw text so "1." or "0,5" can be typed
  price: string;
}

const PAYMENTS: { value: Sale["paymentType"]; icon: typeof Banknote }[] = [
  { value: "CASH", icon: Banknote },
  { value: "MOBILE_MONEY", icon: Smartphone },
  { value: "CREDIT", icon: CreditCard },
];

function SaleForm() {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const tp = useTranslations("products");
  const router = useRouter();
  const params = useSearchParams();
  const { db, user, shop } = useShop();
  const products = useProducts();
  const customers = useCustomers();
  const money = useMoney();
  const fmtQty = useQty();

  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [payment, setPayment] = useState<Sale["paymentType"]>(params.get("customer") ? "CREDIT" : "CASH");
  const [customerId, setCustomerId] = useState<string | null>(params.get("customer"));
  const [paidNow, setPaidNow] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmStock, setConfirmStock] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  const parsed = lines.map((l) => ({ productId: l.productId, qty: parseQty(l.qty), unitPrice: toNgwee(l.price) }));
  const valid = parsed.filter((l): l is { productId: string; qty: number; unitPrice: number } => l.qty !== null && l.qty > 0 && l.unitPrice !== null && l.unitPrice >= 0);
  const allValid = valid.length === lines.length && lines.length > 0;
  const totals = saleTotals(valid, productMap, shop);
  const paidNowNgwee = paidNow.trim() ? toNgwee(paidNow) : 0;
  const owes = payment === "CREDIT" && paidNowNgwee !== null ? Math.max(totals.total - paidNowNgwee, 0) : 0;
  const overStock = valid.filter((l) => l.qty > (productMap.get(l.productId)?.stock ?? 0));

  function addProduct(p: ProductWithStock) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...prev];
        const q = parseQty(next[i].qty) ?? 0;
        next[i] = { ...next[i], qty: String(roundQty(q + 1)) };
        return next;
      }
      return [...prev, { productId: p.id, qty: "1", price: ngweeToInput(p.sellPrice) }];
    });
  }

  function update(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function step(i: number, delta: number) {
    const q = parseQty(lines[i].qty) ?? 0;
    const next = roundQty(q + delta);
    if (next <= 0) setLines((prev) => prev.filter((_, idx) => idx !== i));
    else update(i, { qty: String(next) });
  }

  async function submit(skipStockCheck = false) {
    setShowErrors(true);
    if (!allValid) return toast.error(lines.length ? tc("invalidQty") : t("noItems"));
    if (payment === "CREDIT" && !customerId) return toast.error(t("customerRequired"));
    if (paidNowNgwee === null) return toast.error(tc("invalidAmount"));
    if (!skipStockCheck && overStock.length) return setConfirmStock(true);

    setPending(true);
    try {
      const sale = await recordSale(
        { db, userId: user.id },
        { items: valid, paymentType: payment, customerId, amountPaid: paidNowNgwee, note: note.trim() || null },
        shop,
      );
      toast.success(t("recorded"));
      router.replace(`/app/sales/view?id=${sale.id}&new=1`);
    } catch {
      toast.error(tc("somethingWrong"));
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader title={t("new")} back="/app/sales" />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <section>
          {lines.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={t("noItems")}
              action={
                <Button onClick={() => setPickerOpen(true)} disabled={!products?.length}>
                  <Plus />
                  {t("addItem")}
                </Button>
              }
            />
          ) : (
            <>
              <ul className="divide-y rounded-xl border bg-card">
                {lines.map((l, i) => {
                  const p = productMap.get(l.productId);
                  const q = parsed[i].qty;
                  const price = parsed[i].unitPrice;
                  const over = q !== null && p && q > p.stock;
                  return (
                    <li key={l.productId} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p?.name ?? "—"}</p>
                          <p className={cn("text-xs", over ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                            {over ? t("insufficientStock", { qty: fmtQty(p.stock) }) : `${fmtQty(p?.stock ?? 0)} ${tp(`units.${p?.unit ?? "pcs"}` as "units.pcs")}`}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon-sm" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} aria-label={tc("delete")}>
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-lg border">
                          <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => step(i, -1)} aria-label="−1">
                            <Minus />
                          </Button>
                          <Input
                            inputMode="decimal"
                            value={l.qty}
                            onChange={(e) => update(i, { qty: e.target.value })}
                            aria-label={t("qty")}
                            aria-invalid={showErrors && (q === null || q <= 0)}
                            className="h-9 w-14 border-0 text-center tabular shadow-none focus-visible:ring-0"
                          />
                          <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => step(i, 1)} aria-label="+1">
                            <Plus />
                          </Button>
                        </div>
                        <span className="text-muted-foreground">×</span>
                        <div className="w-28">
                          <MoneyInput value={l.price} onChange={(e) => update(i, { price: e.target.value })} aria-label={t("unitPrice")} aria-invalid={showErrors && price === null} className="h-9" />
                        </div>
                        <span className="ml-auto text-right font-medium tabular">{q !== null && price !== null ? money(totals.amounts[valid.findIndex((v) => v.productId === l.productId)] ?? 0) : "—"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Button variant="outline" className="mt-3 w-full" onClick={() => setPickerOpen(true)}>
                <Plus />
                {t("addItem")}
              </Button>
            </>
          )}
        </section>

        <aside className="space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-6">
          <dl className="space-y-1 text-sm">
            {shop.vatEnabled && (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("subtotal")}</dt>
                  <dd><Money value={totals.subtotal} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("vat", { rate: shop.vatRate / 100 })}</dt>
                  <dd><Money value={totals.vatAmount} /></dd>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <dt className="font-medium">{t("total")}</dt>
              <dd><Money value={totals.total} className="text-2xl font-semibold" /></dd>
            </div>
          </dl>

          <Field label={t("payment")}>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPayment(value)}
                  aria-pressed={payment === value}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
                    payment === value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <Icon className="size-5" />
                  {t(value)}
                </button>
              ))}
            </div>
          </Field>

          {customers && (
            <Field label={t("customer")} optional={payment === "CREDIT" ? undefined : tc("optional")} error={showErrors && payment === "CREDIT" && !customerId ? t("customerRequired") : undefined}>
              <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} invalid={showErrors && payment === "CREDIT" && !customerId} />
            </Field>
          )}

          {payment === "CREDIT" && (
            <Field label={t("amountPaidNow")} htmlFor="paid-now" hint={owes > 0 ? t("willOwe", { amount: money(owes) }) : t("amountPaidNowHint")} error={paidNowNgwee === null ? tc("invalidAmount") : undefined}>
              <MoneyInput id="paid-now" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
            </Field>
          )}

          <Field label={tc("note")} htmlFor="sale-note" optional={tc("optional")}>
            <Input id="sale-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-10" />
          </Field>

          <Button size="lg" className="h-12 w-full text-base" onClick={() => void submit()} disabled={pending || lines.length === 0}>
            {pending && <Loader2 className="animate-spin" />}
            {t("record")} · {money(totals.total)}
          </Button>
        </aside>
      </div>

      {products && <ProductPicker open={pickerOpen} onOpenChange={setPickerOpen} products={products} onPick={addProduct} />}

      <AlertDialog open={confirmStock} onOpenChange={setConfirmStock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("record")}</AlertDialogTitle>
            <AlertDialogDescription>{t("stockWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit(true)}>{tc("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
