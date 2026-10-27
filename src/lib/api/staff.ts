import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { canChangeRole, canManagePerson, highestRole, type AnyRole, type Role } from "@/lib/permissions";
import { HttpError, type ShopContext } from "./context";
import { logActivity, type ActivityActor } from "./activity";
import { manageableShopIds } from "./people";

export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
/** Staff logins created by a shop: any password of 6+ characters (not necessarily digits). */
export const staffPassword = z.string().min(6).max(128);

/**
 * Where someone works: one branch ("branch", a Membership row) or every branch of a shop
 * ("shop", a shop-wide manager: a BusinessMember row with role MANAGER).
 */
export type AssignmentKind = "branch" | "shop";

export interface Assignment {
  kind: AssignmentKind;
  id: string;
  userId: string;
  userName: string;
  businessId: string;
  shopId: string | null; // null = all branches
  role: Exclude<Role, "OWNER">;
  managedByBusinessId: string | null;
  targetPlatformRole: AnyRole | null;
  disabledAt: Date | null;
}

export async function loadAssignment(kind: AssignmentKind, id: string): Promise<Assignment> {
  if (kind === "branch") {
    const m = await prisma.membership.findUnique({
      where: { id },
      include: { shop: { select: { businessId: true } }, user: { select: { name: true, managedByBusinessId: true, platformRole: true } } },
    });
    if (!m || m.deletedAt) throw new HttpError(404, "not_found");
    return {
      kind,
      id,
      userId: m.userId,
      userName: m.user.name,
      businessId: m.shop.businessId,
      shopId: m.shopId,
      role: m.role,
      managedByBusinessId: m.user.managedByBusinessId,
      targetPlatformRole: m.user.platformRole,
      disabledAt: m.disabledAt,
    };
  }
  const bm = await prisma.businessMember.findUnique({
    where: { id },
    include: { user: { select: { name: true, managedByBusinessId: true, platformRole: true } } },
  });
  if (!bm || bm.deletedAt || bm.role !== "MANAGER") throw new HttpError(404, "not_found");
  return {
    kind,
    id,
    userId: bm.userId,
    userName: bm.user.name,
    businessId: bm.businessId,
    shopId: null,
    role: "MANAGER",
    managedByBusinessId: bm.user.managedByBusinessId,
    targetPlatformRole: bm.user.platformRole,
    disabledAt: bm.disabledAt,
  };
}

/** The role used when checking authority over this assignment's holder. */
export function targetRoleOf(a: Assignment): AnyRole {
  return highestRole(a.role, a.targetPlatformRole)!;
}

export interface Authority {
  userId: string;
  role: AnyRole;
  /** For shop staff: the shop they act in and the branches they may manage. Platform staff: undefined. */
  scope?: { businessId: string; shopIds: string[] };
}

/** Authority of a shop owner/manager acting in their current shop. */
export async function authorityOf(ctx: ShopContext): Promise<Authority> {
  return { userId: ctx.user.id, role: ctx.role, scope: { businessId: ctx.businessId, shopIds: await manageableShopIds(ctx) } };
}

/** Throws unless `actor` may manage this assignment. */
export function assertCanManage(actor: Authority, a: Assignment) {
  if (actor.scope) {
    if (a.businessId !== actor.scope.businessId) throw new HttpError(404, "not_found");
    // Branch staff: the branch must be one the actor manages. Shop-wide managers: owners only (rank check below).
    if (a.shopId && !actor.scope.shopIds.includes(a.shopId)) throw new HttpError(404, "not_found");
  }
  if (!canManagePerson({ userId: actor.userId, role: actor.role }, { userId: a.userId, role: targetRoleOf(a) })) {
    throw new HttpError(403, a.userId === actor.userId ? "cannot_change_self" : "forbidden");
  }
}

const logTarget = (a: Assignment) => ({ businessId: a.businessId, shopId: a.shopId, entity: "user", entityId: a.userId });

/** Change role and/or enable state of an assignment the actor may manage. */
export async function updateAssignment(actor: Authority, who: ActivityActor, a: Assignment, input: { role?: "MANAGER" | "CASHIER"; disabled?: boolean }) {
  assertCanManage(actor, a);
  if (input.role && input.role !== a.role) {
    if (a.kind === "shop") throw new HttpError(400, "shop_wide_is_manager_only");
    if (!canChangeRole(actor.role, a.role, input.role)) throw new HttpError(403, "forbidden");
    await prisma.membership.update({ where: { id: a.id }, data: { role: input.role } });
    await logActivity(who, { ...logTarget(a), action: "staff.role", summary: { name: a.userName, from: a.role, to: input.role } });
  }
  if (input.disabled !== undefined && input.disabled !== !!a.disabledAt) {
    // Sessions are kept on purpose: their device may still upload work recorded before this moment.
    const data = { disabledAt: input.disabled ? new Date() : null };
    if (a.kind === "branch") await prisma.membership.update({ where: { id: a.id }, data });
    else await prisma.businessMember.update({ where: { id: a.id }, data });
    await logActivity(who, { ...logTarget(a), action: input.disabled ? "staff.disable" : "staff.enable", summary: { name: a.userName } });
  }
}

/** Remove an assignment. The account itself stays; offline work made before now still syncs. */
export async function removeAssignment(actor: Authority, who: ActivityActor, a: Assignment) {
  assertCanManage(actor, a);
  if (a.kind === "branch") await prisma.membership.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
  else await prisma.businessMember.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
  await logActivity(who, { ...logTarget(a), action: "staff.remove", summary: { name: a.userName, role: a.role, allBranches: a.kind === "shop" } });
}

/**
 * Give someone a place in a shop: one branch, or (managers only) every branch of the shop.
 * Re-activates a previous assignment instead of duplicating it.
 */
export async function assign(
  who: ActivityActor,
  input: { userId: string; userName: string; businessId: string; shopId: string | null; role: "MANAGER" | "CASHIER" },
  newId: () => string,
) {
  if (input.shopId === null) {
    if (input.role !== "MANAGER") throw new HttpError(400, "shop_wide_is_manager_only");
    const existing = await prisma.businessMember.findUnique({ where: { businessId_userId: { businessId: input.businessId, userId: input.userId } } });
    if (existing?.role === "OWNER") throw new HttpError(409, "already_owner");
    if (existing) await prisma.businessMember.update({ where: { id: existing.id }, data: { role: "MANAGER", deletedAt: null, disabledAt: null } });
    else await prisma.businessMember.create({ data: { id: newId(), businessId: input.businessId, userId: input.userId, role: "MANAGER" } });
  } else {
    await prisma.membership.upsert({
      where: { shopId_userId: { shopId: input.shopId, userId: input.userId } },
      create: { id: newId(), shopId: input.shopId, userId: input.userId, role: input.role },
      update: { role: input.role, deletedAt: null, disabledAt: null },
    });
  }
  await logActivity(who, {
    action: "staff.assign",
    businessId: input.businessId,
    shopId: input.shopId,
    entity: "user",
    entityId: input.userId,
    summary: { name: input.userName, role: input.role, allBranches: input.shopId === null },
  });
}

export interface PersonRow {
  userId: string;
  name: string;
  email: string | null;
  username: string | null;
  managedAccount: boolean;
  locked: boolean;
  deactivated: boolean;
  assignments: { kind: AssignmentKind; id: string; role: "MANAGER" | "CASHIER"; shopId: string | null; disabled: boolean }[];
}

/** Everyone working in a shop (business), grouped per person. */
export async function peopleOfBusiness(businessId: string): Promise<{ people: PersonRow[]; owner: { userId: string; name: string; email: string } | null }> {
  const userSelect = { name: true, email: true, username: true, managedByBusinessId: true, lockedUntil: true, deactivatedAt: true } as const;
  const [members, memberships] = await Promise.all([
    prisma.businessMember.findMany({ where: { businessId, deletedAt: null }, include: { user: { select: userSelect } }, orderBy: { createdAt: "asc" } }),
    prisma.membership.findMany({ where: { shop: { businessId }, deletedAt: null }, include: { user: { select: userSelect } }, orderBy: { createdAt: "asc" } }),
  ]);
  const owner = members.find((m) => m.role === "OWNER");
  const people = new Map<string, PersonRow>();
  const row = (userId: string, u: (typeof members)[number]["user"]) => {
    let p = people.get(userId);
    if (!p) {
      p = {
        userId,
        name: u.name,
        email: u.managedByBusinessId ? null : u.email,
        username: u.username,
        managedAccount: u.managedByBusinessId === businessId,
        locked: !!u.lockedUntil && u.lockedUntil > new Date(),
        deactivated: !!u.deactivatedAt,
        assignments: [],
      };
      people.set(userId, p);
    }
    return p;
  };
  for (const m of members) {
    if (m.role === "MANAGER") row(m.userId, m.user).assignments.push({ kind: "shop", id: m.id, role: "MANAGER", shopId: null, disabled: !!m.disabledAt });
  }
  for (const m of memberships) {
    if (owner && m.userId === owner.userId) continue;
    row(m.userId, m.user).assignments.push({ kind: "branch", id: m.id, role: m.role, shopId: m.shopId, disabled: !!m.disabledAt });
  }
  return {
    owner: owner ? { userId: owner.userId, name: owner.user.name, email: owner.user.email } : null,
    people: [...people.values()],
  };
}
