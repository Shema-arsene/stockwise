"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Slim top bar for sign-in, sign-up, onboarding, invites and legal pages: a back button,
 * the logo, and language / theme switches. Deliberately simpler than the landing navigation.
 */
export function AuthNav() {
  const t = useTranslations("common");
  const router = useRouter();

  function back() {
    // Go back within StockWise when we came from here; otherwise land on the home page.
    const sameSite = document.referrer && new URL(document.referrer).origin === location.origin;
    if (sameSite && history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-4" aria-label="StockWise">
        <Button variant="ghost" size="sm" onClick={back} className="-ml-1 gap-1.5">
          <ArrowLeft />
          <span>{t("back")}</span>
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Link prefetch={false} href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Store className="size-3.5" />
          </span>
          <span className="hidden sm:inline">StockWise</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

/** Small legal links shown under forms. */
export function LegalLinks({ className }: { className?: string }) {
  const t = useTranslations("legal");
  return (
    <p className={className ?? "text-center text-xs text-muted-foreground"}>
      <Link prefetch={false} href="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
        {t("termsTitle")}
      </Link>
      <span className="mx-2" aria-hidden>
        ·
      </span>
      <Link prefetch={false} href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
        {t("privacyTitle")}
      </Link>
    </p>
  );
}
