"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One-tap light/dark switch. Icons swap with the `dark` class (CSS only), so nothing flickers
 * or mismatches before the theme is known. The choice is remembered on this device.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("theme");
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={t("toggle")}
      title={t("toggle")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
