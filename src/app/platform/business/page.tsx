"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Building2, Crown, FileDown, MoreVertical, PlayCircle, Power, Trash2, WifiOff } from "lucide-react";
import { ReportDialog } from "@/components/app/report-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { ActivityFeed } from "@/components/app/activity-feed";
import { AccountActions } from "@/components/platform/account-actions";
import { http, isNetworkError } from "@/lib/http";
import { formatMoney } from "@/lib/money";
import { periodParams, type BranchTotals } from "@/lib/period";
import { useLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

interface Assignment {
  kind: "branch" | "shop";
  id: string;
  role: "MANAGER" | "CASHIER";
  shopId: string | null;
  disabled: boolean;
}

interface Person {
  userId: string;
  name: string;
  email: string | null;
  username: string | null;
  managedAccount: boolean;
  locked: boolean;
  deactivated: boolean;
  assignments: Assignment[];
}

interface Detail {
  business: { id: string; name: string; plan: string; status: "ACTIVE" | "SUSPENDED"; createdAt: string };
  owner: { userId: string; name: string; email: string } | null;
  shops: BranchTotals[];
  people: Person[];
}

export default function PlatformBusinessPage() {
  return (
    <Suspense>
      <BusinessDetail />
    </Suspense>
  );
}

function BusinessDetail() {
  const t = useTranslations("platform");
  const tb = useTranslations("business");
  const tStaff = useTranslations("staff");
  const tc = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const qc = useQueryClient();
  const id = useSearchParams().get("id") ?? "";
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [makeOwner, setMakeOwner] = useState<Person | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const tg = useTranslations("reportsGen");

  const detail = useQuery({
    queryKey: ["platform-business", id],
    queryFn: async () => (await http.get<Detail>("/platform/business", { params: { id, ...periodParams() } })).data,
    enabled: !!id,
  });
  const onError = (err: unknown) => toast.error(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong"));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["platform-business", id] });
    void qc.invalidateQueries({ queryKey: ["platform-businesses"] });
  };
  const patch = useMutation({ mutationFn: (v: { status?: string; plan?: string }) => http.patch("/platform/businesses", { id, ...v }), onSuccess: refresh, onError });
  const assignment = useMutation({
    mutationFn: (v: { kind: string; id: string; disabled?: boolean; remove?: boolean }) =>
      v.remove ? http.delete("/platform/assignments", { params: { kind: v.kind, id: v.id } }) : http.patch("/platform/assignments", { kind: v.kind, id: v.id, disabled: v.disabled }),
    onSuccess: () => {
      toast.success(t("done"));
      refresh();
    },
    onError,
  });
  const transfer = useMutation({
    mutationFn: (userId: string) => http.post("/platform/assignments", { businessId: id, userId }),
    onSuccess: () => {
      toast.success(t("ownerChanged"));
      setMakeOwner(null);
      refresh();
    },
    onError,
  });

  const money = (v: number) => formatMoney(v, "ZMW", locale);

  if (detail.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <WifiOff className="size-6" />
        {isNetworkError(detail.error) ? tc("needsInternet") : tc("noResults")}
      </div>
    );
  }
  if (!detail.data) return <Skeleton className="h-64 rounded-xl" />;
  const { business, owner, shops, people } = detail.data;
  const suspended = business.status === "SUSPENDED";
  const branchName = (shopId: string | null) => (shopId === null ? tStaff("allBranchesOption") : (shops.find((s) => s.id === shopId)?.name ?? ""));

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
          <Link href="/platform">
            <ArrowLeft />
            {t("back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
          <Badge variant={suspended ? "destructive" : "outline"}>{t(business.status)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("owner")}: {owner ? `${owner.name} · ${owner.email}` : "—"} · {format.dateTime(new Date(business.createdAt), { dateStyle: "medium" })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("readOnly")}</p>
      </div>

      {/* Shop-level platform actions. Nothing here touches the shop's sales, stock or debts. */}
      <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
        {suspended ? (
          <Button onClick={() => patch.mutate({ status: "ACTIVE" })} disabled={patch.isPending}>
            <PlayCircle />
            {t("reactivate")}
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setSuspendOpen(true)}>
            <Ban />
            {t("suspend")}
          </Button>
        )}
        <Button variant="outline" onClick={() => setReportOpen(true)}>
          <FileDown />
          {tg("button")}
        </Button>
        <Select value={business.plan} onValueChange={(plan) => patch.mutate({ plan })}>
          <SelectTrigger className="h-8 w-36" aria-label={t("changePlan")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["FREE", "TRIAL", "BASIC", "PRO"].map((p) => (
              <SelectItem key={p} value={p}>
                {t("plan")}: {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">{t("branches")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {shops.map((s) => (
            <li key={s.id} className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-2 font-medium">
                <Building2 className="size-4 text-muted-foreground" />
                {s.name}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">{tb("today")}</dt><dd className="tabular font-medium">{money(s.salesToday)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{tb("month")}</dt><dd className="tabular font-medium">{money(s.salesMonth)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{tb("owed")}</dt><dd className="tabular font-medium">{money(s.debtOwed)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{tb("products", { count: s.products })}</dt><dd className="text-xs text-muted-foreground">{tb("people", { count: s.people })}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">{t("people")}</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {owner && (
            <li className="flex items-center gap-3 px-4 py-3 text-sm">
              <Crown className="size-4 text-primary" />
              <span className="min-w-0 flex-1 truncate">
                {owner.name} · {owner.email}
              </span>
              <Badge>{tStaff("roles.OWNER")}</Badge>
              <AccountActions user={{ id: owner.userId, name: owner.name, locked: false, deactivated: false }} onDone={refresh} />
            </li>
          )}
          {people.map((p) => (
            <li key={p.userId} className={cn("px-4 py-3 text-sm", p.deactivated && "opacity-60")}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.name} <span className="font-normal text-muted-foreground">· {p.username ? `@${p.username}` : p.email}</span>
                </span>
                {p.deactivated && <Badge variant="destructive">{t("deactivated")}</Badge>}
                {p.locked && <Badge variant="outline">{t("locked")}</Badge>}
                {!p.managedAccount && p.assignments.some((a) => a.role === "MANAGER" && !a.disabled) && !p.deactivated && (
                  <Button variant="outline" size="sm" onClick={() => setMakeOwner(p)}>
                    <Crown />
                    {t("makeOwner")}
                  </Button>
                )}
                <AccountActions user={{ id: p.userId, name: p.name, locked: p.locked, deactivated: p.deactivated }} onDone={refresh} />
              </div>
              <ul className="mt-1.5 space-y-1 pl-1">
                {p.assignments.map((a) => (
                  <li key={a.id} className={cn("flex items-center gap-2 text-xs", a.disabled && "opacity-60")}>
                    <Building2 className="size-3 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{branchName(a.shopId)}</span>
                    {a.disabled && <Badge variant="outline">{tStaff("disabled")}</Badge>}
                    <Badge variant="outline">{tStaff(`roles.${a.role}`)}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label={`${tc("actions")}: ${p.name}, ${branchName(a.shopId)}`}>
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => assignment.mutate({ kind: a.kind, id: a.id, disabled: !a.disabled })}>
                          <Power />
                          {a.disabled ? tStaff("enable") : tStaff("disable")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => assignment.mutate({ kind: a.kind, id: a.id, remove: true })}>
                          <Trash2 />
                          {tStaff("removeAssignment", { branch: branchName(a.shopId) })}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">{t("activity")}</h2>
        <ActivityFeed scope="platform" businessId={business.id} shops={shops.map((s) => ({ id: s.id, name: s.name }))} />
      </section>

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} scopes={[{ value: `platform:${business.id}`, label: business.name }]} />

      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("suspendTitle", { name: business.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("suspendHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => patch.mutate({ status: "SUSPENDED" })}>
              {t("suspend")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!makeOwner} onOpenChange={(o) => !o && setMakeOwner(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("makeOwner")}</AlertDialogTitle>
            <AlertDialogDescription>{makeOwner && t("makeOwnerConfirm", { name: makeOwner.name, shop: business.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => makeOwner && transfer.mutate(makeOwner.userId)}>{t("makeOwner")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
