-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN "quizBankId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_quizBankId_key" ON "Quiz"("quizBankId");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_quizBankId_fkey" FOREIGN KEY ("quizBankId") REFERENCES "QuizBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
