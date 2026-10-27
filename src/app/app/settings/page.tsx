"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Check, Crown, KeyRound, Loader2, LogOut, Plus, RefreshCw, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "@/components/app/page-parts";
import { LegalLinks } from "@/components/auth/auth-nav";
import { refreshSession, useShop } from "@/components/app/shop-context";
import { http, isNetworkError } from "@/lib/http";
import { setActiveShop } from "@/lib/local/session";
import { signOutEverywhereOnDevice } from "@/lib/sign-out";
import { LOCALES, LOCALE_LABELS, setLocale, useLocale } from "@/i18n/locale";
import { cn, groupBy } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function SettingsPage() {
  const { shop } = useShop();
  // Remount (fresh form values) whenever new settings arrive from sync.
  return <Settings key={JSON.stringify(shop)} />;
}

function Settings() {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const tSync = useTranslations("sync");
  const tStaff = useTranslations("staff");
  const tBiz = useTranslations("business");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const { shop, can, session, shopId, sync, syncNow, user, role } = useShop();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const canEdit = can("settings.manage");

  const [form, setForm] = useState({
    name: shop.name,
    phone: shop.phone ?? "",
    address: shop.address ?? "",
    vatEnabled: shop.vatEnabled,
    vatRate: String(shop.vatRate / 100),
    tpin: shop.tpin ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const rate = Number(form.vatRate.replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) return toast.error(tc("invalidAmount"));
    setSaving(true);
    try {
      await http.patch("/shops/current", {
        name: form.name,
        phone: form.phone || null,
        address: form.address || null,
        locale,
        vatEnabled: form.vatEnabled,
        vatRate: Math.round(rate * 100),
        tpin: form.tpin || null,
      });
      await syncNow();
      toast.success(t("saved"));
    } catch (err) {
      toast.error(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong"));
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await signOutEverywhereOnDevice();
    router.replace("/");
  }

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="max-w-xl space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-4 font-semibold">{t("shop")}</h2>
          {!canEdit && <p className="mb-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">{t("ownerOnly")}</p>}
          <form onSubmit={save} className="grid gap-4">
            <fieldset disabled={!canEdit} className="grid gap-4">
              <Field label={t("shopName")} htmlFor="s-name">
                <Input id="s-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("phone")} htmlFor="s-phone" optional={tc("optional")}>
                  <Input id="s-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10" />
                </Field>
                <Field label={t("address")} htmlFor="s-address" optional={tc("optional")}>
                  <Input id="s-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="h-10" />
                </Field>
              </div>
              <h3 className="pt-2 text-sm font-semibold">{t("tax")}</h3>
              <label className="flex items-start justify-between gap-3 text-sm">
                <span>
                  {t("vatEnabled")}
                  <span className="block text-xs text-muted-foreground">{t("vatEnabledHint")}</span>
                </span>
                <Switch checked={form.vatEnabled} onCheckedChange={(v) => setForm({ ...form, vatEnabled: v })} />
              </label>
              {form.vatEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t("vatRate")} htmlFor="s-vat">
                    <Input id="s-vat" inputMode="decimal" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t("tpin")} htmlFor="s-tpin" optional={tc("optional")}>
                    <Input id="s-tpin" inputMode="numeric" value={form.tpin} onChange={(e) => setForm({ ...form, tpin: e.target.value })} className="h-10" />
                  </Field>
                </div>
              )}
            </fieldset>
            {canEdit && (
              <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {tc("save")}
              </Button>
            )}
          </form>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-4 font-semibold">{t("appearance")}</h2>
          <div className="grid gap-4">
            <Field label={t("language")}>
              <div className="flex gap-2">
                {LOCALES.map((l) => (
                  <Button key={l} type="button" variant={locale === l ? "default" : "outline"} onClick={() => setLocale(l)}>
                    {LOCALE_LABELS[l]}
                  </Button>
                ))}
              </div>
            </Field>
            <Field label={t("theme")}>
              <div className="flex flex-wrap gap-2">
                {(["light", "dark", "system"] as const).map((th) => (
                  <Button key={th} type="button" variant={theme === th ? "default" : "outline"} onClick={() => setTheme(th)}>
                    {t(th === "light" ? "themeLight" : th === "dark" ? "themeDark" : "themeSystem")}
                  </Button>
                ))}
              </div>
            </Field>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-semibold">{t("sync")}</h2>
          <p className="text-sm text-muted-foreground">
            {sync.pending > 0 ? tSync("pending", { count: sync.pending }) : tSync("synced")} ·{" "}
            {sync.lastSyncedAt ? tSync("lastSynced", { time: format.relativeTime(new Date(sync.lastSyncedAt), new Date()) }) : tSync("never")}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void syncNow()} disabled={sync.status === "syncing"}>
            <RefreshCw className={cn(sync.status === "syncing" && "animate-spin")} />
            {tSync("syncNow")}
          </Button>
        </section>

        {session.shops.length > 0 && (
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-semibold">{t("switchShop")}</h2>
            {[...groupBy(session.shops, (x) => x.businessName)].map(([business, shops]) => (
              <div key={business} className="mb-2">
                {new Set(session.shops.map((x) => x.businessId)).size > 1 && (
                  <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{business}</p>
                )}
                <ul className="space-y-1">
                  {shops.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (s.id !== shopId) {
                            setActiveShop(s.id);
                            router.push("/app");
                          }
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                      >
                        <Store className="size-4 text-muted-foreground" />
                        <span className="flex-1 truncate text-sm">{s.name}</span>
                        <Badge variant="outline">{tStaff(`roles.${s.role}`)}</Badge>
                        {s.id === shopId && <Check className="size-4 text-primary" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!user.pinAccount && (
              <Button variant="ghost" size="sm" className="mt-2" asChild>
                <Link href={role === "OWNER" ? "/app/business" : "/onboarding"}>
                  <Plus />
                  {role === "OWNER" ? tBiz("addBranch") : t("newShop")}
                </Link>
              </Button>
            )}
          </section>
        )}

        {user.platformRole && (
          <section className="rounded-xl border bg-card p-4">
            <Button variant="outline" asChild>
              <Link href="/platform">
                <ShieldCheck />
                {t("platformConsole")}
              </Link>
            </Button>
          </section>
        )}

        {role === "OWNER" && <TransferOwnership />}

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-semibold">{t("account")}</h2>
          <p className="text-sm">{user.name}</p>
          <p className="text-sm text-muted-foreground">
            {user.username ? `@${user.username}` : user.email} · {tStaff(`roles.${role}`)}
            {role === "OWNER" && ` · ${t("plan")}: ${t("planFree")}`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!user.pinAccount && <ChangePassword />}
            <Button variant="outline" onClick={() => setSignOutOpen(true)}>
              <LogOut />
              {tAuth("signOut")}
            </Button>
          </div>
        </section>

        <LegalLinks className="pb-2 text-center text-xs text-muted-foreground" />
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAuth("signOutConfirm")}</AlertDialogTitle>
            {sync.pending > 0 && <AlertDialogDescription className="text-destructive">{tAuth("signOutPending", { count: sync.pending })}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant={sync.pending > 0 ? "destructive" : "default"} onClick={() => void signOut()}>
              {sync.pending > 0 ? tAuth("signOutAnyway") : tAuth("signOut")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Owner only: hand the business to an admin who signs in with email. */
function TransferOwnership() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { shop, shopId, syncNow } = useShop();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const staff = useQuery({
    queryKey: ["staff", shopId],
    queryFn: async () =>
      (
        await http.get<{
          people: { userId: string; name: string; managedAccount: boolean; deactivated: boolean; assignments: { role: string; disabled: boolean }[] }[];
        }>("/staff")
      ).data,
  });
  // Active managers with their own email login (shop-created logins cannot own a shop).
  const candidates = (staff.data?.people ?? []).filter(
    (p) => !p.managedAccount && !p.deactivated && p.assignments.some((a) => a.role === "MANAGER" && !a.disabled),
  );
  const chosen = candidates.find((c) => c.userId === userId);

  const transfer = useMutation({
    mutationFn: () => http.post("/business/transfer-ownership", { userId }),
    onSuccess: async () => {
      toast.success(t("transferred"));
      await refreshSession();
      await syncNow(); // picks up the new role from the server
      router.replace("/app");
    },
    onError: (err) => toast.error(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong")),
  });

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Crown className="size-4" />
        {t("transfer")}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("transferHint")}</p>
      {staff.isError ? (
        <p className="text-sm text-muted-foreground">{tc("needsInternet")}</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={userId} onValueChange={setUserId} disabled={!candidates.length}>
            <SelectTrigger className="h-10 w-full sm:w-64">
              <SelectValue placeholder={t("transferTo")} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.userId} value={c.userId}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-10" disabled={!chosen} onClick={() => setConfirmOpen(true)}>
            {t("transfer")}
          </Button>
        </div>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("transfer")}</AlertDialogTitle>
            <AlertDialogDescription>{chosen && t("transferConfirm", { name: chosen.name, business: shop.businessName })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => transfer.mutate()}>
              {t("transfer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Email accounts change their own password (PIN accounts are reset by their manager). */
function ChangePassword() {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setPending(false);
    if (error) return toast.error(error.code === "INVALID_PASSWORD" ? t("wrongPassword") : (error.message ?? tc("somethingWrong")));
    toast.success(t("passwordChanged"));
    setCurrent("");
    setNext("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeyRound />
          {t("changePassword")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("changePassword")}</DialogTitle>
          </DialogHeader>
          <Field label={t("currentPassword")} htmlFor="cur-pw">
            <Input id="cur-pw" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className="h-10" />
          </Field>
          <Field label={t("newPassword")} htmlFor="new-pw" hint={tAuth("passwordHint")}>
            <Input id="new-pw" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className="h-10" />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending || next.length < 8}>
              {pending && <Loader2 className="animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
