"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Search, Trash2, UserPlus, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityFeed, useRoleLabel } from "@/components/app/activity-feed";
import { AccountActions } from "@/components/platform/account-actions";
import { ReportDialog } from "@/components/app/report-dialog";
import { FileDown } from "lucide-react";
import { apiErrorCode, http, isNetworkError } from "@/lib/http";
import { useCachedSession } from "@/lib/local/session";
import { cn } from "@/lib/utils";

interface BusinessRow {
  id: string;
  name: string;
  plan: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  owner: { id: string; name: string; email: string } | null;
  shops: number;
  people: number;
  lastActivityAt: string | null;
}

export default function PlatformPage() {
  const t = useTranslations("platform");
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
      </div>
      <Tabs defaultValue="businesses">
        <TabsList>
          <TabsTrigger value="businesses">{t("businesses")}</TabsTrigger>
          <TabsTrigger value="accounts">{t("accounts")}</TabsTrigger>
          <TabsTrigger value="reports">{t("reports")}</TabsTrigger>
          <TabsTrigger value="activity">{t("activity")}</TabsTrigger>
          <TabsTrigger value="team">{t("team")}</TabsTrigger>
        </TabsList>
        <TabsContent value="businesses" className="mt-4">
          <Businesses />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4">
          <Accounts />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <PlatformReports />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityFeed scope="platform" />
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          <Team />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Businesses() {
  const t = useTranslations("platform");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["platform-businesses", q],
    queryFn: async () =>
      (await http.get<{ stats: { businesses: number; suspended: number; users: number }; businesses: BusinessRow[] }>("/platform/businesses", { params: { q: q || undefined } })).data,
  });

  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <WifiOff className="size-6" />
        {isNetworkError(query.error) ? tc("needsInternet") : tc("somethingWrong")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {query.data && (
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["statBusinesses", query.data.stats.businesses],
              ["statSuspended", query.data.stats.suspended],
              ["statUsers", query.data.stats.users],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t(k)}</p>
              <p className="mt-1 text-2xl font-semibold tabular">{v}</p>
            </div>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
      </div>
      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {query.data.businesses.map((b) => (
            <li key={b.id}>
              <Link href={`/platform/business?id=${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{b.name}</span>
                    {b.status === "SUSPENDED" && <Badge variant="destructive">{t("SUSPENDED")}</Badge>}
                    <Badge variant="outline" className="font-normal">{b.plan}</Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.owner ? `${b.owner.name} · ${b.owner.email}` : "—"} · {t("shopsPeople", { shops: b.shops, people: b.people })}
                  </p>
                </div>
                <span className="hidden text-right text-xs text-muted-foreground sm:block">
                  {t("lastActivity")}
                  <br />
                  {b.lastActivityAt ? format.relativeTime(new Date(b.lastActivityAt), new Date()) : t("never")}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Team() {
  const t = useTranslations("platform");
  const tc = useTranslations("common");
  const session = useCachedSession();
  const qc = useQueryClient();
  const isFounder = session?.user.platformRole === "FOUNDER";
  const [email, setEmail] = useState("");

  const team = useQuery({
    queryKey: ["platform-team"],
    queryFn: async () => (await http.get<{ people: { id: string; name: string; email: string; platformRole: "FOUNDER" | "SUPER_ADMIN" }[] }>("/platform/super-admins")).data,
  });
  const onError = (err: unknown) =>
    toast.error(apiErrorCode(err) === "no_account" ? t("noAccount") : isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong"));
  const add = useMutation({
    mutationFn: () => http.post("/platform/super-admins", { email }),
    onSuccess: () => {
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["platform-team"] });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => http.delete("/platform/super-admins", { params: { userId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform-team"] }),
    onError,
  });

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">{t("teamHint")}</p>
      <ul className="divide-y rounded-xl border bg-card">
        {team.data?.people.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.email}</p>
            </div>
            <Badge variant={p.platformRole === "FOUNDER" ? "default" : "outline"}>{t(p.platformRole)}</Badge>
            {isFounder && p.platformRole === "SUPER_ADMIN" && (
              <Button variant="ghost" size="icon" aria-label={t("remove")} onClick={() => remove.mutate(p.id)}>
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {isFounder && (
        <form
          className={cn("rounded-xl border bg-card p-4")}
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <p className="mb-1 font-medium">{t("addSuperAdmin")}</p>
          <p className="mb-3 text-sm text-muted-foreground">{t("addSuperAdminHint")}</p>
          <div className="flex gap-2">
            <Input type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
            <Button type="submit" className="h-10" disabled={add.isPending}>
              {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {tc("add")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

interface AccountRow {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  platformRole: "FOUNDER" | "SUPER_ADMIN" | null;
  locked: boolean;
  deactivated: boolean;
  roles: { role: string; shop: string; businessId: string; branch: string | null; disabled: boolean }[];
}

/** Every account on StockWise: search, see where each person works, act on the account. */
function Accounts() {
  const t = useTranslations("platform");
  const tc = useTranslations("common");
  const roleLabel = useRoleLabel();
  const session = useCachedSession();
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["platform-accounts", q],
    queryFn: async () => (await http.get<{ accounts: AccountRow[] }>("/platform/accounts", { params: { q: q || undefined } })).data,
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" placeholder={t("searchAccounts")} value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
      </div>
      {query.isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{isNetworkError(query.error) ? tc("needsInternet") : tc("somethingWrong")}</p>
      ) : query.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {query.data.accounts.map((a) => (
            <li key={a.id} className={cn("flex items-start gap-3 px-4 py-3", a.deactivated && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  <span className="truncate">{a.name}</span>
                  {a.platformRole && <Badge>{t(a.platformRole)}</Badge>}
                  {a.deactivated && <Badge variant="destructive">{t("deactivated")}</Badge>}
                  {a.locked && <Badge variant="outline">{t("locked")}</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{a.username ? `@${a.username}` : a.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.roles.length
                    ? a.roles.map((r) => `${roleLabel(r.role)} · ${r.shop}${r.branch ? ` / ${r.branch}` : r.role === "MANAGER" ? ` / ${t("allBranches")}` : ""}${r.disabled ? ` (${t("deactivated").toLowerCase()})` : ""}`).join("  ·  ")
                    : a.platformRole
                      ? ""
                      : t("noRole")}
                </p>
              </div>
              {a.id !== session?.user.id && a.platformRole !== "FOUNDER" && !(a.platformRole === "SUPER_ADMIN" && session?.user.platformRole !== "FOUNDER") && (
                <AccountActions user={a} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** App-wide report for StockWise staff (per-shop breakdown). Single-shop reports live on each shop's page. */
function PlatformReports() {
  const t = useTranslations("platform");
  const tg = useTranslations("reportsGen");
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-2xl rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{t("reportsTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("reportsHint")}</p>
      <Button className="mt-4" onClick={() => setOpen(true)}>
        <FileDown />
        {tg("button")}
      </Button>
      <ReportDialog open={open} onOpenChange={setOpen} scopes={[{ value: "platform", label: tg("allShops") }]} />
    </div>
  );
}
