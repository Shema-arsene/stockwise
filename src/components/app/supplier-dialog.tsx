"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import { saveSupplier } from "@/lib/local/ops";
import type { Supplier } from "@/lib/sync/tables";
import { useShop } from "./shop-context";

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplier?: Supplier;
  onSaved?: (s: Supplier) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SupplierForm
          supplier={supplier}
          onCancel={() => onOpenChange(false)}
          onDone={(s) => {
            onSaved?.(s);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({ supplier, onDone, onCancel }: { supplier?: Supplier; onDone: (s: Supplier) => void; onCancel: () => void }) {
  const t = useTranslations("purchases");
  const tc = useTranslations("common");
  const { db, user } = useShop();
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onDone(await saveSupplier({ db, userId: user.id }, { id: supplier?.id, name, phone, address }));
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{supplier ? supplier.name : t("newSupplier")}</DialogTitle>
      </DialogHeader>
      <Field label={tc("name")} htmlFor="sup-name">
        <Input id="sup-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
      </Field>
      <Field label={tc("phone")} htmlFor="sup-phone" optional={tc("optional")}>
        <Input id="sup-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
      </Field>
      <Field label={tc("address")} htmlFor="sup-address" optional={tc("optional")}>
        <Input id="sup-address" autoComplete="street-address" placeholder={tc("addressPlaceholder")} value={address} onChange={(e) => setAddress(e.target.value)} className="h-10" />
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
