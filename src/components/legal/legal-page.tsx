"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { AuthNav } from "@/components/auth/auth-nav";
import { LandingFooter } from "@/components/landing/footer";
import { LAST_UPDATED, LEGAL } from "@/content/legal";
import { useLocale } from "@/i18n/locale";

/** Terms or Privacy page: slim nav with back button, readable article, contents list, full footer. */
export function LegalPage({ doc }: { doc: "terms" | "privacy" }) {
  const locale = useLocale();
  const t = useTranslations("legal");
  const format = useFormatter();
  const content = LEGAL[locale][doc];
  const other = doc === "terms" ? "privacy" : "terms";

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AuthNav />
      <main className="flex-1 px-4 py-12 md:py-16">
        <article className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{content.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("updated", { date: format.dateTime(new Date(LAST_UPDATED + "T00:00"), { dateStyle: "long" }) })}</p>
          <p className="mt-8 text-lg leading-relaxed text-pretty">{content.intro}</p>

          <nav aria-label={t("contents")} className="mt-8 rounded-2xl border bg-muted/40 p-5">
            <p className="mb-3 text-sm font-semibold">{t("contents")}</p>
            <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
              {content.sections.map((s, i) => (
                <li key={s.heading}>
                  <a href={`#s${i + 1}`} className="text-muted-foreground hover:text-foreground hover:underline">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-10 space-y-10">
            {content.sections.map((s, i) => (
              <section key={s.heading} id={`s${i + 1}`} className="scroll-mt-6">
                <h2 className="text-xl font-semibold">{s.heading}</h2>
                <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">
                  {s.body.map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-12 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            {t("seeAlso")}{" "}
            <Link prefetch={false} href={`/${other}`} className="font-medium text-primary hover:underline">
              {t(`${other}Title`)}
            </Link>
          </p>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
