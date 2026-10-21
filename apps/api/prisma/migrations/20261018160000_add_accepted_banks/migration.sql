-- Admin-managed list of accepted payment banks.
--
-- The bank catalog (labels, input mode, auto-verification capability) lives in
-- apps/api/src/modules/payments/bank-catalog.ts. This table only records which
-- catalog entries the college currently accepts.
--
-- Additive and non-destructive: new table only. The seed rows preserve the
-- bank list the payment page offered before this feature existed.

CREATE TABLE "AcceptedBank" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcceptedBank_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcceptedBank_code_key" ON "AcceptedBank"("code");

INSERT INTO "AcceptedBank" ("id", "code", "isActive", "createdAt", "updatedAt")
VALUES
    ('bank-cbe', 'cbe', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('bank-tele', 'tele', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('bank-dashen', 'dashen', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('bank-awash', 'awash', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('bank-boa', 'boa', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('bank-zemen', 'zemen', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
