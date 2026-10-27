"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { authClient } from "@/lib/auth-client";
import { refreshSession } from "@/components/app/shop-context";
import { safeNext } from "@/lib/safe-next";
import { cn } from "@/lib/utils";

type Mode = "email" | "pin";

export function LoginForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function messageFor(err: { status?: number; code?: string; message?: string } | null | undefined) {
    if (!err) return tc("somethingWrong");
    if (err.status === 429) return t("tooMany");
    if (err.code === "ACCOUNT_LOCKED") return t("locked");
    if (err.code === "ACCOUNT_DEACTIVATED") return t("deactivated");
    if (err.code === "INVALID_EMAIL_OR_PASSWORD") return t("invalidCredentials");
    if (err.code === "INVALID_USERNAME_OR_PASSWORD") return t("invalidPin");
    return err.message ?? tc("somethingWrong");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!navigator.onLine) return setError(t("offlineSignIn"));
    setPending(true);
    try {
      const { error } =
        mode === "email"
          ? await authClient.signIn.email({ email: email.trim(), password: secret })
          : await authClient.signIn.username({ username: username.trim().toLowerCase(), password: secret });
      if (error) return setError(messageFor(error));

      const me = await refreshSession();
      const fallback = me?.shops.length ? "/app" : me?.user.platformRole ? "/platform" : "/onboarding";
      router.replace(safeNext(params.get("next"), fallback));
    } catch (err) {
      // The auth client throws (rather than returns) on some statuses, e.g. 429.
      setError(messageFor(err as { status?: number }));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("signInTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("signInSubtitle")}</p>
      <div>
        <div className="mt-6 mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
          {(["email", "pin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setSecret("");
                setError(null);
              }}
              className={cn("rounded-md px-3 py-2 text-sm font-medium", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {m === "email" ? t("emailTab") : t("pinTab")}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="grid gap-4">
          {mode === "email" ? (
            <>
              <Field label={t("email")} htmlFor="email">
                <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
              </Field>
              <Field label={t("password")} htmlFor="password">
                <PasswordInput id="password" autoComplete="current-password" required value={secret} onChange={(e) => setSecret(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label={t("username")} htmlFor="username">
                <Input
                  id="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11"
                />
              </Field>
              <Field label={t("pin")} htmlFor="pin" hint={t("pinHint")}>
                <PasswordInput id="pin" autoComplete="current-password" required value={secret} onChange={(e) => setSecret(e.target.value)} />
              </Field>
            </>
          )}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11 text-base" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("signIn")}
          </Button>
          {mode === "email" && (
            <p className="text-center text-sm text-muted-foreground">
              {t("noAccount")}{" "}
              <Link prefetch={false} href={`/register${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {t("createOne")}
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
