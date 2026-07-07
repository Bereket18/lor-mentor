import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../ai/gemini.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ChatDto } from './dto/chat.dto';

import type { RequestUser } from '../../common/types/request-user';

interface MaterialContext {
  title: string;
  summary?: string | null;
  keyTopics?: unknown;
}

@Injectable()
export class TutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  // Answer a question, grounding on the course/material AI content when a
  // scope is given, then persist the exchange to AiHistory.
  async chat(user: RequestUser, dto: ChatDto) {
    // The AI tutor is a paid feature — a free (unsubscribed) student must not
    // be able to run up the Gemini bill. Staff bypass this check.
    await this.subscriptions.ensureActiveForStudent(user.id, user.role);

    const context = await this.buildContext(dto.courseId, dto.materialId);
    const answer = await this.gemini.answerQuestion(dto.message, context);

    await this.prisma.aiHistory.create({
      data: {
        userId: user.id,
        courseId: dto.courseId ?? null,
        materialId: dto.materialId ?? null,
        prompt: dto.message,
        response: answer,
      },
    });

    return { answer };
  }

  async getHistory(userId: string) {
    return this.prisma.aiHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        prompt: true,
        response: true,
        createdAt: true,
        courseId: true,
        materialId: true,
      },
    });
  }

  // Gather AI summaries + key topics for the requested scope into a single
  // text blob the model can reference. Falls back to course-wide if only a
  // courseId is given, or empty (general knowledge) if no scope.
  private async buildContext(
    courseId?: string,
    materialId?: string,
  ): Promise<string> {
    if (materialId) {
      const ai = await this.prisma.aiContent.findUnique({
        where: { materialId },
        select: {
          summary: true,
          keyTopics: true,
          material: { select: { title: true } },
        },
      });
      if (ai) {
        return this.format([
          { title: ai.material.title, summary: ai.summary, keyTopics: ai.keyTopics },
        ]);
      }
    }

    if (courseId) {
      const materials = await this.prisma.material.findMany({
        where: { courseId, aiContent: { isNot: null } },
        take: 10,
        select: {
          title: true,
          aiContent: { select: { summary: true, keyTopics: true } },
        },
      });
      return this.format(
        materials.map((m) => ({
          title: m.title,
          summary: m.aiContent?.summary,
          keyTopics: m.aiContent?.keyTopics,
        })),
      );
    }

    return '';
  }

  private format(items: MaterialContext[]): string {
    return items
      .filter((i) => i.summary || i.keyTopics)
      .map((i) => {
        const topics = Array.isArray(i.keyTopics)
          ? (i.keyTopics as string[]).join(', ')
          : '';
        return [
          `# ${i.title}`,
          i.summary ? i.summary : '',
          topics ? `Key topics: ${topics}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
  }
}
