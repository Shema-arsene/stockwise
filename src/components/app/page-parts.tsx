"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Lock, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/permissions";
import { useShop } from "./shop-context";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string | true;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("common");
  return (
    <div className="no-print mb-4 flex items-start gap-2 md:mb-6">
      {back &&
        (back === true ? (
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0" onClick={() => router.back()} aria-label={t("back")}>
            <ArrowLeft className="size-5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0" asChild>
            <Link href={back} aria-label={t("back")}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        ))}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </span>
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Formats integer ngwee in the shop's currency and the user's language. */
export function useMoney() {
  const { shop } = useShop();
  const locale = useLocale();
  return (ngwee: number) => formatMoney(ngwee, shop.currency, locale);
}

export function Money({ value, className }: { value: number; className?: string }) {
  const fmt = useMoney();
  return <span className={cn("tabular whitespace-nowrap", className)}>{fmt(value)}</span>;
}

/** Number formatting for quantities (up to 3 decimals, no trailing zeros). */
export function useQty() {
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-ZM", { maximumFractionDigits: 3 });
  return (qty: number) => nf.format(qty);
}

/** Renders children only if the current role has the permission. */
export function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can } = useShop();
  const t = useTranslations("settings");
  if (can(permission)) return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
      <Lock className="mb-3 size-8" />
      <p>{t("ownerOnly")}</p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "danger" | "success";
  href?: string;
}) {
  const body = (
    <div className={cn("rounded-xl border bg-card p-4 h-full", href && "transition-colors hover:bg-muted/50")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <Icon
            className={cn(
              "size-4",
              tone === "warning" && "text-amber-600 dark:text-amber-400",
              tone === "danger" && "text-destructive",
              tone === "success" && "text-primary",
              tone === "default" && "text-muted-foreground",
            )}
          />
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
