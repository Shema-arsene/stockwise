"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_PLAN, PLANS, rememberPlan, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * The three packages side by side. Tapping a card selects it; the middle (Business) package is
 * selected to begin with. The button carries the choice through sign-up.
 */
export function PricingPlans() {
  const t = useTranslations("site.plans");
  const [selected, setSelected] = useState<PlanId>(DEFAULT_PLAN);

  return (
    <div>
      <div className="mx-auto mb-10 flex max-w-xl items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-center text-sm font-medium text-primary">
        <Sparkles className="size-4 shrink-0" />
        {t("earlyAccess")}
      </div>
      <div role="radiogroup" aria-label={t("choose")} className="grid items-stretch gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const active = selected === plan.id;
          return (
            <div
              key={plan.id}
              role="radio"
              aria-checked={active}
              tabIndex={0}
              onClick={() => setSelected(plan.id)}
              onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), setSelected(plan.id))}
              className={cn(
                "relative flex cursor-pointer flex-col rounded-3xl border-2 bg-card p-7 text-left shadow-sm transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "border-primary shadow-xl shadow-primary/10 lg:-translate-y-2" : "border-border hover:border-primary/40",
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold whitespace-nowrap text-primary-foreground shadow">
                  {t("popular")}
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{t(`${plan.id}.name`)}</h3>
                <span
                  className={cn("flex size-5 items-center justify-center rounded-full border-2", active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}
                  aria-hidden
                >
                  {active && <Check className="size-3" />}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t(`${plan.id}.tagline`)}</p>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tracking-tight">K{plan.price}</span>
                <span className="text-muted-foreground">{t("perMonth")}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                    <span className={f.startsWith("everything") ? "font-medium" : undefined}>{t(`features.${f}`)}</span>
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" variant={active ? "default" : "outline"} className="mt-8 h-12 w-full text-base">
                <Link prefetch={false} href={`/register?plan=${plan.id}`} onClick={() => rememberPlan(plan.id)}>
                  {t("cta", { plan: t(`${plan.id}.name`) })}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">{t("note")}</p>
    </div>
  );
}
