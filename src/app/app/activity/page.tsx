"use client";

import { useTranslations } from "next-intl";
import { ActivityFeed } from "@/components/app/activity-feed";
import { PageHeader, RequirePermission } from "@/components/app/page-parts";
import { useShop } from "@/components/app/shop-context";

export default function ActivityPage() {
  return (
    <RequirePermission permission="logs.view.business">
      <Activity />
    </RequirePermission>
  );
}

function Activity() {
  const t = useTranslations("activity");
  const { shop, session } = useShop();
  const shops = session.shops.filter((s) => s.businessId === shop.businessId).map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle", { name: shop.businessName || shop.name })} />
      <ActivityFeed scope="business" shops={shops} />
    </>
  );
}
