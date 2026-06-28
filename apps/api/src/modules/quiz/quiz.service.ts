import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  // Quizzes for a course = the AI-generated QuizBanks tied to its materials.
  // Each is annotated with this user's most recent attempt (if any).
  async getQuizzesForCourse(courseId: string, userId: string) {
    const banks = await this.prisma.quizBank.findMany({
      where: { aiContent: { material: { courseId } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        _count: { select: { questions: true } },
        aiContent: { select: { material: { select: { title: true } } } },
        quiz: {
          select: {
            attempts: {
              where: { userId },
              orderBy: { completedAt: 'desc' },
              take: 1,
              select: { score: true, totalQ: true, completedAt: true },
            },
          },
        },
      },
    });

    return banks.map((b) => ({
      id: b.id,
      title: b.aiContent.material.title,
      questionCount: b._count.questions,
      lastAttempt: b.quiz?.attempts[0] ?? null,
    }));
  }

  // Questions for taking the quiz — NEVER includes correctOption.
  async getQuiz(bankId: string) {
    const bank = await this.prisma.quizBank.findUnique({
      where: { id: bankId },
      select: {
        id: true,
        aiContent: { select: { material: { select: { title: true } } } },
        questions: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, text: true, options: true },
        },
      },
    });
    if (!bank) throw new NotFoundException('Quiz not found');

    return {
      id: bank.id,
      title: bank.aiContent.material.title,
      questions: bank.questions,
    };
  }

  // Grade server-side, persist the attempt, return per-question results.
  async submitAttempt(bankId: string, userId: string, dto: SubmitAttemptDto) {
    const bank = await this.prisma.quizBank.findUnique({
      where: { id: bankId },
      select: {
        id: true,
        aiContent: {
          select: { material: { select: { courseId: true, title: true } } },
        },
        questions: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, correctOption: true, explanation: true },
        },
      },
    });
    if (!bank) throw new NotFoundException('Quiz not found');

    const selectedByQuestion = new Map(
      dto.answers.map((a) => [a.questionId, a.selected]),
    );

    let correctCount = 0;
    const results = bank.questions.map((q) => {
      const selected = selectedByQuestion.get(q.id) ?? null;
      const isCorrect = selected !== null && selected === q.correctOption;
      if (isCorrect) correctCount++;
      return {
        questionId: q.id,
        selected,
        correctOption: q.correctOption,
        isCorrect,
        explanation: q.explanation,
      };
    });
    const totalQ = bank.questions.length;

    // One Quiz row per bank acts as the attempt anchor (quizBankId is unique).
    const quiz = await this.prisma.quiz.upsert({
      where: { quizBankId: bank.id },
      create: {
        courseId: bank.aiContent.material.courseId,
        title: bank.aiContent.material.title,
        isAiGenerated: true,
        createdBy: userId,
        quizBankId: bank.id,
      },
      update: {},
      select: { id: true },
    });

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        userId,
        quizId: quiz.id,
        score: correctCount,
        totalQ,
        timeTaken: dto.timeTaken ?? 0,
        answers: {
          create: results
            .filter((r) => r.selected !== null)
            .map((r) => ({
              questionId: r.questionId,
              selected: r.selected as string,
              isCorrect: r.isCorrect,
            })),
        },
      },
      select: { id: true },
    });

    return { attemptId: attempt.id, score: correctCount, totalQ, results };
  }

  async getMyAttempts(bankId: string, userId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { quizBankId: bankId },
      select: { id: true },
    });
    if (!quiz) return [];

    return this.prisma.quizAttempt.findMany({
      where: { quizId: quiz.id, userId },
      orderBy: { completedAt: 'desc' },
      select: { id: true, score: true, totalQ: true, completedAt: true },
    });
  }
}
