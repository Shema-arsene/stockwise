-- Role hierarchy (platform / business / shop), businesses with branches, append-only activity log.
-- Hand-written so existing shops keep their data.

-- ── Enums ──────────────────────────────────────────────────────────────
CREATE TYPE "PlatformRole" AS ENUM ('FOUNDER', 'SUPER_ADMIN');
CREATE TYPE "BusinessRole" AS ENUM ('OWNER');
CREATE TYPE "ShopRole" AS ENUM ('ADMIN', 'CASHIER');
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- ── Businesses: one per existing shop (same id, so ids stay easy to trace) ──
CREATE TABLE "business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "trialEndsAt" TIMESTAMP(3),
    "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);

INSERT INTO "business" ("id", "name", "plan", "trialEndsAt", "createdAt", "updatedAt")
SELECT "id", "name", "plan", "trialEndsAt", "createdAt", CURRENT_TIMESTAMP FROM "shop";

ALTER TABLE "shop" ADD COLUMN "businessId" TEXT;
UPDATE "shop" SET "businessId" = "id";
ALTER TABLE "shop" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "shop" DROP COLUMN "plan", DROP COLUMN "trialEndsAt";

-- ── Business owners: the earliest active OWNER of each shop ─────────────
CREATE TABLE "business_member" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_member_pkey" PRIMARY KEY ("id")
);

INSERT INTO "business_member" ("id", "businessId", "userId", "role", "createdAt")
SELECT DISTINCT ON ("shopId") gen_random_uuid()::text, "shopId", "userId", 'OWNER', "createdAt"
FROM "membership"
WHERE "role" = 'OWNER' AND "deletedAt" IS NULL
ORDER BY "shopId", "createdAt";

-- ── Shop memberships: ADMIN | CASHIER ──────────────────────────────────
-- The business owner no longer needs a shop membership (owners reach every branch).
DELETE FROM "membership" m
USING "business_member" bm
WHERE bm."businessId" = m."shopId" AND bm."userId" = m."userId";

-- Any other former OWNER, and every MANAGER, becomes ADMIN.
ALTER TABLE "membership" ADD COLUMN "role_new" "ShopRole";
UPDATE "membership" SET "role_new" = CASE WHEN "role" = 'CASHIER' THEN 'CASHIER'::"ShopRole" ELSE 'ADMIN'::"ShopRole" END;
ALTER TABLE "membership" DROP COLUMN "role";
ALTER TABLE "membership" RENAME COLUMN "role_new" TO "role";
ALTER TABLE "membership" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "membership" ADD COLUMN "disabledAt" TIMESTAMP(3);

ALTER TABLE "invitation" ADD COLUMN "role_new" "ShopRole";
UPDATE "invitation" SET "role_new" = CASE WHEN "role" = 'CASHIER' THEN 'CASHIER'::"ShopRole" ELSE 'ADMIN'::"ShopRole" END;
ALTER TABLE "invitation" DROP COLUMN "role";
ALTER TABLE "invitation" RENAME COLUMN "role_new" TO "role";
ALTER TABLE "invitation" ALTER COLUMN "role" SET NOT NULL;

DROP TYPE "Role";

-- ── Users: platform role, username (PIN accounts), lockout ─────────────
ALTER TABLE "user"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "platformRole" "PlatformRole",
  ADD COLUMN "managedByBusinessId" TEXT,
  ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");
-- Exactly one founder.
CREATE UNIQUE INDEX "user_single_founder" ON "user"("platformRole") WHERE "platformRole" = 'FOUNDER';

-- ── Activity log (append-only) ─────────────────────────────────────────
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientAt" TIMESTAMP(3),
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "businessId" TEXT,
    "shopId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "summary" JSONB,
    "deviceId" TEXT,
    "ip" TEXT,
    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

INSERT INTO "activity_log" ("id", "at", "actorId", "businessId", "shopId", "action", "entity", "entityId", "summary")
SELECT a."id", a."createdAt", a."userId", s."businessId", a."shopId", a."action", a."entity", a."entityId", a."detail"
FROM "audit_log" a JOIN "shop" s ON s."id" = a."shopId";

DROP TABLE "audit_log";

CREATE INDEX "activity_log_businessId_at_idx" ON "activity_log"("businessId", "at");
CREATE INDEX "activity_log_at_idx" ON "activity_log"("at");
CREATE INDEX "activity_log_actorId_at_idx" ON "activity_log"("actorId", "at");

-- The database itself refuses to change or remove log entries.
CREATE FUNCTION activity_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "activity_log"
  FOR EACH ROW EXECUTE FUNCTION activity_log_append_only();

CREATE TRIGGER activity_log_no_truncate
  BEFORE TRUNCATE ON "activity_log"
  FOR EACH STATEMENT EXECUTE FUNCTION activity_log_append_only();

-- ── Indexes and foreign keys ───────────────────────────────────────────
CREATE INDEX "business_member_userId_idx" ON "business_member"("userId");
CREATE UNIQUE INDEX "business_member_businessId_role_key" ON "business_member"("businessId", "role");
CREATE UNIQUE INDEX "business_member_businessId_userId_key" ON "business_member"("businessId", "userId");
CREATE INDEX "shop_businessId_idx" ON "shop"("businessId");

ALTER TABLE "business_member" ADD CONSTRAINT "business_member_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_member" ADD CONSTRAINT "business_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop" ADD CONSTRAINT "shop_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
