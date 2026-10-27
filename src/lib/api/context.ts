import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "./rate-limit";
import { can, canPlatform, type Permission, type PlatformPermission, type PlatformRole, type Role } from "@/lib/permissions";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public headers?: Record<string, string>,
  ) {
    super(message ?? code);
  }
}

export const SHOP_HEADER = "x-shop-id";

export interface Actor {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole | null;
  ip: string | null;
}

function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export async function requireUser(req: Request): Promise<Actor> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) throw new HttpError(401, "unauthorized");
  const extra = await prisma.user.findUnique({ where: { id: session.user.id }, select: { platformRole: true, deactivatedAt: true } });
  if (extra?.deactivatedAt) throw new HttpError(403, "account_deactivated");
  await rateLimit("api", session.user.id);
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    platformRole: extra?.platformRole ?? null,
    ip: clientIp(req),
  };
}

export interface ShopAccess {
  businessId: string;
  role: Role;
  /** Set when the person was disabled or removed: only work recorded before this moment is accepted. */
  cutoff: Date | null;
  membershipId: string | null;
}

/** When access ended (earliest of disabled / removed), or null if still active. */
function endOf(row: { deletedAt: Date | null; disabledAt: Date | null }): Date | null {
  const ends = [row.deletedAt, row.disabledAt].filter((d): d is Date => !!d);
  return ends.length ? new Date(Math.min(...ends.map((d) => d.getTime()))) : null;
}

const ROLE_RANK: Record<Role, number> = { CASHIER: 1, MANAGER: 2, OWNER: 3 };

/**
 * The person's effective role in a branch, from the strongest of:
 *  - owning the branch's shop (OWNER of every branch)
 *  - being a shop-wide manager (MANAGER of every branch, including future ones)
 *  - their assignment to this branch (MANAGER or CASHIER)
 * Active assignments win over ended ones; between active ones the higher role wins.
 * Platform roles grant nothing here: they never act as shop staff.
 */
export async function resolveShopAccess(userId: string, shopId: string) {
  // One round trip: the branch, its shop's status, and all of this user's ways in.
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      businessId: true,
      business: { select: { status: true, members: { where: { userId }, select: { id: true, role: true, deletedAt: true, disabledAt: true } } } },
      memberships: { where: { userId }, select: { id: true, role: true, deletedAt: true, disabledAt: true } },
    },
  });
  if (!shop) return { shop: null, access: null };

  const candidates: ShopAccess[] = [];
  for (const bm of shop.business.members) {
    if (bm.role === "OWNER") candidates.push({ businessId: shop.businessId, role: "OWNER", cutoff: null, membershipId: null });
    else if (bm.role === "MANAGER") candidates.push({ businessId: shop.businessId, role: "MANAGER", cutoff: endOf(bm), membershipId: null });
  }
  for (const m of shop.memberships) {
    candidates.push({ businessId: shop.businessId, role: m.role, cutoff: endOf(m), membershipId: m.id });
  }
  if (!candidates.length) return { shop, access: null };

  candidates.sort((a, b) => {
    if (!a.cutoff !== !b.cutoff) return a.cutoff ? 1 : -1; // active first
    if (a.cutoff && b.cutoff) return b.cutoff.getTime() - a.cutoff.getTime(); // most recent end first
    return ROLE_RANK[b.role] - ROLE_RANK[a.role];
  });
  return { shop, access: candidates[0] };
}

export interface ShopContext extends ShopAccess {
  user: Actor;
  shopId: string;
}

/**
 * Resolves the signed-in user and the shop they are acting on (x-shop-id header) and checks they
 * may use it. Every shop-scoped query must use ctx.shopId / ctx.businessId, never ids from the body.
 *
 * `allowFormer` lets a disabled/removed person upload work they recorded offline before losing
 * access (sync push only); the caller must then reject anything after ctx.cutoff.
 */
export async function requireShop(req: Request, permission?: Permission, opts?: { allowFormer?: boolean }): Promise<ShopContext> {
  const user = await requireUser(req);
  const shopId = req.headers.get(SHOP_HEADER);
  if (!shopId) throw new HttpError(400, "missing_shop");

  const { shop, access } = await resolveShopAccess(user.id, shopId);
  if (!shop || !access) throw new HttpError(403, "not_a_member");
  if (access.cutoff && !opts?.allowFormer) throw new HttpError(403, "not_a_member");
  if (shop.business.status === "SUSPENDED") throw new HttpError(403, "business_suspended");
  if (permission && !can(access.role, permission)) throw new HttpError(403, "forbidden");

  return { ...access, user, shopId };
}

/** Founder / super admin endpoints. */
export async function requirePlatform(req: Request, permission: PlatformPermission): Promise<Actor & { platformRole: PlatformRole }> {
  const user = await requireUser(req);
  if (!canPlatform(user.platformRole, permission)) throw new HttpError(403, "forbidden");
  return user as Actor & { platformRole: PlatformRole };
}

/** Wraps a route handler so thrown HttpErrors / validation errors become JSON responses. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.code, message: err.message }, { status: err.status, headers: err.headers });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "invalid", issues: err.issues }, { status: 422 });
      }
      console.error(err);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  };
}

/** JSON response that serialises BigInt (money, seq) as plain numbers. */
export function json(data: unknown, init?: ResponseInit) {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  return new Response(body, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}
