// The three StockWise packages. Shown on the landing page and /pricing; the choice made there is
// remembered through sign-up and stored on the new shop. Limits are descriptive for now (nothing is
// blocked during early access).

export type PlanId = "starter" | "business" | "pro";

/** Database plan for each package (Business.plan). */
export const PLAN_DB: Record<PlanId, "FREE" | "BASIC" | "PRO"> = { starter: "FREE", business: "BASIC", pro: "PRO" };

export interface PlanInfo {
  id: PlanId;
  /** Monthly price in kwacha. */
  price: number;
  /** Feature keys under site.plans.features, in display order. */
  features: string[];
  /** Number of leading features shared with the previous plan ("Everything in …"). */
  highlighted?: boolean;
}

export const PLANS: PlanInfo[] = [
  {
    id: "starter",
    price: 0,
    features: ["shops1", "branches1", "staff3", "core", "offline", "reportsBasic", "languages"],
  },
  {
    id: "business",
    price: 199,
    highlighted: true,
    features: ["everythingStarter", "branches3", "staff15", "reportsFull", "downloads", "activity", "whatsappSupport"],
  },
  {
    id: "pro",
    price: 499,
    features: ["everythingBusiness", "shopsUnlimited", "branchesUnlimited", "staffUnlimited", "prioritySupport", "onboardingHelp"],
  },
];

export const DEFAULT_PLAN: PlanId = "business";

const KEY = "stockwise.plan";

/** Remember the package picked on the pricing page until the shop is created. */
export function rememberPlan(plan: PlanId) {
  try {
    localStorage.setItem(KEY, plan);
  } catch {}
}

export function rememberedPlan(): PlanId | null {
  try {
    const p = localStorage.getItem(KEY);
    return p === "starter" || p === "business" || p === "pro" ? p : null;
  } catch {
    return null;
  }
}

export function isPlanId(v: unknown): v is PlanId {
  return v === "starter" || v === "business" || v === "pro";
}
