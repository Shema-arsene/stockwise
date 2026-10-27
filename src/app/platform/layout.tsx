"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Splash } from "@/components/app/splash";
import { refreshSession } from "@/components/app/shop-context";
import { useCachedSession } from "@/lib/local/session";
import { signOutEverywhereOnDevice } from "@/lib/sign-out";

/** StockWise staff console (founder / super admins). Online only; no shop data is editable here. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("platform");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const session = useCachedSession();

  useEffect(() => {
    if (session === undefined) return;
    refreshSession()
      .then((me) => {
        if (!me) router.replace("/login?next=/platform");
        else if (!me.user.platformRole) router.replace("/app");
      })
      .catch(() => {
        if (!session) router.replace("/login?next=/platform");
      });
    // Check once on load; later session changes come from our own refreshSession call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session === undefined]);

  if (!session?.user.platformRole) return <Splash />;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/platform" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
              <ShieldCheck className="size-4" />
            </span>
            <span>
              StockWise <span className="font-normal text-muted-foreground">· {t("title")}</span>
            </span>
          </Link>
          <span className="ml-auto hidden text-sm text-muted-foreground sm:inline">
            {session.user.name} · {t(session.user.platformRole)}
          </span>
          <LanguageSwitcher />
          <ThemeToggle />
          {session.shops.length > 0 && (
            <Button variant="ghost" size="icon" asChild>
              <Link href="/app" aria-label={t("openApp")}>
                <Store />
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={tAuth("signOut")}
            onClick={async () => {
              await signOutEverywhereOnDevice();
              router.replace("/");
            }}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
