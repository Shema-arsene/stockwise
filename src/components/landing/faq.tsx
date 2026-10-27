"use client";

import { useTranslations } from "next-intl";
import { Mail, MessageCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { SITE, whatsappLink } from "@/lib/site";
import { Section, SectionHeading } from "./sections";

const QUESTIONS = ["offline", "safe", "cashier", "phone", "computer", "vat", "staff", "pricing"] as const;

/** Frequently asked questions as an accessible accordion (keyboard and screen-reader friendly). */
export function Faq() {
  const t = useTranslations("site.faq");
  const tHero = useTranslations("site.hero");
  const wa = whatsappLink();
  return (
    <Section id="faq">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="rounded-2xl border bg-card px-2 sm:px-4">
          {QUESTIONS.map((q) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger className="py-5 text-left text-base font-semibold hover:no-underline">{t(`items.${q}.q`)}</AccordionTrigger>
              <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">{t(`items.${q}.a`)}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {(wa || SITE.email) && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <p className="font-medium">{t("contact")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {wa && (
                <Button asChild variant="outline">
                  <a href={wa} target="_blank" rel="noopener">
                    <MessageCircle />
                    {tHero("whatsapp")}
                  </a>
                </Button>
              )}
              {SITE.email && (
                <Button asChild variant="outline">
                  <a href={`mailto:${SITE.email}`}>
                    <Mail />
                    {SITE.email}
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
