"use client";

import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SerwistProvider } from "@serwist/turbopack/react";
import { Toaster } from "@/components/ui/sonner";
import { MESSAGES, useLocale } from "@/i18n/locale";

const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Africa/Lusaka";

export function Providers({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, networkMode: "always" },
          mutations: { networkMode: "always" },
        },
      }),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    // reloadOnOnline is off: the sync engine reacts to reconnection, and a forced reload would wipe half-filled forms.
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone={timeZone}>
          <QueryClientProvider client={queryClient}>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </QueryClientProvider>
        </NextIntlClientProvider>
      </ThemeProvider>
    </SerwistProvider>
  );
}
