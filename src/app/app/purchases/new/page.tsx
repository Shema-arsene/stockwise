"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Banknote, HandCoins, Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { EmptyState, Money, PageHeader, RequirePermission, useMoney } from "@/components/app/page-parts";
import { MoneyInput, QtyInput, parseQty } from "@/components/app/inputs";
import { ProductPicker } from "@/components/app/product-picker";
import { SupplierDialog } from "@/components/app/supplier-dialog";
import { useShop } from "@/components/app/shop-context";
import { useProducts, useSuppliers, type ProductWithStock } from "@/lib/local/hooks";
import { recordPurchase } from "@/lib/local/ops";
import { lineAmount, ngweeToInput, toNgwee } from "@/lib/money";
import { cn } from "@/lib/utils";

export default function NewPurchasePage() {
  return (
    <RequirePermission permission="purchase.manage">
      <PurchaseForm />
    </RequirePermission>
  );
}

interface Line {
  productId: string;
  qty: string;
  cost: string;
}

function PurchaseForm() {
  const t = useTranslations("purchases");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const tp = useTranslations("products");
  const router = useRouter();
  const { db, user } = useShop();
  const products = useProducts();
  const suppliers = useSuppliers();
  const money = useMoney();

  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState("none");
  const [onCredit, setOnCredit] = useState(false);
  const [paidNow, setPaidNow] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [updateCost, setUpdateCost] = useState(true);
  const [note, setNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const parsed = lines.map((l) => ({ productId: l.productId, qty: parseQty(l.qty), unitCost: toNgwee(l.cost) }));
  const valid = parsed.filter((l): l is { productId: string; qty: number; unitCost: number } => l.qty !== null && l.qty > 0 && l.unitCost !== null && l.unitCost >= 0);
  const total = valid.reduce((s, l) => s + lineAmount(l.unitCost, l.qty), 0);
  const paidNowNgwee = paidNow.trim() ? toNgwee(paidNow) : 0;
  const willOwe = onCredit && paidNowNgwee !== null ? Math.max(total - paidNowNgwee, 0) : 0;
  const needsSupplier = onCredit && supplierId === "none";

  function addProduct(p: ProductWithStock) {
    if (lines.some((l) => l.productId === p.id)) return;
    setLines((prev) => [...prev, { productId: p.id, qty: "", cost: ngweeToInput(p.costPrice) }]);
  }

  function update(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (!lines.length || valid.length !== lines.length) return toast.error(lines.length ? tc("invalidQty") : ts("noItems"));
    if (needsSupplier) {
      setShowErrors(true);
      return toast.error(t("supplierRequired"));
    }
    if (paidNowNgwee === null) return toast.error(tc("invalidAmount"));
    setPending(true);
    try {
      const purchase = await recordPurchase(
        { db, userId: user.id },
        {
          supplierId: supplierId === "none" ? null : supplierId,
          items: valid,
          amountPaid: onCredit ? paidNowNgwee : total,
          note: note.trim() || null,
          updateCostPrices: updateCost,
        },
      );
      toast.success(t("recorded"));
      router.replace(`/app/purchases/view?id=${purchase.id}`);
    } catch {
      toast.error(tc("somethingWrong"));
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader title={t("new")} back="/app/purchases" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <section>
          {lines.length === 0 ? (
            <EmptyState
              icon={Truck}
              title={ts("noItems")}
              hint={t("emptyHint")}
              action={
                <Button onClick={() => setPickerOpen(true)} disabled={!products?.length}>
                  <Plus />
                  {ts("addItem")}
                </Button>
              }
            />
          ) : (
            <>
              <ul className="divide-y rounded-xl border bg-card">
                {lines.map((l, i) => {
                  const p = productMap.get(l.productId);
                  const q = parsed[i].qty;
                  const c = parsed[i].unitCost;
                  return (
                    <li key={l.productId} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-medium">{p?.name ?? "—"}</p>
                        <Button variant="ghost" size="icon-sm" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} aria-label={tc("delete")}>
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                        <Field label={ts("qty")} htmlFor={`qty-${i}`}>
                          <QtyInput id={`qty-${i}`} autoFocus={i === lines.length - 1} unit={tp(`units.${p?.unit ?? "pcs"}` as "units.pcs")} value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} aria-invalid={!!l.qty && (q === null || q <= 0)} />
                        </Field>
                        <Field label={t("unitCost")} htmlFor={`cost-${i}`}>
                          <MoneyInput id={`cost-${i}`} value={l.cost} onChange={(e) => update(i, { cost: e.target.value })} aria-invalid={c === null} />
                        </Field>
                        <span className="pb-2.5 text-right text-sm font-medium tabular">{q !== null && c !== null ? money(lineAmount(c, q)) : "—"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Button variant="outline" className="mt-3 w-full" onClick={() => setPickerOpen(true)}>
                <Plus />
                {ts("addItem")}
              </Button>
            </>
          )}
        </section>

        <aside className="space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-6">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{ts("total")}</span>
            <Money value={total} className="text-2xl font-semibold" />
          </div>
          <Field label={t("payment")}>
            <div className="grid grid-cols-2 gap-2">
              {([false, true] as const).map((credit) => {
                const Icon = credit ? HandCoins : Banknote;
                return (
                  <button
                    key={String(credit)}
                    type="button"
                    onClick={() => setOnCredit(credit)}
                    aria-pressed={onCredit === credit}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
                      onCredit === credit ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                    )}
                  >
                    <Icon className="size-5" />
                    {credit ? t("onCredit") : t("paidInFull")}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field
            label={t("supplier")}
            optional={onCredit ? undefined : tc("optional")}
            error={showErrors && needsSupplier ? t("supplierRequired") : undefined}
          >
            <div className="flex gap-1">
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-10 w-full min-w-0" aria-label={t("supplier")} aria-invalid={showErrors && needsSupplier}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noSupplier")}</SelectItem>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" className="size-10 shrink-0" onClick={() => setSupplierOpen(true)} aria-label={t("newSupplier")}>
                <Plus />
              </Button>
            </div>
          </Field>
          {onCredit && (
            <Field
              label={t("amountPaidNow")}
              htmlFor="paid-now"
              hint={willOwe > 0 ? t("willOwe", { amount: money(willOwe) }) : t("amountPaidNowHint")}
              error={paidNowNgwee === null ? tc("invalidAmount") : undefined}
            >
              <MoneyInput id="paid-now" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
            </Field>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("updateCost")}
            <Switch checked={updateCost} onCheckedChange={setUpdateCost} />
          </label>
          <Field label={tc("note")} htmlFor="p-note" optional={tc("optional")}>
            <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-10" />
          </Field>
          <Button size="lg" className="h-12 w-full text-base" onClick={() => void submit()} disabled={pending || !lines.length}>
            {pending && <Loader2 className="animate-spin" />}
            {t("record")}
          </Button>
        </aside>
      </div>

      {products && <ProductPicker open={pickerOpen} onOpenChange={setPickerOpen} products={products} onPick={addProduct} price="cost" />}
      <SupplierDialog open={supplierOpen} onOpenChange={setSupplierOpen} onSaved={(s) => setSupplierId(s.id)} />
    </>
  );
}
