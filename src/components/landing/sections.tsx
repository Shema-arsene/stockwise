"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  CloudCheck,
  CloudOff,
  CloudUpload,
  HandCoins,
  type LucideIcon,
  MessageCircle,
  Quote,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Store,
  UserCog,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE, whatsappLink } from "@/lib/site";
import { cn } from "@/lib/utils";
import { LaptopFrame, PhoneFrame } from "./device-frame";
import { PricingPlans } from "./pricing";

/** Section wrapper with consistent spacing and an anchor offset below the sticky nav. */
export function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-20 md:py-28", className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, center = true }: { eyebrow: string; title: string; subtitle?: string; center?: boolean }) {
  return (
    <div className={cn("mb-12 max-w-2xl md:mb-16", center && "mx-auto text-center")}>
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance md:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-lg text-muted-foreground text-pretty">{subtitle}</p>}
    </div>
  );
}

function StartButton({ label, size = "lg", className }: { label: string; size?: "lg" | "default"; className?: string }) {
  return (
    <Button asChild size={size} className={cn("h-12 px-6 text-base", className)}>
      <Link prefetch={false} href="/register">
        {label}
        <ArrowRight />
      </Link>
    </Button>
  );
}

function WhatsAppButton({ label, className, inverted }: { label: string; className?: string; inverted?: boolean }) {
  const href = whatsappLink();
  if (!href) return null;
  return (
    <Button asChild size="lg" variant="outline" className={cn("h-12 px-6 text-base", inverted && "border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground", className)}>
      <a href={href} target="_blank" rel="noopener">
        <MessageCircle />
        {label}
      </a>
    </Button>
  );
}

// ─────────────────────────────── Hero ───────────────────────────────

export function Hero() {
  const t = useTranslations("site.hero");
  return (
    <section className="relative -mt-16 overflow-hidden px-4 pt-26 pb-20 md:pt-32 md:pb-28">
      {/* soft brand glow */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl dark:bg-primary/10" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] bg-[size:44px_44px] opacity-40" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1.15fr]">
        <div className="text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-sm font-medium backdrop-blur">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            {t("badge")}
          </p>
          <h1 className="mt-6 text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">{t("title")}</h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground text-pretty lg:mx-0">{t("subtitle")}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <StartButton label={t("cta")} />
            <WhatsAppButton label={t("whatsapp")} />
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground lg:justify-start">
            {(["free", "offline", "languages"] as const).map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <Check className="size-4 text-primary" />
                {t(`points.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-2xl pb-10 lg:pb-0">
          <LaptopFrame shot="dashboard" alt={t("shotDashboard")} priority />
          <PhoneFrame shot="sale" alt={t("shotSale")} priority className="absolute -bottom-2 -left-2 w-[30%] sm:-left-6 lg:-bottom-10 lg:-left-12" />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────── Facts strip ───────────────────────────────

export function Facts() {
  const t = useTranslations("site.facts");
  const facts: { key: string; icon: LucideIcon }[] = [
    { key: "offline", icon: Wifi },
    { key: "kwacha", icon: ReceiptText },
    { key: "safe", icon: ShieldCheck },
    { key: "audit", icon: CloudCheck },
  ];
  return (
    <div className="border-y bg-muted/40 px-4 py-6">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-4 text-sm font-medium md:grid-cols-4">
        {facts.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-center justify-center gap-2 text-center md:justify-start md:text-left">
            <Icon className="size-5 shrink-0 text-primary" />
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────── Features ───────────────────────────────

const FEATURES = [
  { key: "sell", icon: ShoppingCart, shot: "sale", device: "phone" },
  { key: "stock", icon: Boxes, shot: "products", device: "phone" },
  { key: "debts", icon: HandCoins, shot: "debts", device: "phone" },
  { key: "reports", icon: BarChart3, shot: "reports", device: "laptop" },
] as const;

export function Features() {
  const t = useTranslations("site.features");
  return (
    <Section id="features">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
      <div className="space-y-24 md:space-y-32">
        {FEATURES.map((f, i) => (
          <div key={f.key} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
            <div className={cn(i % 2 === 1 && "md:order-2")}>
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-2xl font-bold tracking-tight md:text-3xl">{t(`${f.key}.title`)}</h3>
              <p className="mt-3 text-lg text-muted-foreground text-pretty">{t(`${f.key}.body`)}</p>
              <ul className="mt-6 space-y-3">
                {(["p1", "p2", "p3"] as const).map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                    <span>{t(`${f.key}.${p}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={cn("relative flex justify-center", i % 2 === 1 && "md:order-1")}>
              <div className="absolute inset-x-6 top-10 bottom-0 -z-10 rounded-[2rem] bg-gradient-to-b from-primary/15 to-transparent" aria-hidden />
              {f.device === "phone" ? (
                <PhoneFrame shot={f.shot} alt={t(`${f.key}.alt`)} className="w-[62%] max-w-[300px]" />
              ) : (
                <LaptopFrame shot={f.shot} alt={t(`${f.key}.alt`)} className="w-full" />
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─────────────────────────────── Built for real shops ───────────────────────────────

export function BuiltFor() {
  const t = useTranslations("site.built");
  const tSync = useTranslations("sync");
  const cards: { key: "offline" | "team" | "branches"; icon: LucideIcon }[] = [
    { key: "offline", icon: CloudOff },
    { key: "team", icon: UserCog },
    { key: "branches", icon: Building2 },
  ];
  return (
    <Section className="bg-muted/40">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
      <div className="grid gap-5 md:grid-cols-3">
        {cards.map(({ key, icon: Icon }) => (
          <div key={key} className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-5 text-lg font-semibold">{t(`${key}.title`)}</h3>
            <p className="mt-2 text-muted-foreground">{t(`${key}.body`)}</p>
            {key === "offline" && (
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex items-center gap-2 rounded-lg border px-3 py-2 text-amber-700 dark:text-amber-400">
                  <CloudOff className="size-4 shrink-0" />
                  {tSync("offline")}
                </li>
                <li className="flex items-center gap-2 rounded-lg border px-3 py-2 text-amber-700 dark:text-amber-400">
                  <CloudUpload className="size-4 shrink-0" />
                  {tSync("pending", { count: 3 })}
                </li>
                <li className="flex items-center gap-2 rounded-lg border px-3 py-2 text-primary">
                  <CloudCheck className="size-4 shrink-0" />
                  {tSync("synced")}
                </li>
              </ul>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─────────────────────────────── How it works ───────────────────────────────

export function HowItWorks() {
  const t = useTranslations("site.how");
  const steps: { key: "s1" | "s2" | "s3"; icon: LucideIcon }[] = [
    { key: "s1", icon: Store },
    { key: "s2", icon: Boxes },
    { key: "s3", icon: ShoppingCart },
  ];
  return (
    <Section id="how">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
      <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
        <div className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-border md:block" aria-hidden />
        {steps.map(({ key, icon: Icon }, i) => (
          <li key={key} className="relative text-center">
            <span className="relative mx-auto flex size-14 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-md">
              <Icon className="size-6" />
              <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-xs font-bold text-background">
                {i + 1}
              </span>
            </span>
            <h3 className="mt-5 text-lg font-semibold">{t(`${key}.title`)}</h3>
            <p className="mx-auto mt-2 max-w-xs text-muted-foreground">{t(`${key}.body`)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ─────────────────────────────── Pricing ───────────────────────────────

export function Pricing() {
  const t = useTranslations("site.plans");
  return (
    <Section id="pricing" className="bg-muted/40">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
      <PricingPlans />
      <p className="mt-6 text-center">
        <Link prefetch={false} href="/pricing" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {t("compare")}
          <ArrowRight className="size-4" />
        </Link>
      </p>
    </Section>
  );
}

// ─────────────────────────────── Testimonials (real quotes only) ───────────────────────────────

export function Testimonials() {
  const t = useTranslations("site.testimonials");
  if (!SITE.testimonials.length) return null;
  return (
    <Section>
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {SITE.testimonials.map((q) => (
          <figure key={q.name + q.shop} className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
            <Quote className="size-6 text-primary" />
            <blockquote className="mt-4 flex-1 text-pretty">“{q.quote}”</blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              {q.photo ? (
                <Image src={q.photo} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-muted font-semibold">{q.name.slice(0, 1)}</span>
              )}
              <span>
                <span className="block font-semibold">{q.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {q.shop}, {q.town}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

// ─────────────────────────────── Final call to action ───────────────────────────────

export function FinalCta() {
  const t = useTranslations("site.cta");
  const tHero = useTranslations("site.hero");
  return (
    <section className="px-4 pb-20 md:pb-28">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground md:py-20">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-black/10 blur-2xl" aria-hidden />
        <h2 className="relative text-3xl font-bold tracking-tight text-balance md:text-4xl">{t("title")}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg opacity-90">{t("body")}</p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" variant="secondary" className="h-12 px-6 text-base">
            <Link prefetch={false} href="/register">
              {t("button")}
              <ArrowRight />
            </Link>
          </Button>
          <WhatsAppButton label={tHero("whatsapp")} inverted />
        </div>
      </div>
    </section>
  );
}
