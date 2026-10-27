"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Menu, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCachedSession } from "@/lib/local/session";
import { cn } from "@/lib/utils";

/** Main links. Section links are absolute ("/#…") so they also work from /pricing and legal pages. */
export const SECTIONS = [
  { id: "features", key: "features", href: "/#features" },
  { id: "how", key: "how", href: "/#how" },
  { id: "pricing", key: "pricing", href: "/pricing" },
  { id: "faq", key: "faq", href: "/#faq" },
] as const;

export function Logo({ className }: { className?: string }) {
  return (
    <Link prefetch={false} href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)} aria-label="StockWise">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Store className="size-4" />
      </span>
      StockWise
    </Link>
  );
}

/** Sticky top navigation. Gains a border and solid background once the page scrolls. */
export function LandingNav() {
  const t = useTranslations("site.nav");
  const session = useCachedSession();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const primary = session ? (
    <Button asChild>
      <Link prefetch={false} href="/app">{t("openApp")}</Link>
    </Button>
  ) : (
    <Button asChild>
      <Link prefetch={false} href="/register">{t("startFree")}</Link>
    </Button>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-colors duration-200",
        scrolled ? "border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75" : "border-b border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4" aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={s.href} className="rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground">
                {t(s.key)}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto hidden items-center gap-1 whitespace-nowrap lg:flex">
          <LanguageSwitcher />
          <ThemeToggle />
          {!session && (
            <Button asChild variant="ghost">
              <Link prefetch={false} href="/login">{t("signIn")}</Link>
            </Button>
          )}
          {primary}
        </div>

        {/* Phones: theme toggle + menu sheet */}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("menu")}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <ul className="grid gap-1 px-4">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a href={s.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-3 text-base font-medium hover:bg-muted">
                      {t(s.key)}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-auto grid gap-2 p-4">
                <LanguageSwitcher />
                {!session && (
                  <Button asChild variant="outline" size="lg" className="h-11">
                    <Link prefetch={false} href="/login">{t("signIn")}</Link>
                  </Button>
                )}
                <Button asChild size="lg" className="h-11">
                  <Link prefetch={false} href={session ? "/app" : "/register"}>{session ? t("openApp") : t("startFree")}</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
