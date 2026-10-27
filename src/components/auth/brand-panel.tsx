"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { PhoneFrame } from "@/components/landing/device-frame";

/** Right-hand panel on sign-in / sign-up (large screens): what StockWise does, with a real screenshot. */
export function BrandPanel() {
  const t = useTranslations("authPage");
  return (
    <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-black/10 blur-3xl" aria-hidden />
      <div className="relative">
        <h2 className="max-w-md text-3xl font-bold tracking-tight text-balance">{t("panelTitle")}</h2>
        <ul className="mt-8 space-y-4">
          {(["p1", "p2", "p3", "p4"] as const).map((k) => (
            <li key={k} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
                <Check className="size-3" />
              </span>
              <span className="opacity-95">{t(k)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative mt-10 flex justify-center">
        <PhoneFrame shot="sale" alt={t("shotAlt")} className="w-56 rotate-[-4deg]" />
      </div>
    </aside>
  );
}
