"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import { PageHeader, RequirePermission } from "@/components/app/page-parts";
import { MoneyInput, QtyInput, parseQty } from "@/components/app/inputs";
import { useShop } from "@/components/app/shop-context";
import { useCategories } from "@/lib/local/hooks";
import { saveCategory, saveProduct } from "@/lib/local/ops";
import { ngweeToInput, toNgwee } from "@/lib/money";
import { UNITS } from "@/lib/units";
import type { Product } from "@/lib/sync/tables";

export default function ProductEditPage() {
  return (
    <RequirePermission permission="product.manage">
      <Suspense>
        <ProductForm />
      </Suspense>
    </RequirePermission>
  );
}

interface FormState {
  name: string;
  sku: string;
  unit: string;
  categoryId: string;
  costPrice: string;
  sellPrice: string;
  reorderLevel: string;
  openingStock: string;
  vatApplicable: boolean;
}

const EMPTY: FormState = {
  name: "",
  sku: "",
  unit: "pcs",
  categoryId: "none",
  costPrice: "",
  sellPrice: "",
  reorderLevel: "",
  openingStock: "",
  vatApplicable: true,
};

function ProductForm() {
  const id = useSearchParams().get("id");
  const { db } = useShop();
  // "loading" until Dexie answers; null when the id doesn't exist.
  const existing = useLiveQuery(async () => (id ? ((await db.products.get(id)) ?? null) : null), [db, id], "loading" as const);
  if (existing === "loading") return null;
  return <ProductFormBody key={id ?? "new"} id={id} existing={existing} />;
}

function toForm(p: Product | null): FormState {
  if (!p) return EMPTY;
  return {
    name: p.name,
    sku: p.sku ?? "",
    unit: p.unit,
    categoryId: p.categoryId ?? "none",
    costPrice: ngweeToInput(p.costPrice),
    sellPrice: ngweeToInput(p.sellPrice),
    reorderLevel: p.reorderLevel ? String(p.reorderLevel) : "",
    openingStock: "",
    vatApplicable: p.vatApplicable,
  };
}

function ProductFormBody({ id, existing }: { id: string | null; existing: Product | null }) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const router = useRouter();
  const { db, user, shop } = useShop();
  const categories = useCategories();

  // Initialised once from the stored product; later sync updates don't overwrite what's being typed.
  const [form, setForm] = useState<FormState>(() => toForm(existing));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [pending, setPending] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const costPrice = form.costPrice.trim() ? toNgwee(form.costPrice) : 0;
    const sellPrice = form.sellPrice.trim() ? toNgwee(form.sellPrice) : 0;
    const reorderLevel = form.reorderLevel.trim() ? parseQty(form.reorderLevel) : 0;
    const openingStock = form.openingStock.trim() ? parseQty(form.openingStock) : 0;
    if (!form.name.trim()) next.name = t("nameRequired");
    if (costPrice === null || costPrice < 0) next.costPrice = tc("invalidAmount");
    if (sellPrice === null || sellPrice < 0) next.sellPrice = tc("invalidAmount");
    if (reorderLevel === null) next.reorderLevel = tc("invalidQty");
    if (openingStock === null) next.openingStock = tc("invalidQty");
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    try {
      const product = await saveProduct(
        { db, userId: user.id },
        {
          id: id ?? undefined,
          name: form.name,
          sku: form.sku,
          unit: form.unit,
          categoryId: form.categoryId === "none" ? null : form.categoryId,
          costPrice: costPrice!,
          sellPrice: sellPrice!,
          reorderLevel: reorderLevel!,
          vatApplicable: form.vatApplicable,
          openingStock: id ? undefined : openingStock!,
        },
      );
      toast.success(t("saved"));
      router.replace(`/app/products/view?id=${product.id}`);
    } catch {
      toast.error(tc("somethingWrong"));
      setPending(false);
    }
  }

  async function addCategory() {
    if (!catName.trim()) return;
    const cat = await saveCategory({ db, userId: user.id }, { name: catName });
    set("categoryId", cat.id);
    setCatName("");
    setCatOpen(false);
  }

  return (
    <>
      <PageHeader title={id ? t("editTitle") : t("newTitle")} back />
      <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
        <Field label={t("name")} htmlFor="name" error={errors.name}>
          <Input id="name" autoFocus={!id} placeholder={t("namePlaceholder")} value={form.name} onChange={(e) => set("name", e.target.value)} className="h-10" aria-invalid={!!errors.name} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("category")}>
            <div className="flex gap-1">
              <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger className="h-10 w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noCategory")}</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" className="size-10 shrink-0" onClick={() => setCatOpen(true)} aria-label={t("newCategory")}>
                <Plus />
              </Button>
            </div>
          </Field>
          <Field label={t("unit")}>
            <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {t(`units.${u}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("costPrice")} htmlFor="cost" hint={t("costPriceHint")} error={errors.costPrice}>
            <MoneyInput id="cost" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} aria-invalid={!!errors.costPrice} />
          </Field>
          <Field label={t("sellPrice")} htmlFor="sell" hint={t("sellPriceHint")} error={errors.sellPrice}>
            <MoneyInput id="sell" value={form.sellPrice} onChange={(e) => set("sellPrice", e.target.value)} aria-invalid={!!errors.sellPrice} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!id && (
            <Field label={t("openingStock")} htmlFor="opening" hint={t("openingStockHint")} error={errors.openingStock}>
              <QtyInput id="opening" unit={t(`units.${form.unit}` as "units.pcs")} value={form.openingStock} onChange={(e) => set("openingStock", e.target.value)} />
            </Field>
          )}
          <Field label={t("reorderLevel")} htmlFor="reorder" hint={t("reorderLevelHint")} error={errors.reorderLevel}>
            <QtyInput id="reorder" unit={t(`units.${form.unit}` as "units.pcs")} value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} />
          </Field>
        </div>

        <Field label={t("sku")} htmlFor="sku" optional={tc("optional")}>
          <Input id="sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} className="h-10" />
        </Field>

        {shop.vatEnabled && (
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            {t("vatApplicable")}
            <Switch checked={form.vatApplicable} onCheckedChange={(v) => set("vatApplicable", v)} />
          </label>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="submit" size="lg" className="h-10 flex-1 sm:flex-none" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
          <Button type="button" variant="outline" size="lg" className="h-10" onClick={() => router.back()}>
            {tc("cancel")}
          </Button>
        </div>
      </form>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newCategory")}</DialogTitle>
          </DialogHeader>
          <Field label={t("categoryName")} htmlFor="cat-name">
            <Input
              id="cat-name"
              autoFocus
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void addCategory())}
              className="h-10"
            />
          </Field>
          <DialogFooter>
            <Button type="button" onClick={() => void addCategory()} disabled={!catName.trim()}>
              {tc("add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
