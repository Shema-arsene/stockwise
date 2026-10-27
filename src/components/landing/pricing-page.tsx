"use client";

import { useTranslations } from "next-intl";
import { Check, Minus } from "lucide-react";
import { PLANS, type PlanId } from "@/lib/plans";
import { PricingPlans } from "./pricing";
import { Section, SectionHeading } from "./sections";

export function PricingHero() {
  const t = useTranslations("site.plans");
  return (
    <Section className="pt-12 md:pt-16">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
      <PricingPlans />
    </Section>
  );
}

type Cell = boolean | string; // string = translation key under site.plans.table.values

/** What each package includes, row by row. */
const ROWS: { key: string; values: Record<PlanId, Cell> }[] = [
  { key: "shops", values: { starter: "one", business: "one", pro: "unlimited" } },
  { key: "branches", values: { starter: "one", business: "three", pro: "unlimited" } },
  { key: "staff", values: { starter: "three", business: "fifteen", pro: "unlimited" } },
  { key: "sales", values: { starter: true, business: true, pro: true } },
  { key: "offline", values: { starter: true, business: true, pro: true } },
  { key: "roles", values: { starter: true, business: true, pro: true } },
  { key: "dashboard", values: { starter: true, business: true, pro: true } },
  { key: "reportsFull", values: { starter: false, business: true, pro: true } },
  { key: "downloads", values: { starter: false, business: true, pro: true } },
  { key: "activity", values: { starter: false, business: true, pro: true } },
  { key: "support", values: { starter: "community", business: "whatsapp", pro: "priority" } },
  { key: "onboarding", values: { starter: false, business: false, pro: true } },
];

export function PlanComparison() {
  const t = useTranslations("site.plans");
  return (
    <Section className="bg-muted/40">
      <SectionHeading eyebrow={t("table.eyebrow")} title={t("table.title")} />
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">{t("table.title")}</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-4 text-left font-medium text-muted-foreground">
                {t("table.feature")}
              </th>
              {PLANS.map((p) => (
                <th key={p.id} scope="col" className={p.highlighted ? "bg-primary/5 p-4 text-center font-semibold text-primary" : "p-4 text-center font-semibold"}>
                  {t(`${p.id}.name`)}
                  <span className="block text-xs font-normal text-muted-foreground">K{p.price} {t("perMonth")}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b last:border-0">
                <th scope="row" className="p-4 text-left font-normal">
                  {t(`table.rows.${row.key}`)}
                </th>
                {PLANS.map((p) => {
                  const v = row.values[p.id];
                  return (
                    <td key={p.id} className={p.highlighted ? "bg-primary/5 p-4 text-center" : "p-4 text-center"}>
                      {v === true ? (
                        <Check className="mx-auto size-5 text-primary" aria-label={t("table.included")} />
                      ) : v === false ? (
                        <Minus className="mx-auto size-5 text-muted-foreground/50" aria-label={t("table.notIncluded")} />
                      ) : (
                        t(`table.values.${v}`)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
