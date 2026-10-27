"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/page-parts";
import { NAV_ITEMS } from "@/components/app/nav";
import { useShop } from "@/components/app/shop-context";
import { SignOutButton } from "@/components/app/sign-out-button";

/** Phone menu for everything that doesn't fit in the bottom bar. */
export default function MorePage() {
  const t = useTranslations("nav");
  const { can, user } = useShop();
  const items = NAV_ITEMS.filter((i) => !["/app", "/app/sales/new"].includes(i.href) && (!i.permission || can(i.permission)));
  return (
    <>
      <PageHeader title={t("more")} />
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50">
              <item.icon className="size-5 text-muted-foreground" />
              <span className="flex-1 font-medium">{t(item.labelKey)}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
        {user.platformRole && (
          <li>
            <Link href="/platform" className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50">
              <ShieldCheck className="size-5 text-muted-foreground" />
              <span className="flex-1 font-medium">{t("platform")}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        )}
        <li>
          <SignOutButton variant="row" />
        </li>
      </ul>
    </>
  );
}
