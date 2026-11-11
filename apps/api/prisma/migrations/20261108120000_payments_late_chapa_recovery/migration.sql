-- Additive only: one nullable column. No DROP, no ALTER of existing columns,
-- no row updates or deletes.
--
-- Records the status a payment was in when a verified Chapa confirmation
-- revived it (EXPIRED or CANCELLED). NULL for every other payment, so the
-- admin queue can flag late recoveries without touching historical rows.

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "recoveredFromStatus" TEXT;
