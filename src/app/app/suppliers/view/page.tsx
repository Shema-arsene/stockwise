"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Banknote, MapPin, MessageCircle, Pencil, Phone, Smartphone, Trash2, Truck, Undo2 } from "lucide-react";
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
import { Money, PageHeader, RequirePermission, useMoney } from "@/components/app/page-parts";
import { MoneyInput } from "@/components/app/inputs";
import { SupplierDialog } from "@/components/app/supplier-dialog";
import { useShop } from "@/components/app/shop-context";
import { deleteSupplier, recordSupplierPayment, voidSupplierPayment } from "@/lib/local/ops";
import { agePayable } from "@/lib/debt";
import { toNgwee } from "@/lib/money";
import { waNumber } from "@/lib/phone";
import type { Purchase, SupplierPayment } from "@/lib/sync/tables";
import { cn } from "@/lib/utils";

export default function SupplierViewPage() {
  return (
    <RequirePermission permission="purchase.manage">
      <Suspense>
        <SupplierView />
      </Suspense>
    </RequirePermission>
  );
}

type Entry = { kind: "purchase"; at: string; row: Purchase } | { kind: "payment"; at: string; row: SupplierPayment };

const DEBTS = "/app/customers?tab=suppliers";

/** One supplier: what the shop owes them, credit purchases and instalment payments. */
function SupplierView() {
  const t = useTranslations("supplierDebt");
  const tp = useTranslations("purchases");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const format = useFormatter();
  const money = useMoney();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const { db, user, can, memberName } = useShop();
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [voiding, setVoiding] = useState<SupplierPayment | null>(null);

  const data = useLiveQuery(async () => {
    const supplier = await db.suppliers.get(id);
    if (!supplier) return null;
    const [purchases, payments] = await Promise.all([
      db.purchases.where("supplierId").equals(id).toArray(),
      db.supplierPayments.where("supplierId").equals(id).toArray(),
    ]);
    const entries: Entry[] = [
      ...purchases.map((row) => ({ kind: "purchase" as const, at: row.purchasedAt, row })),
      ...payments.map((row) => ({ kind: "payment" as const, at: row.paidAt, row })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    const live = purchases.filter((p) => !p.voidedAt);
    return {
      supplier,
      entries,
      aging: agePayable(purchases, payments),
      bought: live.reduce((s, p) => s + p.total, 0),
      creditTaken: live.reduce((s, p) => s + (p.total - p.amountPaid), 0),
      paidBack: payments.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0),
    };
  }, [db, id]);

  if (data === undefined) return null;
  if (data === null) return <PageHeader title={tc("noResults")} back={DEBTS} />;
  const { supplier, entries, aging } = data;

  return (
    <>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.phone ?? undefined}
        back={DEBTS}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => setEditOpen(true)} aria-label={tc("edit")}>
              <Pencil />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setDeleteOpen(true)} aria-label={tc("delete")}>
              <Trash2 />
            </Button>
          </>
        }
      />

      <section className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("youOwe")}</p>
        <Money value={Math.max(aging.owed, 0)} className={cn("mt-1 block text-3xl font-semibold", aging.owed > 0 && aging.d60plus > 0 && "text-destructive")} />
        {aging.owed < 0 && <p className="text-sm text-muted-foreground">{t("overpaid", { amount: money(-aging.owed) })}</p>}
        {aging.owed > 0 && (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div><dt>{t("age0")}</dt><dd className="text-sm text-foreground"><Money value={aging.d0_30} /></dd></div>
            <div><dt>{t("age30")}</dt><dd className="text-sm text-foreground"><Money value={aging.d31_60} /></dd></div>
            <div><dt>{t("age60")}</dt><dd className="text-sm text-foreground"><Money value={aging.d60plus} /></dd></div>
          </dl>
        )}
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-xs text-muted-foreground">
          <div><dt>{t("bought")}</dt><dd className="text-sm text-foreground"><Money value={data.bought} /></dd></div>
          <div><dt>{t("onCredit")}</dt><dd className="text-sm text-foreground"><Money value={data.creditTaken} /></dd></div>
          <div><dt>{t("paidBack")}</dt><dd className="text-sm text-foreground"><Money value={data.paidBack} /></dd></div>
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
          <Button onClick={() => setPayOpen(true)} disabled={aging.owed <= 0} className="col-span-2 sm:col-span-1">
            <Banknote />
            {t("pay")}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/app/purchases/new">
              <Truck />
              {tp("new")}
            </Link>
          </Button>
          {supplier.phone && (
            <>
              <Button variant="outline" asChild>
                <a href={`tel:${supplier.phone}`}>
                  <Phone />
                  {t("call")}
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`https://wa.me/${waNumber(supplier.phone)}`} target="_blank" rel="noopener">
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
            </>
          )}
        </div>
        {supplier.address && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            {supplier.address}
          </p>
        )}
      </section>

      <h2 className="mt-8 mb-3 font-semibold">{t("history")}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {entries.map((e) => {
            const voided = !!e.row.voidedAt;
            const when = format.dateTime(new Date(e.at), { dateStyle: "medium", timeStyle: "short" });
            if (e.kind === "purchase") {
              const p = e.row;
              const credit = p.total - p.amountPaid;
              return (
                <li key={p.id}>
                  <Link href={`/app/purchases/view?id=${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", credit > 0 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                      <Truck className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", voided && "line-through text-muted-foreground")}>{credit > 0 ? t("creditPurchase") : t("paidPurchase")}</p>
                      <p className="text-xs text-muted-foreground">
                        {when} · {tc("total")} {money(p.total)}
                        {credit > 0 && p.amountPaid > 0 && ` · ${t("paidNow")} ${money(p.amountPaid)}`}
                      </p>
                    </div>
                    <span className={cn("text-sm font-medium tabular", voided && "line-through text-muted-foreground")}>
                      {credit > 0 ? <>+<Money value={credit} /></> : <Money value={p.total} className="text-muted-foreground" />}
                    </span>
                  </Link>
                </li>
              );
            }
            const p = e.row;
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {p.method === "MOBILE_MONEY" ? <Smartphone className="size-4" /> : <Banknote className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", voided && "line-through text-muted-foreground")}>
                    {t("payment")} · {ts(p.method)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {when} · {memberName(p.userId)}
                    {p.note && ` · ${p.note}`}
                  </p>
                </div>
                <span className={cn("text-sm font-medium tabular text-primary", voided && "line-through text-muted-foreground")}>
                  −<Money value={p.amount} />
                </span>
                {!voided && can("sale.void") && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setVoiding(p)} aria-label={tc("void")}>
                    <Undo2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <PayDialog open={payOpen} onOpenChange={setPayOpen} supplierId={id} owed={aging.owed} />
      <SupplierDialog open={editOpen} onOpenChange={setEditOpen} supplier={supplier} onSaved={() => toast.success(t("saved"))} />

      <AlertDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("voidTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("voidHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => voiding && void voidSupplierPayment({ db, userId: user.id }, voiding.id).then(() => setVoiding(null))}>
              {tc("void")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{supplier.name}</AlertDialogTitle>
            <AlertDialogDescription>{aging.owed > 0 ? t("deleteOwing") : t("deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void deleteSupplier({ db, userId: user.id }, id).then(() => router.replace(DEBTS))}>
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Pay a supplier all or part (an instalment) of what the shop owes. */
function PayDialog({ open, onOpenChange, supplierId, owed }: { open: boolean; onOpenChange: (o: boolean) => void; supplierId: string; owed: number }) {
  const t = useTranslations("supplierDebt");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const money = useMoney();
  const { db, user } = useShop();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SupplierPayment["method"]>("CASH");
  const [note, setNote] = useState("");
  const [confirmOver, setConfirmOver] = useState(false);
  const value = toNgwee(amount);
  const invalid = amount !== "" && (value === null || value <= 0);
  const left = value !== null && value > 0 ? owed - value : null;

  async function submit(force = false) {
    if (value === null || value <= 0) return;
    if (value > owed && !force) return setConfirmOver(true);
    await recordSupplierPayment({ db, userId: user.id }, { supplierId, amount: value, method, note: note.trim() || null });
    toast.success(t("paid"));
    setAmount("");
    setNote("");
    setConfirmOver(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pay")}</DialogTitle>
          <DialogDescription>
            {t("youOwe")}: {money(owed)}. {t("instalmentHint")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field
            label={t("amount")}
            htmlFor="sup-pay-amount"
            error={invalid ? tc("invalidAmount") : undefined}
            hint={left !== null && left > 0 ? t("leftAfter", { amount: money(left) }) : undefined}
          >
            <MoneyInput id="sup-pay-amount" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={invalid} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[owed, Math.round(owed / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
              <Button key={v} type="button" variant="secondary" size="sm" onClick={() => setAmount((v / 100).toFixed(2))}>
                {money(v)}
              </Button>
            ))}
          </div>
          <Field label={t("method")}>
            <div className="grid grid-cols-2 gap-2">
              {(["CASH", "MOBILE_MONEY"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={cn("rounded-lg border px-3 py-2 text-sm font-medium", method === m ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}
                >
                  {ts(m)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={tc("note")} htmlFor="sup-pay-note" optional={tc("optional")}>
            <Input id="sup-pay-note" placeholder={t("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} className="h-10" />
          </Field>
          {confirmOver && <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">{t("overpay", { amount: money(owed) })}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit(confirmOver)} disabled={value === null || value <= 0}>
            {confirmOver ? tc("confirm") : t("pay")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
