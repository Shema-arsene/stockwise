import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms and Conditions", description: "The rules for using StockWise." };

export default function TermsPage() {
  return <LegalPage doc="terms" />;
}
