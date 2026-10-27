import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { BuiltFor, Facts, Features, FinalCta, Hero, HowItWorks, Pricing, Testimonials } from "@/components/landing/sections";
import { Faq } from "@/components/landing/faq";
import { LandingFooter } from "@/components/landing/footer";

const description =
  "Record sales, track stock and customer debts from your phone, even without internet. Bookkeeping and inventory for shops in Zambia. Free while in early access.";

export const metadata: Metadata = {
  title: { absolute: "StockWise — bookkeeping & stock control for your shop" },
  description,
  openGraph: {
    title: "StockWise — bookkeeping & stock control for your shop",
    description,
    type: "website",
    siteName: "StockWise",
  },
  twitter: { card: "summary_large_image", title: "StockWise", description },
};

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <Facts />
        <Features />
        <BuiltFor />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
