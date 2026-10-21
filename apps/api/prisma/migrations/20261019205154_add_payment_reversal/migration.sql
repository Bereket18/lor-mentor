-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REVERSED';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedBy" TEXT;
