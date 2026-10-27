import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { prisma } from "@/lib/db/prisma";
import { newId } from "@/lib/ids";

const DAY = 60 * 60 * 24;
const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;
/** Self-registered (email) accounts need 8+ characters; staff logins created by a shop need 6+. */
export const EMAIL_PASSWORD_MIN = 8;
export const STAFF_PASSWORD_MIN = 6;

const SIGN_IN_PATHS = new Set(["/sign-in/email", "/sign-in/username"]);

async function findLoginUser(body: unknown) {
  const b = (body ?? {}) as { email?: unknown; username?: unknown };
  if (typeof b.email === "string") return prisma.user.findUnique({ where: { email: b.email.trim().toLowerCase() } });
  if (typeof b.username === "string") return prisma.user.findUnique({ where: { username: b.username.trim().toLowerCase() } });
  return null;
}

/** Businesses a user belongs to, so their sign-ins appear in those businesses' activity logs. */
async function businessesOf(userId: string): Promise<string[]> {
  const [owned, shops] = await Promise.all([
    prisma.businessMember.findMany({ where: { userId }, select: { businessId: true } }),
    prisma.membership.findMany({ where: { userId, deletedAt: null }, select: { shop: { select: { businessId: true } } } }),
  ]);
  return [...new Set([...owned.map((o) => o.businessId), ...shops.map((m) => m.shop.businessId)])];
}

async function logSignIn(user: { id: string; name: string } | null, action: string, ip: string | null, identifier: string | null) {
  const businessIds = user ? await businessesOf(user.id) : [];
  const rows = (businessIds.length ? businessIds : [null]).map((businessId) => ({
    id: newId(),
    actorId: user?.id ?? null,
    actorName: user?.name ?? identifier,
    action,
    businessId,
    ip,
  }));
  await prisma.activityLog.createMany({ data: rows });
}

export const auth = betterAuth({
  appName: "StockWise",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Lowest common length (staff logins). Email sign-ups are held to EMAIL_PASSWORD_MIN below.
    minPasswordLength: STAFF_PASSWORD_MIN,
    autoSignIn: true,
  },
  session: {
    // Shops may stay offline for days; keep sessions long and refresh them daily when online.
    expiresIn: 60 * DAY,
    updateAge: DAY,
  },
  rateLimit: {
    // E2E tests sign up many accounts from one address, so they can switch this off.
    enabled: process.env.NODE_ENV === "production" && process.env.DISABLE_AUTH_RATE_LIMIT !== "1",
    // Serverless instances don't share memory, so keep counters in Postgres.
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      // Several staff may share one shop connection (one public IP), so not too strict.
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const password = (ctx.body as { password?: unknown } | undefined)?.password;
        if (typeof password === "string" && password.length < EMAIL_PASSWORD_MIN) {
          throw APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_SHORT", message: `Password must be at least ${EMAIL_PASSWORD_MIN} characters` });
        }
      }
      if (SIGN_IN_PATHS.has(ctx.path)) {
        const user = await findLoginUser(ctx.body);
        if (user?.deactivatedAt) {
          throw APIError.from("FORBIDDEN", { code: "ACCOUNT_DEACTIVATED", message: "This account has been deactivated." });
        }
        if (user?.lockedUntil && user.lockedUntil > new Date()) {
          throw APIError.from("FORBIDDEN", { code: "ACCOUNT_LOCKED", message: "Too many wrong attempts. Try again later." });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      const user = await findLoginUser(ctx.body);
      const ip = ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const identifier = ((ctx.body as { email?: string; username?: string }).email ?? (ctx.body as { username?: string }).username) || null;

      if (isAPIError(ctx.context.returned)) {
        if (!user) return logSignIn(null, "auth.sign_in_failed", ip, identifier);
        const failures = user.failedLogins + 1;
        const lock = failures >= LOCK_AFTER_FAILURES;
        await prisma.user.update({
          where: { id: user.id },
          data: lock
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
            : { failedLogins: failures },
        });
        await logSignIn(user, lock ? "auth.locked" : "auth.sign_in_failed", ip, identifier);
        return;
      }
      if (user) {
        if (user.failedLogins || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
        }
        await logSignIn(user, "auth.sign_in", ip, identifier);
      }
    }),
  },
  plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30, displayUsername: false }), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
