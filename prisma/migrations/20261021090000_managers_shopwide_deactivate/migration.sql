-- "Admin" becomes "Manager"; managers can cover a whole business (all branches);
-- StockWise staff can deactivate any account.

-- Rename in place, so existing assignments keep working.
ALTER TYPE "ShopRole" RENAME VALUE 'ADMIN' TO 'MANAGER';

-- Shop-wide managers live in business_member next to the owner.
ALTER TYPE "BusinessRole" ADD VALUE 'MANAGER';
ALTER TABLE "business_member" ADD COLUMN "disabledAt" TIMESTAMP(3), ADD COLUMN "deletedAt" TIMESTAMP(3);
-- Several managers per business are allowed now, but still exactly one owner.
DROP INDEX "business_member_businessId_role_key";
CREATE UNIQUE INDEX "business_member_single_owner" ON "business_member"("businessId") WHERE "role" = 'OWNER';

ALTER TABLE "invitation" ADD COLUMN "allBranches" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "user" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
