-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MANUAL', 'CHAPA');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "amount" DECIMAL(65,30),
ADD COLUMN     "chapaRef" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ETB',
ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "receiptNumber" TEXT,
ADD COLUMN     "txRef" TEXT,
ALTER COLUMN "receiptPath" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txRef_key" ON "Payment"("txRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- CreateIndex
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
