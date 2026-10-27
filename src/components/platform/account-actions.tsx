"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, MoreVertical, Power, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { apiErrorCode, http, isNetworkError } from "@/lib/http";

type Action = "reset_password" | "unlock" | "deactivate" | "reactivate";

/**
 * Founder / super admin actions on one account. The server enforces rank (a super admin cannot
 * act on the founder or other super admins); this menu just offers the actions.
 */
export function AccountActions({ user, onDone }: { user: { id: string; name: string; locked: boolean; deactivated: boolean }; onDone?: () => void }) {
  const t = useTranslations("platform");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [temp, setTemp] = useState<{ login: string; password: string } | null>(null);

  const run = useMutation({
    mutationFn: async (action: Action) => (await http.post<{ temporaryPassword?: string; login: string }>("/platform/accounts", { userId: user.id, action })).data,
    onSuccess: (d, action) => {
      setConfirm(null);
      if (action === "reset_password" && d.temporaryPassword) setTemp({ login: d.login, password: d.temporaryPassword });
      else toast.success(t("done"));
      void qc.invalidateQueries({ queryKey: ["platform-accounts"] });
      void qc.invalidateQueries({ queryKey: ["platform-business"] });
      onDone?.();
    },
    onError: (err) => {
      setConfirm(null);
      toast.error(apiErrorCode(err) === "forbidden" ? tc("somethingWrong") : isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong"));
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`${tc("actions")}: ${user.name}`}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirm("reset_password")}>
            <KeyRound />
            {t("resetPassword")}
          </DropdownMenuItem>
          {user.locked && (
            <DropdownMenuItem onSelect={() => run.mutate("unlock")}>
              <Unlock />
              {t("unlock")}
            </DropdownMenuItem>
          )}
          {user.deactivated ? (
            <DropdownMenuItem onSelect={() => run.mutate("reactivate")}>
              <Power />
              {t("reactivate")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("deactivate")}>
              <Power />
              {t("deactivate")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "deactivate" ? t("deactivateTitle", { name: user.name }) : t("resetTitle", { name: user.name })}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === "deactivate" ? t("deactivateHint") : t("resetHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant={confirm === "deactivate" ? "destructive" : "default"} onClick={() => confirm && run.mutate(confirm)}>
              {run.isPending && <Loader2 className="animate-spin" />}
              {confirm === "deactivate" ? t("deactivate") : t("resetPassword")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!temp} onOpenChange={(o) => !o && setTemp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{temp && t("tempPassword", { email: temp.login })}</AlertDialogTitle>
            <AlertDialogDescription>{t("resetHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="select-all rounded-md bg-muted p-3 text-center font-mono text-xl tracking-wider">{temp?.password}</p>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setTemp(null)}>{tc("close")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
