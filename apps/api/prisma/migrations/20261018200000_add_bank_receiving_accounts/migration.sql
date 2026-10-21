-- Admin-managed college receiving accounts, one per accepted bank.
--
-- The account is digit-only and is used for two things:
--   1. the transfer-accounts panel shown to students (full number), and
--   2. matching the receiver account on a bank-confirmed receipt before any
--      auto-approval (see bank-account-match.ts).
--
-- CBE legacy receipts still require the last 8 digits for the bank lookup and
-- BOA requires the last 5; those are derived from the full account at runtime.
-- Existing COMPANY_BANK_ACCOUNTS values remain a fallback, so this migration
-- does not disable any currently accepted receiving account.

ALTER TABLE "AcceptedBank" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "AcceptedBank" ADD COLUMN "accountName" TEXT;

CREATE UNIQUE INDEX "AcceptedBank_accountNumber_key" ON "AcceptedBank"("accountNumber");
