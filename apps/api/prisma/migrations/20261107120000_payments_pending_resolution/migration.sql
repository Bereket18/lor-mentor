-- Additive only: two new enum values and one nullable column.
-- No DROP, no ALTER of existing columns, no row updates or deletes.
-- (PostgreSQL >= 12 allows ADD VALUE inside the migration transaction as
-- long as the new value is not used in the same transaction.)

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Hosted checkout URL, stored at initialize so an open checkout can be
-- resumed during lazy resolution instead of creating a duplicate.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT;
