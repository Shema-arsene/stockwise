"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  const t = useTranslations("offline");
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("body")}</p>
      <Button asChild className="mt-2">
        <Link href="/app">{t("home")}</Link>
      </Button>
    </div>
  );
}
