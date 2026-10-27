"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Banknote, MessageCircle, Pencil, Phone, Plus, ShoppingCart, Smartphone, Trash2, Undo2 } from "lucide-react";
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
import { CustomerDialog } from "@/components/app/customer-dialog";
import { useShop } from "@/components/app/shop-context";
import { deleteCustomer, recordDebtPayment, voidDebtPayment } from "@/lib/local/ops";
import { ageDebt } from "@/lib/debt";
import { toNgwee } from "@/lib/money";
import { waNumber } from "@/lib/phone";
import type { DebtPayment, Sale } from "@/lib/sync/tables";
import { cn } from "@/lib/utils";

export default function CustomerViewPage() {
  return (
    <RequirePermission permission="debt.record">
      <Suspense>
        <CustomerView />
      </Suspense>
    </RequirePermission>
  );
}

type Entry = { kind: "sale"; at: string; row: Sale } | { kind: "payment"; at: string; row: DebtPayment };

function CustomerView() {
  const t = useTranslations("customers");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const format = useFormatter();
  const money = useMoney();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const { db, user, shop, can, memberName } = useShop();
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [voiding, setVoiding] = useState<DebtPayment | null>(null);

  const data = useLiveQuery(async () => {
    const customer = await db.customers.get(id);
    if (!customer) return null;
    const [sales, payments] = await Promise.all([
      db.sales.where("customerId").equals(id).toArray(),
      db.debtPayments.where("customerId").equals(id).toArray(),
    ]);
    const entries: Entry[] = [
      ...sales.map((row) => ({ kind: "sale" as const, at: row.soldAt, row })),
      ...payments.map((row) => ({ kind: "payment" as const, at: row.paidAt, row })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return { customer, entries, aging: ageDebt(sales, payments) };
  }, [db, id]);

  if (data === undefined) return null;
  if (data === null) return <PageHeader title={tc("noResults")} back="/app/customers" />;
  const { customer, entries, aging } = data;

  const reminder = t("reminderText", { name: customer.name.split(" ")[0], shop: shop.name, amount: money(aging.owed) });

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={[customer.phone, customer.address].filter(Boolean).join(" · ") || undefined}
        back="/app/customers"
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => setEditOpen(true)} aria-label={tc("edit")}>
              <Pencil />
            </Button>
            {can("sale.void") && (
              <Button variant="outline" size="icon" onClick={() => setDeleteOpen(true)} aria-label={tc("delete")}>
                <Trash2 />
              </Button>
            )}
          </>
        }
      />

      <section className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("owes")}</p>
        <Money value={Math.max(aging.owed, 0)} className={cn("mt-1 block text-3xl font-semibold", aging.owed > 0 && aging.d60plus > 0 && "text-destructive")} />
        {aging.owed > 0 && (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div><dt>{t("age0")}</dt><dd className="text-sm text-foreground"><Money value={aging.d0_30} /></dd></div>
            <div><dt>{t("age30")}</dt><dd className="text-sm text-foreground"><Money value={aging.d31_60} /></dd></div>
            <div><dt>{t("age60")}</dt><dd className="text-sm text-foreground"><Money value={aging.d60plus} /></dd></div>
          </dl>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
          <Button onClick={() => setPayOpen(true)} disabled={aging.owed <= 0} className="col-span-2 sm:col-span-1">
            <Banknote />
            {t("recordPayment")}
          </Button>
          {can("sale.create") && (
            <Button variant="outline" asChild>
              <Link href={`/app/sales/new?customer=${customer.id}`}>
                <ShoppingCart />
                {ts("new")}
              </Link>
            </Button>
          )}
          {customer.phone && (
            <>
              <Button variant="outline" asChild>
                <a href={`tel:${customer.phone}`}>
                  <Phone />
                  {t("callCustomer")}
                </a>
              </Button>
              {aging.owed > 0 && (
                <Button variant="outline" asChild>
                  <a href={`https://wa.me/${waNumber(customer.phone)}?text=${encodeURIComponent(reminder)}`} target="_blank" rel="noopener">
                    <MessageCircle />
                    {t("remind")}
                  </a>
                </Button>
              )}
            </>
          )}
        </div>
        {customer.note && <p className="mt-3 text-sm text-muted-foreground">{customer.note}</p>}
      </section>

      <h2 className="mt-8 mb-3 font-semibold">{t("history")}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {entries.map((e) => {
            const voided = !!e.row.voidedAt;
            const when = format.dateTime(new Date(e.at), { dateStyle: "medium", timeStyle: "short" });
            if (e.kind === "sale") {
              const s = e.row;
              const credit = s.total - s.amountPaid;
              return (
                <li key={s.id}>
                  <Link href={`/app/sales/view?id=${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <Plus className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", voided && "line-through text-muted-foreground")}>
                        {s.paymentType === "CREDIT" ? t("creditSale") : ts(s.paymentType)} #{s.number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {when}
                        {s.amountPaid > 0 && s.paymentType === "CREDIT" && ` · ${ts("paidAmount")} ${money(s.amountPaid)}`}
                      </p>
                    </div>
                    <span className={cn("text-sm font-medium tabular", voided && "line-through text-muted-foreground")}>
                      {credit > 0 ? `+${money(credit)}` : money(s.total)}
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
                <span className={cn("text-sm font-medium tabular text-primary", voided && "line-through text-muted-foreground")}>−{money(p.amount)}</span>
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

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} customerId={id} owed={aging.owed} />
      <CustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} onSaved={() => toast.success(t("saved"))} />

      <AlertDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("voidPaymentTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("voidPaymentHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => voiding && void voidDebtPayment({ db, userId: user.id }, voiding.id).then(() => setVoiding(null))}>
              {tc("void")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{customer.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void deleteCustomer({ db, userId: user.id }, id).then(() => router.replace("/app/customers"))}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PaymentDialog({ open, onOpenChange, customerId, owed }: { open: boolean; onOpenChange: (o: boolean) => void; customerId: string; owed: number }) {
  const t = useTranslations("customers");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const money = useMoney();
  const { db, user } = useShop();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DebtPayment["method"]>("CASH");
  const [note, setNote] = useState("");
  const [confirmOver, setConfirmOver] = useState(false);
  const value = toNgwee(amount);
  const invalid = amount !== "" && (value === null || value <= 0);

  async function submit(force = false) {
    if (value === null || value <= 0) return;
    if (value > owed && !force) return setConfirmOver(true);
    await recordDebtPayment({ db, userId: user.id }, { customerId, amount: value, method, note: note.trim() || null });
    toast.success(t("paymentRecorded"));
    setAmount("");
    setNote("");
    setConfirmOver(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("recordPayment")}</DialogTitle>
          <DialogDescription>
            {t("owes")}: {money(owed)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={t("paymentAmount")} htmlFor="pay-amount" error={invalid ? tc("invalidAmount") : undefined}>
            <MoneyInput id="pay-amount" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={invalid} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[owed, Math.round(owed / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
              <Button key={v} type="button" variant="secondary" size="sm" onClick={() => setAmount((v / 100).toFixed(2))}>
                {money(v)}
              </Button>
            ))}
          </div>
          <Field label={t("paymentMethod")}>
            <div className="grid grid-cols-2 gap-2">
              {(["CASH", "MOBILE_MONEY"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn("rounded-lg border px-3 py-2 text-sm font-medium", method === m ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}
                >
                  {ts(m)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={tc("note")} htmlFor="pay-note" optional={tc("optional")}>
            <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-10" />
          </Field>
          {confirmOver && <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">{t("overpay", { amount: money(owed) })}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit(confirmOver)} disabled={value === null || value <= 0}>
            {confirmOver ? tc("confirm") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
