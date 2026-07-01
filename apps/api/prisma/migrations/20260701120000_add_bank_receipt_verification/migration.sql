-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankReference" TEXT,
ADD COLUMN     "verification" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bankReference_key" ON "Payment"("bankReference");
