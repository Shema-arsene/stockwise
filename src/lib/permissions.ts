// Who can do what.
//
// Two layers:
//   Platform (the StockWise company):       FOUNDER > SUPER_ADMIN
//   Customer shop (a "business" in code):   OWNER (billed, every branch) > MANAGER (assigned branches) > CASHIER
//
// Account management strictly follows rank: you can manage people ranked below you, never your
// equals, superiors or yourself. Platform roles manage accounts but never write shop data.

export type PlatformRole = "FOUNDER" | "SUPER_ADMIN";
/** A person's effective role inside one branch. OWNER comes from owning the branch's shop. */
export type Role = "OWNER" | "MANAGER" | "CASHIER";
export type AnyRole = PlatformRole | Role;

export const RANK: Record<AnyRole, number> = { CASHIER: 1, MANAGER: 2, OWNER: 3, SUPER_ADMIN: 4, FOUNDER: 5 };

export type Permission =
  // shop data
  | "sale.create"
  | "sale.void"
  | "debt.record"
  | "customer.manage"
  | "product.view"
  | "product.manage"
  | "cost.view" // cost prices, profit, stock value
  | "purchase.manage"
  | "stock.adjust"
  | "report.view"
  // people & settings
  | "staff.manage" // scoped further by canManage()
  | "settings.manage"
  | "logs.view.business"
  | "business.manage" // branches, shop-wide staff
  | "ownership.transfer";

export type PlatformPermission =
  | "platform.view" // shops, users, totals
  | "logs.view.all"
  | "business.admin" // suspend / reactivate a shop, change plan
  | "accounts.manage" // reset passwords, deactivate, change roles & assignments of anyone below you
  | "superadmin.manage";

/** Managers can do everything a cashier does, plus run the branch. */
const CASHIER: Permission[] = ["sale.create", "debt.record", "customer.manage", "product.view"];

const MANAGER: Permission[] = [
  ...CASHIER,
  "sale.void",
  "product.manage",
  "cost.view",
  "purchase.manage",
  "stock.adjust",
  "report.view",
  "staff.manage",
  "settings.manage",
  "logs.view.business",
];

const OWNER: Permission[] = [...MANAGER, "business.manage", "ownership.transfer"];

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  CASHIER: new Set(CASHIER),
  MANAGER: new Set(MANAGER),
  OWNER: new Set(OWNER),
};

const PLATFORM_GRANTS: Record<PlatformRole, ReadonlySet<PlatformPermission>> = {
  SUPER_ADMIN: new Set(["platform.view", "logs.view.all", "business.admin", "accounts.manage"]),
  FOUNDER: new Set(["platform.view", "logs.view.all", "business.admin", "accounts.manage", "superadmin.manage"]),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && GRANTS[role].has(permission);
}

export function canPlatform(role: PlatformRole | null | undefined, permission: PlatformPermission): boolean {
  return !!role && PLATFORM_GRANTS[role].has(permission);
}

/**
 * May `actor` manage (change role, disable, remove, reset password of) someone holding `targetRole`?
 * Strictly by rank. Callers must also check the target is not the actor (see canManagePerson).
 */
export function canManage(actor: AnyRole | null | undefined, targetRole: AnyRole): boolean {
  return !!actor && RANK[actor] > RANK[targetRole];
}

/**
 * May `actor` give someone the role `role`? Always strictly below the actor. OWNER is never handed
 * out this way (only through an ownership transfer), and only the founder appoints super admins.
 */
export function canAssign(actor: AnyRole | null | undefined, role: AnyRole): boolean {
  if (!actor || role === "OWNER" || role === "FOUNDER") return false;
  if (role === "SUPER_ADMIN") return actor === "FOUNDER";
  return RANK[role] < RANK[actor];
}

export function canManagePerson(
  actor: { userId: string; role: AnyRole | null | undefined },
  target: { userId: string; role: AnyRole },
): boolean {
  return actor.userId !== target.userId && canManage(actor.role, target.role);
}

/** Changing someone from one role to another needs authority over both. */
export function canChangeRole(actor: AnyRole | null | undefined, from: AnyRole, to: AnyRole): boolean {
  return canManage(actor, from) && canAssign(actor, to);
}

/** Highest of a person's roles (platform role, or their role in a shop). */
export function highestRole(...roles: (AnyRole | null | undefined)[]): AnyRole | null {
  return roles.filter((r): r is AnyRole => !!r).sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
}
