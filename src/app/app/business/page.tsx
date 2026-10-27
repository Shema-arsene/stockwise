"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, MapPin, Plus, Store, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import { Money, PageHeader, RequirePermission } from "@/components/app/page-parts";
import { refreshSession, useShop } from "@/components/app/shop-context";
import { http, isNetworkError } from "@/lib/http";
import { setActiveShop } from "@/lib/local/session";
import { periodParams, type BranchTotals } from "@/lib/period";
import { useLocale } from "@/i18n/locale";

interface OwnedShop {
  id: string;
  name: string;
  plan: string;
  status: "ACTIVE" | "SUSPENDED";
  branches: BranchTotals[];
}

/** Owners: every shop they own, its branches and headline numbers. */
export default function ShopsPage() {
  return (
    <RequirePermission permission="business.manage">
      <Shops />
    </RequirePermission>
  );
}

function Shops() {
  const t = useTranslations("business");
  const tc = useTranslations("common");
  const tp = useTranslations("platform");
  const router = useRouter();
  const qc = useQueryClient();
  const { shopId } = useShop();
  const [adding, setAdding] = useState<{ kind: "shop" } | { kind: "branch"; shop: OwnedShop } | null>(null);

  const query = useQuery({
    queryKey: ["owned-shops"],
    queryFn: async () => (await http.get<{ shops: OwnedShop[] }>("/shops", { params: periodParams() })).data,
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button onClick={() => setAdding({ kind: "shop" })}>
            <Plus />
            <span className="sr-only sm:not-sr-only">{t("addShop")}</span>
          </Button>
        }
      />

      {query.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : query.isError ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <WifiOff className="size-6" />
          {isNetworkError(query.error) ? tc("needsInternet") : tc("somethingWrong")}
        </div>
      ) : (
        <div className="space-y-8">
          {query.data.shops.map((shop) => {
            const sum = (k: keyof BranchTotals) => shop.branches.reduce((n, b) => n + (b[k] as number), 0);
            return (
              <section key={shop.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Store className="size-5 text-primary" />
                  <h2 className="text-lg font-semibold">{shop.name}</h2>
                  {shop.status === "SUSPENDED" && <Badge variant="destructive">{tp("SUSPENDED")}</Badge>}
                  <Button variant="outline" size="sm" className="ml-auto" onClick={() => setAdding({ kind: "branch", shop })} disabled={shop.status === "SUSPENDED"}>
                    <Plus />
                    {t("addBranch")}
                  </Button>
                </div>
                {shop.branches.length > 1 && (
                  <div className="mb-3 grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
                    <p className="col-span-2 text-sm font-semibold sm:col-span-4">{t("totals")}</p>
                    <Stat label={t("today")} value={<Money value={sum("salesToday")} />} />
                    <Stat label={t("month")} value={<Money value={sum("salesMonth")} />} />
                    <Stat label={t("profitMonth")} value={<Money value={sum("profitMonth")} />} />
                    <Stat label={t("owed")} value={<Money value={sum("debtOwed")} />} />
                  </div>
                )}
                <ul className="grid gap-3 sm:grid-cols-2">
                  {shop.branches.map((b) => (
                    <li key={b.id} className="rounded-xl border bg-card p-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-semibold">
                            <Building2 className="size-4 shrink-0 text-muted-foreground" />
                            {b.name}
                          </p>
                          {b.address && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <MapPin className="size-3" />
                              {b.address}
                            </p>
                          )}
                        </div>
                        {b.id === shopId ? (
                          <Badge variant="secondary">{t("current")}</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveShop(b.id);
                              router.push("/app");
                            }}
                          >
                            {t("open")}
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Stat label={t("today")} value={<Money value={b.salesToday} />} />
                        <Stat label={t("month")} value={<Money value={b.salesMonth} />} />
                        <Stat label={t("profitMonth")} value={<Money value={b.profitMonth} />} />
                        <Stat label={t("owed")} value={<Money value={b.debtOwed} />} />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {t("products", { count: b.products })} · {t("people", { count: b.people })}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {adding && (
        <AddDialog
          target={adding}
          onClose={() => setAdding(null)}
          onCreated={(branchId, isNewShop) => {
            void qc.invalidateQueries({ queryKey: ["owned-shops"] });
            if (isNewShop) {
              setActiveShop(branchId);
              router.push("/app");
            }
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular">{value}</p>
    </div>
  );
}

/** New shop (with its first branch) or a new branch of an existing shop. */
function AddDialog({
  target,
  onClose,
  onCreated,
}: {
  target: { kind: "shop" } | { kind: "branch"; shop: OwnedShop };
  onClose: () => void;
  onCreated: (branchId: string, isNewShop: boolean) => void;
}) {
  const t = useTranslations("business");
  const tOn = useTranslations("onboarding");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [shopName, setShopName] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const isShop = target.kind === "shop";

  const create = useMutation({
    mutationFn: async () =>
      (
        await http.post<{ id: string }>("/shops", {
          ...(isShop ? { shopName, name: name.trim() || shopName } : { businessId: target.shop.id, name }),
          address: address || undefined,
          locale,
        })
      ).data,
    onSuccess: async (d) => {
      await refreshSession();
      toast.success(isShop ? t("shopCreated") : t("created"));
      onCreated(d.id, isShop);
      onClose();
    },
    onError: (err) => toast.error(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong")),
  });

  const valid = isShop ? shopName.trim().length >= 2 && (name.trim() === "" || name.trim().length >= 2) : name.trim().length >= 2;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isShop ? t("addShop") : `${t("addBranch")} · ${target.shop.name}`}</DialogTitle>
          </DialogHeader>
          {isShop && (
            <Field label={t("shopName")} htmlFor="new-shop-name">
              <Input id="new-shop-name" autoFocus required minLength={2} placeholder={tOn("shopNamePlaceholder")} value={shopName} onChange={(e) => setShopName(e.target.value)} className="h-10" />
            </Field>
          )}
          <Field label={isShop ? t("firstBranch") : t("branchName")} htmlFor="new-branch-name" hint={isShop ? t("firstBranchHint") : undefined}>
            <Input id="new-branch-name" autoFocus={!isShop} required={!isShop} minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          </Field>
          <Field label={tOn("address")} htmlFor="new-branch-address" optional={tc("optional")}>
            <Input id="new-branch-address" placeholder={tOn("addressPlaceholder")} value={address} onChange={(e) => setAddress(e.target.value)} className="h-10" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending || !valid}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {isShop ? t("addShop") : t("addBranch")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
