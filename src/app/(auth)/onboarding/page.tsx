"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { http, isNetworkError } from "@/lib/http";
import { refreshSession } from "@/components/app/shop-context";
import { setActiveShop, useCachedSession } from "@/lib/local/session";
import { DEFAULT_PLAN, rememberedPlan } from "@/lib/plans";
import { LOCALES, LOCALE_LABELS, setLocale, useLocale, type Locale } from "@/i18n/locale";

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const session = useCachedSession();
  const locale = useLocale();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (session === null) router.replace("/login?next=/onboarding");
  }, [session, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { data } = await http.post<{ id: string }>("/shops", { name, phone, address, locale, plan: rememberedPlan() ?? DEFAULT_PLAN });
      await refreshSession();
      setActiveShop(data.id);
      router.replace("/app");
    } catch (err) {
      setError(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label={t("shopName")} htmlFor="shop-name">
            <Input id="shop-name" required minLength={2} maxLength={80} placeholder={t("shopNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          </Field>
          <Field label={t("phone")} htmlFor="shop-phone" optional={tc("optional")}>
            <Input id="shop-phone" type="tel" inputMode="tel" placeholder="+260 97 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
          </Field>
          <Field label={t("address")} htmlFor="shop-address" optional={tc("optional")}>
            <Input id="shop-address" placeholder={t("addressPlaceholder")} value={address} onChange={(e) => setAddress(e.target.value)} className="h-10" />
          </Field>
          <Field label={t("language")}>
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LOCALE_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-10" disabled={pending || !session}>
            {pending && <Loader2 className="animate-spin" />}
            {t("create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
