-- Customer and supplier addresses
ALTER TABLE "customer" ADD COLUMN "address" TEXT;
ALTER TABLE "supplier" ADD COLUMN "address" TEXT;

-- Purchases can be partly paid; the rest is owed to the supplier.
ALTER TABLE "purchase" ADD COLUMN "amountPaid" BIGINT;
UPDATE "purchase" SET "amountPaid" = CASE WHEN "paid" THEN "total" ELSE 0 END;
ALTER TABLE "purchase" ALTER COLUMN "amountPaid" SET NOT NULL;
CREATE INDEX "purchase_supplierId_idx" ON "purchase"("supplierId");

-- Payments to suppliers (instalments)
CREATE TABLE "supplier_payment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PaymentType" NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "seq" BIGINT NOT NULL,
    CONSTRAINT "supplier_payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_payment_shopId_seq_idx" ON "supplier_payment"("shopId", "seq");
CREATE INDEX "supplier_payment_supplierId_idx" ON "supplier_payment"("supplierId");
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- API rate limiting
CREATE TABLE "api_rate_limit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "api_rate_limit_pkey" PRIMARY KEY ("key")
);
