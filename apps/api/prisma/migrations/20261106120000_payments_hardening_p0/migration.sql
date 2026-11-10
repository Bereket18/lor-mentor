-- Additive only: new table, new nullable columns, new indexes.
-- No DROP, no ALTER of existing columns, no deletes.

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorId" TEXT,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: snapshot + overpayment columns (nullable; existing rows keep NULL)
ALTER TABLE "Payment" ADD COLUMN "planName" TEXT;
ALTER TABLE "Payment" ADD COLUMN "planDurationMonths" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "excessAmount" DECIMAL(65,30);

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_createdAt_idx" ON "PaymentEvent"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_type_createdAt_idx" ON "PaymentEvent"("type", "createdAt");

-- At most one PENDING payment per user (raw SQL: Prisma cannot express a
-- partial index in the schema). Checked against existing data first: if any
-- user already has multiple PENDING rows the migration fails loudly with a
-- clear message — it never deletes or modifies rows; resolve via admin review
-- (reject the stale attempts) before re-running.
DO $$
DECLARE
    dup_users INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_users FROM (
        SELECT "userId" FROM "Payment" WHERE "status" = 'PENDING'
        GROUP BY "userId" HAVING COUNT(*) > 1
    ) d;
    IF dup_users > 0 THEN
        RAISE EXCEPTION 'payments-hardening-p0: % user(s) have more than one PENDING payment; reject the stale attempts via admin review before applying this migration. No rows were modified.', dup_users;
    END IF;
END $$;

CREATE UNIQUE INDEX "Payment_one_pending_per_user_idx" ON "Payment"("userId") WHERE "status" = 'PENDING';
