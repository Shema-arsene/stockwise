import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy", description: "How StockWise collects, uses and protects personal information." };

export default function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}
