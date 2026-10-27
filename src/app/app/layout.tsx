"use client";

import { ShopProvider } from "@/components/app/shop-context";
import { AppShell } from "@/components/app/app-shell";
import { Splash } from "@/components/app/splash";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider splash={<Splash />}>
      <AppShell>{children}</AppShell>
    </ShopProvider>
  );
}
