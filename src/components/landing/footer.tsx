"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SITE, whatsappLink } from "@/lib/site";
import { Logo, SECTIONS } from "./nav";

export function LandingFooter() {
  const t = useTranslations("site.footer");
  const tNav = useTranslations("site.nav");
  const tHero = useTranslations("site.hero");
  const wa = whatsappLink();
  const hasContact = !!(wa || SITE.phone || SITE.email);

  return (
    <footer className="border-t bg-muted/30 px-4 pt-14 pb-8">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 md:grid-cols-5">
        <div className="sm:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
        </div>

        <nav aria-label={t("product")}>
          <h2 className="text-sm font-semibold">{t("product")}</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={s.href} className="hover:text-foreground">
                  {tNav(s.key)}
                </a>
              </li>
            ))}
            <li>
              <Link prefetch={false} href="/login" className="hover:text-foreground">
                {tNav("signIn")}
              </Link>
            </li>
            <li>
              <Link prefetch={false} href="/register" className="hover:text-foreground">
                {tNav("startFree")}
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label={t("legal")}>
          <h2 className="text-sm font-semibold">{t("legal")}</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>
              <Link prefetch={false} href="/terms" className="hover:text-foreground">
                {t("terms")}
              </Link>
            </li>
            <li>
              <Link prefetch={false} href="/privacy" className="hover:text-foreground">
                {t("privacy")}
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          {hasContact && (
            <>
              <h2 className="text-sm font-semibold">{t("contact")}</h2>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {wa && (
                  <li>
                    <a href={wa} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-foreground">
                      <MessageCircle className="size-4" />
                      {tHero("whatsapp")}
                    </a>
                  </li>
                )}
                {SITE.phone && (
                  <li>
                    <a href={`tel:${SITE.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 hover:text-foreground">
                      <Phone className="size-4" />
                      {SITE.phone}
                    </a>
                  </li>
                )}
                {SITE.email && (
                  <li>
                    <a href={`mailto:${SITE.email}`} className="inline-flex items-center gap-2 hover:text-foreground">
                      <Mail className="size-4" />
                      {SITE.email}
                    </a>
                  </li>
                )}
              </ul>
            </>
          )}
          <h2 className={hasContact ? "mt-8 text-sm font-semibold" : "text-sm font-semibold"}>{t("language")}</h2>
          <div className="mt-2 -ml-3">
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>
          © {new Date().getFullYear()} StockWise. {t("rights")}
        </p>
        <p>Lusaka, Zambia</p>
      </div>
    </footer>
  );
}
