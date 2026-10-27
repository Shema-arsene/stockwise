"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import { saveCustomer } from "@/lib/local/ops";
import type { Customer } from "@/lib/sync/tables";
import { useShop } from "./shop-context";

/** Create or edit a customer in a dialog. */
export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  initialName = "",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: Customer;
  initialName?: string;
  onSaved?: (c: Customer) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Dialog content unmounts when closed, so the form starts fresh on every open. */}
        <CustomerForm
          customer={customer}
          initialName={initialName}
          onCancel={() => onOpenChange(false)}
          onDone={(c) => {
            onSaved?.(c);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({
  customer,
  initialName,
  onDone,
  onCancel,
}: {
  customer?: Customer;
  initialName: string;
  onDone: (c: Customer) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { db, user } = useShop();
  const [name, setName] = useState(customer?.name ?? initialName);
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [note, setNote] = useState(customer?.note ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onDone(await saveCustomer({ db, userId: user.id }, { id: customer?.id, name, phone, address, note }));
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{customer ? t("editTitle") : t("newTitle")}</DialogTitle>
      </DialogHeader>
      <Field label={tc("name")} htmlFor="cust-name">
        <Input id="cust-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
      </Field>
      <Field label={tc("phone")} htmlFor="cust-phone" optional={tc("optional")}>
        <Input id="cust-phone" type="tel" inputMode="tel" placeholder="097 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
      </Field>
      <Field label={tc("address")} htmlFor="cust-address" optional={tc("optional")}>
        <Input id="cust-address" autoComplete="street-address" placeholder={tc("addressPlaceholder")} value={address} onChange={(e) => setAddress(e.target.value)} className="h-10" />
      </Field>
      <Field label={tc("note")} htmlFor="cust-note" optional={tc("optional")}>
        <Input id="cust-note" placeholder={tc("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} className="h-10" />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {tc("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
