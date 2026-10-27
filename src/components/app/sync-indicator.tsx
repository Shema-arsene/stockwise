"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Ban, CloudCheck, CloudOff, CloudAlert, RefreshCw, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useShop } from "./shop-context";

export function SyncIndicator({ className }: { className?: string }) {
  const { sync, syncNow } = useShop();
  const t = useTranslations("sync");
  const format = useFormatter();

  const { icon: Icon, label, tone } = (() => {
    if (sync.status === "syncing") return { icon: RefreshCw, label: t("syncing"), tone: "text-muted-foreground" };
    if (sync.status === "offline") return { icon: CloudOff, label: t("offline"), tone: "text-amber-600 dark:text-amber-400" };
    if (sync.status === "suspended") return { icon: Ban, label: t("suspended"), tone: "text-destructive" };
    if (sync.status === "no-access") return { icon: Ban, label: t("noAccess"), tone: "text-destructive" };
    if (sync.status === "error" || sync.status === "signed-out")
      return { icon: CloudAlert, label: sync.status === "error" ? t("error") : t("signedOut"), tone: "text-destructive" };
    if (sync.pending > 0) return { icon: CloudUpload, label: t("pending", { count: sync.pending }), tone: "text-amber-600 dark:text-amber-400" };
    return { icon: CloudCheck, label: t("synced"), tone: "text-primary" };
  })();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn(tone, className)} aria-label={label}>
          <Icon className={cn("size-5", sync.status === "syncing" && "animate-spin")} />
          {sync.pending > 0 && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-amber-500" aria-hidden />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <p className={cn("font-medium", tone)}>{label}</p>
        {sync.pending > 0 && sync.status !== "syncing" && (
          <p className="mt-1 text-muted-foreground">{t("pending", { count: sync.pending })}</p>
        )}
        <p className="mt-1 text-muted-foreground">
          {sync.lastSyncedAt
            ? t("lastSynced", { time: format.relativeTime(new Date(sync.lastSyncedAt), new Date()) })
            : t("never")}
        </p>
        {sync.lastError && <p className="mt-1 text-xs text-destructive break-words">{sync.lastError}</p>}
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => void syncNow()} disabled={sync.status === "syncing"}>
          <RefreshCw className={cn(sync.status === "syncing" && "animate-spin")} />
          {t("syncNow")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
