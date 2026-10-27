"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { signOutEverywhereOnDevice } from "@/lib/sign-out";
import { cn } from "@/lib/utils";
import { useShop } from "./shop-context";

/**
 * Sign-out with confirmation. Warns (in red) when changes are still waiting to sync, because
 * signing out wipes this device's copy of the shop.
 */
export function SignOutButton({ variant = "icon", className }: { variant?: "icon" | "row"; className?: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const { sync } = useShop();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await signOutEverywhereOnDevice();
    router.replace("/");
  }

  return (
    <>
      {variant === "icon" ? (
        <Button variant="ghost" size="icon" className={className} aria-label={t("signOut")} title={t("signOut")} onClick={() => setOpen(true)}>
          <LogOut />
        </Button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium text-destructive hover:bg-muted/50", className)}>
          <LogOut className="size-5" />
          {t("signOut")}
        </button>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("signOutConfirm")}</AlertDialogTitle>
            {sync.pending > 0 && <AlertDialogDescription className="text-destructive">{t("signOutPending", { count: sync.pending })}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant={sync.pending > 0 ? "destructive" : "default"} onClick={() => void signOut()} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {sync.pending > 0 ? t("signOutAnyway") : t("signOut")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
