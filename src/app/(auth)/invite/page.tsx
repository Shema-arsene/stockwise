"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { http, isNetworkError } from "@/lib/http";
import { refreshSession } from "@/components/app/shop-context";
import { setActiveShop, useCachedSession } from "@/lib/local/session";

export default function InvitePage() {
  return (
    <Suspense>
      <Invite />
    </Suspense>
  );
}

function Invite() {
  const t = useTranslations("invite");
  const tAuth = useTranslations("auth");
  const tStaff = useTranslations("staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const session = useCachedSession();
  const [pending, setPending] = useState(false);
  const next = encodeURIComponent(`/invite?token=${token}`);

  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => (await http.get<{ shopName: string; branchName: string; role: "MANAGER" | "CASHIER"; allBranches: boolean }>("/invitations", { params: { token } })).data,
    enabled: !!token,
    retry: false,
  });

  async function accept() {
    setPending(true);
    try {
      const { data } = await http.put<{ id: string; name: string }>("/invitations", { token });
      await refreshSession();
      setActiveShop(data.id);
      toast.success(t("accepted", { shop: data.name }));
      router.replace("/app");
    } catch (err) {
      toast.error(isNetworkError(err) ? tc("needsInternet") : t("invalid"));
      setPending(false);
    }
  }

  if (!token || invite.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("invalid")}</CardTitle>
        </CardHeader>
      </Card>
    );
  }
  if (invite.isPending) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title", { shop: invite.data.shopName })}</CardTitle>
        <CardDescription>
          {invite.data.allBranches
            ? t("subtitleAll", { role: tStaff(`roles.${invite.data.role}`) })
            : t("subtitle", { role: tStaff(`roles.${invite.data.role}`), branch: invite.data.branchName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {session ? (
          <Button size="lg" className="h-10" onClick={() => void accept()} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("accept")}
          </Button>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("signInFirst")}</p>
            <Button asChild size="lg" className="h-10">
              <Link href={`/register?next=${next}`}>{tAuth("createOne")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-10">
              <Link href={`/login?next=${next}`}>{tAuth("signIn")}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
