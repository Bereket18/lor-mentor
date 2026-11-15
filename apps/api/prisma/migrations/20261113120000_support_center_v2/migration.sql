-- Additive only: seven new columns on "SupportTicket", two new tables,
-- indexes and foreign keys. No DROP, no ALTER of an existing column, no
-- rename, no data rewrite of existing columns.
--
--  * "SupportTicket"."number" is SERIAL (unique, autoincrement). Existing
--    tickets are numbered in one pass when the column is added; the free-text
--    "reference" column is left untouched.
--  * paymentId links a ticket to one Payment (ON DELETE SET NULL: removing a
--    payment never deletes the conversation about it). The API only accepts
--    a payment that belongs to the ticket's owner.
--  * "SupportAttachment" stores metadata for re-encoded images; the bytes live
--    in the private upload directory under the random "storedName".
--  * "SupportInternalNote" is a separate table on purpose: staff notes can
--    never be returned by a SupportMessage query.

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "lastStaffReadAt" TIMESTAMP(3),
ADD COLUMN     "lastStudentReadAt" TIMESTAMP(3),
ADD COLUMN     "number" SERIAL NOT NULL,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SupportAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportInternalNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportInternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportAttachment_storedName_key" ON "SupportAttachment"("storedName");

-- CreateIndex
CREATE INDEX "SupportAttachment_messageId_idx" ON "SupportAttachment"("messageId");

-- CreateIndex
CREATE INDEX "SupportInternalNote_ticketId_createdAt_idx" ON "SupportInternalNote"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_idx" ON "SupportTicket"("assignedToId");

-- CreateIndex
CREATE INDEX "SupportTicket_paymentId_idx" ON "SupportTicket"("paymentId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_resolvedAt_idx" ON "SupportTicket"("status", "resolvedAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportInternalNote" ADD CONSTRAINT "SupportInternalNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportInternalNote" ADD CONSTRAINT "SupportInternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

