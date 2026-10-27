"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { HandCoins, Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, RequirePermission } from "@/components/app/page-parts";
import { CustomerDialog } from "@/components/app/customer-dialog";
import { SupplierDialog } from "@/components/app/supplier-dialog";
import { DebtList, type DebtRow } from "@/components/app/debt-list";
import { useShop } from "@/components/app/shop-context";
import { useCustomers, useSuppliers } from "@/lib/local/hooks";
import { ageDebt } from "@/lib/debt";
import { groupBy } from "@/lib/utils";

export default function DebtsPage() {
  return (
    <RequirePermission permission="debt.record">
      <Suspense>
        <Debts />
      </Suspense>
    </RequirePermission>
  );
}

type Tab = "customers" | "suppliers";

/** Money owed in both directions: customers who owe the shop, and suppliers the shop owes. */
function Debts() {
  const t = useTranslations("debts");
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useShop();
  const showSuppliers = can("purchase.manage");
  const tab: Tab = showSuppliers && params.get("tab") === "suppliers" ? "suppliers" : "customers";
  const [customerOpen, setCustomerOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);

  const setTab = (v: string) => router.replace(v === "suppliers" ? "/app/customers?tab=suppliers" : "/app/customers", { scroll: false });

  const addButton =
    tab === "customers" ? (
      <Button onClick={() => setCustomerOpen(true)}>
        <Plus />
        <span className="sr-only sm:not-sr-only">{t("customers.add")}</span>
      </Button>
    ) : (
      <Button onClick={() => setSupplierOpen(true)}>
        <Plus />
        <span className="sr-only sm:not-sr-only">{t("suppliers.add")}</span>
      </Button>
    );

  return (
    <>
      <PageHeader title={t("title")} subtitle={showSuppliers ? t("subtitleBoth") : t("subtitle")} actions={addButton} />
      {showSuppliers ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 w-full sm:w-fit">
            <TabsTrigger value="customers" className="flex-1 sm:flex-none">
              <HandCoins />
              {t("customers.tab")}
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="flex-1 sm:flex-none">
              <Truck />
              {t("suppliers.tab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="customers">
            <CustomerDebts onAdd={() => setCustomerOpen(true)} />
          </TabsContent>
          <TabsContent value="suppliers">
            <SupplierDebts onAdd={() => setSupplierOpen(true)} />
          </TabsContent>
        </Tabs>
      ) : (
        <CustomerDebts onAdd={() => setCustomerOpen(true)} />
      )}
      <CustomerDialog open={customerOpen} onOpenChange={setCustomerOpen} />
      <SupplierDialog open={supplierOpen} onOpenChange={setSupplierOpen} onSaved={() => toast.success(t("suppliers.saved"))} />
    </>
  );
}

function CustomerDebts({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations("debts");
  const { db } = useShop();
  const customers = useCustomers();

  // Ageing per customer (payments applied to the oldest credit first).
  const aging = useLiveQuery(async () => {
    const [sales, payments] = await Promise.all([db.sales.where("customerId").above("").toArray(), db.debtPayments.toArray()]);
    const salesBy = groupBy(sales, (s) => s.customerId!);
    const paysBy = groupBy(payments, (p) => p.customerId);
    return new Map([...new Set([...salesBy.keys(), ...paysBy.keys()])].map((id) => [id, ageDebt(salesBy.get(id) ?? [], paysBy.get(id) ?? [])]));
  }, [db]);

  const rows = useMemo<DebtRow[] | undefined>(
    () =>
      customers && aging
        ? customers.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            address: c.address,
            owed: c.owed,
            aging: aging.get(c.id) ?? { owed: 0, d0_30: 0, d31_60: 0, d60plus: 0, oldestUnpaidAt: null },
            lastActivityAt: c.lastActivityAt,
            href: `/app/customers/view?id=${c.id}`,
          }))
        : undefined,
    [customers, aging],
  );

  return (
    <DebtList
      kind="customers"
      rows={rows}
      empty={<EmptyState icon={HandCoins} title={t("customers.empty")} hint={t("customers.emptyHint")} action={<Button onClick={onAdd}><Plus />{t("customers.add")}</Button>} />}
    />
  );
}

function SupplierDebts({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations("debts");
  const suppliers = useSuppliers();
  const rows = useMemo<DebtRow[] | undefined>(
    () =>
      suppliers?.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        address: s.address,
        owed: s.owed,
        aging: s.aging,
        lastActivityAt: s.lastActivityAt,
        href: `/app/suppliers/view?id=${s.id}`,
      })),
    [suppliers],
  );

  return (
    <DebtList
      kind="suppliers"
      rows={rows}
      empty={<EmptyState icon={Truck} title={t("suppliers.empty")} hint={t("suppliers.emptyHint")} action={<Button onClick={onAdd}><Plus />{t("suppliers.add")}</Button>} />}
    />
  );
}
