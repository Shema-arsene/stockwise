"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { PackageMinus, PackagePlus, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Money, PageHeader, useQty } from "@/components/app/page-parts";
import { QtyInput, parseQty } from "@/components/app/inputs";
import { StockBadge } from "@/components/app/stock-badge";
import { useShop } from "@/components/app/shop-context";
import { stockStatus } from "@/lib/local/hooks";
import { adjustStock, deleteProduct } from "@/lib/local/ops";
import { lineAmount, roundQty } from "@/lib/money";
import { cn } from "@/lib/utils";

export default function ProductViewPage() {
  return (
    <Suspense>
      <ProductView />
    </Suspense>
  );
}

function ProductView() {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const format = useFormatter();
  const qty = useQty();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const { db, user, can, memberName } = useShop();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const product = await db.products.get(id);
    if (!product) return null;
    const [level, category, moves] = await Promise.all([
      db.stockLevels.get(id),
      product.categoryId ? db.categories.get(product.categoryId) : undefined,
      db.stockMovements.where("productId").equals(id).toArray(),
    ]);
    moves.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { product, stock: level?.qty ?? 0, category, moves };
  }, [db, id]);

  if (data === undefined) return null;
  if (data === null) return <PageHeader title={tc("noResults")} back="/app/products" />;

  const { product, stock, category, moves } = data;
  const unit = t(`units.${product.unit}` as "units.pcs");
  const status = stockStatus(stock, product.reorderLevel);
  const showCost = can("cost.view");
  const margin = product.sellPrice > 0 ? ((product.sellPrice - product.costPrice) / product.sellPrice) * 100 : 0;

  async function onDelete() {
    await deleteProduct({ db, userId: user.id }, id);
    toast.success(t("deleted"));
    router.replace("/app/products");
  }

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={[category?.name, product.sku].filter(Boolean).join(" · ") || undefined}
        back="/app/products"
        actions={
          can("product.manage") && (
            <>
              <Button variant="outline" size="icon" asChild>
                <Link href={`/app/products/edit?id=${id}`} aria-label={tc("edit")}>
                  <Pencil />
                </Link>
              </Button>
              <Button variant="outline" size="icon" onClick={() => setDeleteOpen(true)} aria-label={tc("delete")}>
                <Trash2 />
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("inStock")}</p>
          <p className="mt-1 text-3xl font-semibold tabular">
            {qty(stock)} <span className="text-base font-normal text-muted-foreground">{unit}</span>
          </p>
          <StockBadge stock={stock} status={status} unit={product.unit} className="mt-2" />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("sellPrice")}</p>
          <Money value={product.sellPrice} className="mt-1 block text-2xl font-semibold" />
          {showCost && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("costPrice")}: <Money value={product.costPrice} />
            </p>
          )}
        </div>
        {showCost && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t("margin")}</p>
            <p className={cn("mt-1 text-2xl font-semibold tabular", margin < 0 && "text-destructive")}>
              {format.number(margin / 100, { style: "percent", maximumFractionDigits: 1 })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("stock")}: <Money value={lineAmount(product.costPrice, Math.max(stock, 0))} />
            </p>
          </div>
        )}
      </div>

      {can("stock.adjust") && (
        <Button variant="outline" className="mt-4 w-full sm:w-auto" onClick={() => setAdjustOpen(true)}>
          <SlidersHorizontal />
          {t("adjust")}
        </Button>
      )}

      <h2 className="mt-8 mb-3 font-semibold">{t("history")}</h2>
      {moves.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {moves.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", m.qty > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {m.qty > 0 ? <PackagePlus className="size-4" /> : <PackageMinus className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {m.type === "SALE" && m.refId ? (
                    <Link href={`/app/sales/view?id=${m.refId}`} className="hover:underline">
                      {t(`movement.${m.type}`)}
                    </Link>
                  ) : m.type === "PURCHASE" && m.refId && can("purchase.manage") ? (
                    <Link href={`/app/purchases/view?id=${m.refId}`} className="hover:underline">
                      {t(`movement.${m.type}`)}
                    </Link>
                  ) : (
                    t(`movement.${m.type}`)
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {format.dateTime(new Date(m.createdAt), { dateStyle: "medium", timeStyle: "short" })} · {memberName(m.userId)}
                  {m.note && ` · ${m.note}`}
                </p>
              </div>
              <span className={cn("tabular text-sm font-medium", m.qty > 0 ? "text-primary" : "text-foreground")}>
                {m.qty > 0 ? "+" : "−"}
                {qty(Math.abs(m.qty))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <AdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} productId={id} stock={stock} unit={unit} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{product.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type Mode = "add" | "remove" | "set";

function AdjustDialog({
  open,
  onOpenChange,
  productId,
  stock,
  unit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  productId: string;
  stock: number;
  unit: string;
}) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const qty = useQty();
  const { db, user } = useShop();
  const [mode, setMode] = useState<Mode>("remove");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parsed = parseQty(value);
  const delta = parsed === null ? null : mode === "add" ? parsed : mode === "remove" ? -parsed : roundQty(parsed - stock);

  async function submit() {
    if (delta === null || (mode !== "set" && parsed === 0)) return setError(tc("invalidQty"));
    await adjustStock({ db, userId: user.id }, productId, delta, reason.trim() || null);
    toast.success(t("adjusted"));
    setValue("");
    setReason("");
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adjustTitle")}</DialogTitle>
          <DialogDescription>{t("adjustHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {(["add", "remove", "set"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded-md px-2 py-1.5 text-xs font-medium sm:text-sm", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                {t(m === "add" ? "adjustAdd" : m === "remove" ? "adjustRemove" : "adjustSet")}
              </button>
            ))}
          </div>
          <Field label={mode === "set" ? t("adjustCount") : t("adjustQty")} htmlFor="adj-qty" error={error}>
            <QtyInput id="adj-qty" autoFocus unit={unit} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          {delta !== null && value && (
            <p className="text-sm text-muted-foreground tabular">
              {qty(stock)} → <span className="font-medium text-foreground">{qty(roundQty(stock + delta))}</span> {unit}
            </p>
          )}
          <Field label={t("adjustReason")} htmlFor="adj-reason" optional={tc("optional")}>
            <Input id="adj-reason" placeholder={t("adjustReasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} className="h-10" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!value || delta === 0}>
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
