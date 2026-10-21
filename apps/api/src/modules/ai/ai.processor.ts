import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from './gemini.service';
import { PdfExtractorService } from './pdf-extractor.service';

export interface AiGenerationJobData {
  materialId: string;
  filename: string;
}

@Processor('ai-generation')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly pdfExtractor: PdfExtractorService,
  ) {
    super();
  }

  // BullMQ calls this automatically whenever a job lands in the
  // 'ai-generation' queue — we never call this method ourselves
  async process(job: Job<AiGenerationJobData>) {
    const { materialId, filename } = job.data;
    this.logger.log(`Processing AI generation for material ${materialId}`);

    // 1. Create (or find) the AiContent record and mark it PROCESSING.
    //    `upsert` is race-safe: two workers handling the same material
    //    can't both try to create the row (materialId is unique).
    const aiContent = await this.prisma.aiContent.upsert({
      where: { materialId },
      create: { materialId, status: 'PROCESSING' },
      update: { status: 'PROCESSING' },
    });

    try {
      // 2. Extract text from the PDF
      const text = await this.pdfExtractor.extractText(filename);

      if (text.trim().length < 100) {
        throw new Error(
          'PDF contains too little extractable text — likely a scanned image PDF',
        );
      }

      // 3. Generate everything via Gemini
      const generated = await this.gemini.generateFromText(text);

      // 4. Save results — wrapped in a transaction so we never end up
      // with a half-saved state (e.g. summary saved but flashcards missing).
      // FlashcardSet/QuizBank are unique per AiContent, so a retry after a
      // partially-completed run must reuse the existing rows instead of
      // calling create() (which used to fail forever with a unique error).
      await this.prisma.$transaction(async (tx) => {
        const flashcardSet = await tx.flashcardSet.upsert({
          where: { aiContentId: aiContent.id },
          create: {
            aiContentId: aiContent.id,
            title: 'AI-Generated Flashcards',
          },
          update: {},
        });

        // Keep already-saved cards (and any student reviews) if this is a
        // retry; only fill the set when it is empty.
        const cardCount = await tx.flashcard.count({
          where: { flashcardSetId: flashcardSet.id },
        });

        if (cardCount === 0) {
          await tx.flashcard.createMany({
            data: generated.flashcards.map((card, i) => ({
              flashcardSetId: flashcardSet.id,
              front: card.front,
              back: card.back,
              sortOrder: i,
            })),
          });
        }

        const quizBank = await tx.quizBank.upsert({
          where: { aiContentId: aiContent.id },
          create: { aiContentId: aiContent.id },
          update: {},
        });

        // Same idempotency guard for questions. The takeable Quiz and any
        // attempts point at these rows, so never delete/recreate them.
        const questionCount = await tx.question.count({
          where: { quizBankId: quizBank.id },
        });

        if (questionCount === 0) {
          await tx.question.createMany({
            data: generated.questions.map((q, i) => ({
              quizBankId: quizBank.id,
              text: q.text,
              options: q.options,
              correctOption: q.correctOption,
              explanation: q.explanation,
              sortOrder: i,
            })),
          });
        }

        // Only mark COMPLETED once the flashcards and quiz are actually saved.
        await tx.aiContent.update({
          where: { id: aiContent.id },
          data: {
            status: 'COMPLETED',
            error: null,
            summary: generated.summary,
            keyTopics: generated.keyTopics,
          },
        });
      });

      // 5. Notify whoever uploaded the material
      const material = await this.prisma.material.findUnique({
        where: { id: materialId },
        select: { title: true, uploadedBy: true },
      });

      if (material) {
        await this.prisma.notification.create({
          data: {
            userId: material.uploadedBy,
            type: 'AI_COMPLETE',
            title: 'AI Content Ready',
            message: `Summary, flashcards, and quiz are ready for "${material.title}"`,
          },
        });
      }

      this.logger.log(`✅ AI generation completed for material ${materialId}`);
    } catch (error) {
      this.logger.error(
        `❌ AI generation failed for material ${materialId}`,
        error,
      );

      await this.prisma.aiContent.update({
        where: { id: aiContent.id },
        data: {
          status: 'FAILED',
          error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : String(error).slice(0, 500),
        },
      });

      // Re-throw so BullMQ knows this job failed and applies its
      // retry policy (configured next, when we register the queue)
      throw error;
    }
  }
}
