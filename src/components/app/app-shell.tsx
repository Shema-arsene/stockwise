"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV, NAV_ITEMS, isActive } from "./nav";
import { useShop } from "./shop-context";
import { SyncIndicator } from "./sync-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "./sign-out-button";
import { PageSkeleton } from "./page-skeleton";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tSync = useTranslations("sync");
  const { shop, can, sync } = useShop();

  const items = NAV_ITEMS.filter((i) => !i.permission || can(i.permission));
  const bottom = BOTTOM_NAV.filter((i) => {
    const full = NAV_ITEMS.find((n) => n.href === i.href);
    return !full?.permission || can(full.permission);
  });

  return (
    <div className="flex min-h-dvh w-full">
      {/* Sidebar: tablets and computers */}
      <aside className="no-print hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar sticky top-0 h-dvh">
        <div className="flex h-14 items-center gap-2 px-4 border-b">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="size-4" />
          </span>
          <ShopLabel name={shop.name} businessName={shop.businessName} />
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(pathname, item.href)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="border-t p-2 flex items-center justify-between">
          <span className="px-2 text-xs text-muted-foreground">StockWise</span>
          <span className="flex items-center">
            <ThemeToggle />
            <SignOutButton />
            <SyncIndicator />
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: phones */}
        <header className="no-print md:hidden sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <ShopLabel name={shop.name} businessName={shop.businessName} />
          <span className="flex items-center">
            <ThemeToggle />
            <SyncIndicator className="relative" />
          </span>
        </header>

        {(sync.status === "suspended" || sync.status === "no-access") && (
          <div className="no-print bg-destructive/10 px-4 py-2 text-center text-sm text-destructive" role="alert">
            {tSync(sync.status === "suspended" ? "suspended" : "noAccess")}
          </div>
        )}

        {!sync.initialised && sync.status === "syncing" && (
          <div className="no-print bg-accent px-4 py-2 text-center text-sm text-accent-foreground">{tSync("firstSync")}</div>
        )}

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-4 md:px-8 md:py-6 pb-24 md:pb-8">
          {/* First download on this device: show the shape of the page, not empty screens or zeros. */}
          {!sync.initialised && sync.status === "syncing" ? <PageSkeleton /> : children}
        </main>

        {/* Bottom bar: phones */}
        <nav className="no-print md:hidden fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-safe">
          <ul className="grid grid-cols-5">
            {bottom.map((item) => {
              const active = isActive(pathname, item.href);
              const isSell = item.href === "/app/sales/new";
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {isSell ? (
                      <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
                        <item.icon className="size-5" />
                      </span>
                    ) : (
                      <item.icon className="size-5" />
                    )}
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

/** "Shop" with the branch underneath when they differ (a shop with several branches). */
function ShopLabel({ name, businessName }: { name: string; businessName: string }) {
  const showBranch = businessName && businessName !== name;
  return (
    <span className="min-w-0 leading-tight">
      <span className="block truncate font-semibold">{businessName || name}</span>
      {showBranch && <span className="block truncate text-xs text-muted-foreground">{name}</span>}
    </span>
  );
}
