"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, Money, PageHeader, RequirePermission } from "@/components/app/page-parts";
import { SupplierDialog } from "@/components/app/supplier-dialog";
import { useShop } from "@/components/app/shop-context";
import { useSuppliers } from "@/lib/local/hooks";
import { deleteSupplier } from "@/lib/local/ops";
import type { Supplier } from "@/lib/sync/tables";

export default function SuppliersPage() {
  return (
    <RequirePermission permission="purchase.manage">
      <SupplierList />
    </RequirePermission>
  );
}

function SupplierList() {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const { db, user } = useShop();
  const suppliers = useSuppliers();
  const [editing, setEditing] = useState<Supplier | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  const openNew = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Button onClick={openNew}>
            <Plus />
            <span className="sr-only sm:not-sr-only">{t("add")}</span>
          </Button>
        }
      />
      {suppliers && suppliers.length === 0 ? (
        <EmptyState icon={Users} title={t("empty")} action={<Button onClick={openNew}><Plus />{t("add")}</Button>} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {suppliers?.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-4 py-3">
              <Link href={`/app/suppliers/view?id=${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline-offset-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  {(s.phone || s.address) && <p className="truncate text-xs text-muted-foreground">{[s.phone, s.address].filter(Boolean).join(" · ")}</p>}
                </div>
                {s.owed > 0 ? (
                  <span className="text-right text-xs text-muted-foreground">
                    {t("youOwe")}
                    <Money value={s.owed} className="block text-sm font-semibold text-foreground" />
                  </span>
                ) : null}
              </Link>
              {s.phone && (
                <Button variant="ghost" size="icon" asChild>
                  <a href={`tel:${s.phone}`} aria-label={tc("phone")}>
                    <Phone />
                  </a>
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setDialogOpen(true); }} aria-label={tc("edit")}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleting(s)} aria-label={tc("delete")}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <SupplierDialog open={dialogOpen} onOpenChange={setDialogOpen} supplier={editing} onSaved={() => toast.success(t("saved"))} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleting && void deleteSupplier({ db, userId: user.id }, deleting.id).then(() => setDeleting(null))}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
