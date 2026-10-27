import {
  Activity,
  BarChart3,
  Building2,
  Boxes,
  HandCoins,
  Home,
  type LucideIcon,
  Menu,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  UserCog,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface NavItem {
  href: string;
  labelKey: string; // key under "nav"
  icon: LucideIcon;
  permission?: Permission;
}

/** Full menu (sidebar on larger screens, "More" page on phones). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/app", labelKey: "home", icon: Home },
  { href: "/app/sales/new", labelKey: "sell", icon: ShoppingCart, permission: "sale.create" },
  { href: "/app/sales", labelKey: "sales", icon: Receipt, permission: "sale.create" },
  { href: "/app/products", labelKey: "products", icon: Boxes, permission: "product.view" },
  { href: "/app/customers", labelKey: "debts", icon: HandCoins, permission: "debt.record" },
  { href: "/app/purchases", labelKey: "purchases", icon: Truck, permission: "purchase.manage" },
  { href: "/app/suppliers", labelKey: "suppliers", icon: Users, permission: "purchase.manage" },
  { href: "/app/reports", labelKey: "reports", icon: BarChart3, permission: "report.view" },
  { href: "/app/business", labelKey: "business", icon: Building2, permission: "business.manage" },
  { href: "/app/staff", labelKey: "staff", icon: UserCog, permission: "staff.manage" },
  { href: "/app/activity", labelKey: "activity", icon: Activity, permission: "logs.view.business" },
  { href: "/app/settings", labelKey: "settings", icon: Settings },
];

/** Bottom bar on phones: the 5 things a shop keeper does all day. */
export const BOTTOM_NAV: NavItem[] = [
  { href: "/app", labelKey: "home", icon: Home },
  { href: "/app/products", labelKey: "products", icon: Boxes },
  { href: "/app/sales/new", labelKey: "sell", icon: ShoppingCart },
  { href: "/app/customers", labelKey: "debts", icon: HandCoins },
  { href: "/app/more", labelKey: "more", icon: Menu },
];

export function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  if (href === "/app/sales") return pathname === "/app/sales" || pathname === "/app/sales/view";
  return pathname === href || pathname.startsWith(href + "/");
}
