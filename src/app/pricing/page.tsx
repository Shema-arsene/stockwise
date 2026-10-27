import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { FinalCta } from "@/components/landing/sections";
import { LandingFooter } from "@/components/landing/footer";
import { Faq } from "@/components/landing/faq";
import { PricingHero, PlanComparison } from "@/components/landing/pricing-page";

export const metadata: Metadata = {
  title: "Pricing",
  description: "StockWise packages: Starter, Business and Pro. Free while in early access.",
};

export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <LandingNav />
      <main className="flex-1">
        <PricingHero />
        <PlanComparison />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
