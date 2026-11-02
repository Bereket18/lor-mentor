import type { Job } from 'bullmq';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GeminiService } from './gemini.service';
import type { PdfExtractorService } from './pdf-extractor.service';
import { AiProcessor, type AiGenerationJobData } from './ai.processor';

const job = {
  data: { materialId: 'material-1', filename: 'ckd.pdf' },
} as Job<AiGenerationJobData>;

const generated = {
  summary: 'A summary of the material.',
  keyTopics: ['CKD detection'],
  flashcards: [{ front: 'What is CKD?', back: 'Chronic kidney disease.' }],
  questions: [
    {
      text: 'Which test detects CKD?',
      options: ['eGFR', 'CBC', 'ECG', 'EEG'],
      correctOption: 'eGFR',
      explanation: 'eGFR estimates kidney function.',
    },
  ],
};

function buildTx(cardCount: number, questionCount: number) {
  return {
    flashcardSet: {
      upsert: jest.fn().mockResolvedValue({ id: 'set-1' }),
    },
    flashcard: {
      count: jest.fn().mockResolvedValue(cardCount),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    quizBank: {
      upsert: jest.fn().mockResolvedValue({ id: 'bank-1' }),
    },
    question: {
      count: jest.fn().mockResolvedValue(questionCount),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    aiContent: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function buildProcessor() {
  const aiContentUpsert = jest.fn().mockResolvedValue({ id: 'ai-1' });
  const transaction = jest.fn();
  const materialFindUnique = jest
    .fn()
    .mockResolvedValue({ title: 'CKD detection', uploadedBy: 'user-1' });
  const notificationCreate = jest.fn().mockResolvedValue({});

  const prisma = {
    aiContent: { upsert: aiContentUpsert },
    $transaction: transaction,
    material: { findUnique: materialFindUnique },
    notification: { create: notificationCreate },
  } as unknown as PrismaService;

  const gemini = {
    generateFromText: jest.fn().mockResolvedValue(generated),
  } as unknown as GeminiService;

  const pdfExtractor = {
    extractText: jest.fn().mockResolvedValue('x'.repeat(200)),
  } as unknown as PdfExtractorService;

  return {
    processor: new AiProcessor(prisma, gemini, pdfExtractor),
    aiContentUpsert,
    transaction,
    notificationCreate,
  };
}

describe('AiProcessor retry safety', () => {
  it('reuses an existing flashcard set and quiz bank instead of hitting the unique keys', async () => {
    const { processor, aiContentUpsert, transaction } = buildProcessor();
    const tx = buildTx(16, 8);
    transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(tx),
    );

    await processor.process(job);

    expect(aiContentUpsert).toHaveBeenCalledWith({
      where: { materialId: 'material-1' },
      create: { materialId: 'material-1', status: 'PROCESSING' },
      update: { status: 'PROCESSING' },
    });
    expect(tx.flashcardSet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { aiContentId: 'ai-1' } }),
    );
    expect(tx.quizBank.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { aiContentId: 'ai-1' } }),
    );
    // Existing cards/questions (and their reviews/answers) must not be
    // duplicated or deleted on a retry.
    expect(tx.flashcard.createMany).not.toHaveBeenCalled();
    expect(tx.question.createMany).not.toHaveBeenCalled();
    expect(tx.aiContent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ai-1' },
        data: expect.objectContaining({ status: 'COMPLETED', error: null }),
      }),
    );
  });

  it('fills the cards and questions when the existing rows are empty', async () => {
    const { processor, transaction } = buildProcessor();
    const tx = buildTx(0, 0);
    transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(tx),
    );

    await processor.process(job);

    expect(tx.flashcard.createMany).toHaveBeenCalledWith({
      data: [
        {
          flashcardSetId: 'set-1',
          front: 'What is CKD?',
          back: 'Chronic kidney disease.',
          sortOrder: 0,
        },
      ],
    });
    expect(tx.question.createMany).toHaveBeenCalledWith({
      data: [
        {
          quizBankId: 'bank-1',
          text: 'Which test detects CKD?',
          options: ['eGFR', 'CBC', 'ECG', 'EEG'],
          correctOption: 'eGFR',
          explanation: 'eGFR estimates kidney function.',
          sortOrder: 0,
        },
      ],
    });
  });
});
