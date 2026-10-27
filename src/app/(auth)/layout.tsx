import { AuthNav, LegalLinks } from "@/components/auth/auth-nav";
import { BrandPanel } from "@/components/auth/brand-panel";

/** Sign-in, sign-up, onboarding and invites: slim nav, form on the left, brand panel on large screens. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AuthNav />
      <div className="grid flex-1 lg:grid-cols-[1fr_minmax(0,0.9fr)]">
        <main className="flex flex-col items-center justify-start bg-muted/30 px-4 pt-8 pb-10 sm:justify-center sm:pt-10">
          <div className="w-full max-w-md">{children}</div>
          <LegalLinks className="mt-8 text-center text-xs text-muted-foreground" />
        </main>
        <BrandPanel />
      </div>
    </div>
  );
}
