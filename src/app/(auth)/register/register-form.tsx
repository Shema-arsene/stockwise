"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { authClient } from "@/lib/auth-client";
import { refreshSession } from "@/components/app/shop-context";
import { safeNext } from "@/lib/safe-next";
import { DEFAULT_PLAN, isPlanId, rememberPlan, rememberedPlan, type PlanId } from "@/lib/plans";

export function RegisterForm() {
  const t = useTranslations("auth");
  const tp = useTranslations("authPage");
  const tPlans = useTranslations("site.plans");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const invited = !!next?.startsWith("/invite");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [plan, setPlan] = useState<PlanId>(DEFAULT_PLAN);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // The package picked on the pricing page (?plan=…), kept until the shop is created.
  useEffect(() => {
    const fromUrl = params.get("plan");
    const chosen = isPlanId(fromUrl) ? fromUrl : (rememberedPlan() ?? DEFAULT_PLAN);
    rememberPlan(chosen);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage, only available after mount
    setPlan(chosen);
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agreed) return setError(tp("mustAgree"));
    if (!navigator.onLine) return setError(t("offlineSignIn"));
    setPending(true);
    try {
      const { error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
      if (error) {
        setError(
          error.status === 429
            ? t("tooMany")
            : error.code?.startsWith("USER_ALREADY_EXISTS")
              ? t("emailTaken")
              : error.code === "PASSWORD_TOO_SHORT"
                ? t("passwordHint")
                : (error.message ?? tc("somethingWrong")),
        );
        return;
      }
      await refreshSession();
      // Invited staff go straight to their invite; owners set up a shop.
      router.replace(safeNext(next, "/onboarding"));
    } catch (err) {
      // The auth client throws (rather than returns) on some statuses, e.g. 429.
      setError((err as { status?: number })?.status === 429 ? t("tooMany") : tc("somethingWrong"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("signUpTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("signUpSubtitle")}</p>

      {!invited && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {tp("planChosen", { plan: tPlans(`${plan}.name`) })}
          </span>
          <Link prefetch={false} href="/pricing" className="shrink-0 font-medium text-primary hover:underline">
            {tp("changePlan")}
          </Link>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate={false}>
        <Field label={t("name")} htmlFor="name">
          <Input id="name" autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </Field>
        <Field label={t("email")} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </Field>
        <Field label={t("password")} htmlFor="password" hint={t("passwordHint")}>
          <PasswordInput id="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="text-muted-foreground">
            {tp.rich("agree", {
              terms: (chunks) => (
                <Link prefetch={false} href="/terms" target="_blank" className="font-medium text-foreground underline underline-offset-4">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link prefetch={false} href="/privacy" target="_blank" className="font-medium text-foreground underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-11 text-base" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {t("signUp")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link prefetch={false} href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {t("signInInstead")}
        </Link>
      </p>
    </div>
  );
}
