import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AiGenerationJobData } from './ai.processor';

@Injectable()
export class AiService {
  constructor(
    @InjectQueue('ai-generation')
    private readonly queue: Queue<AiGenerationJobData>,
    private readonly prisma: PrismaService,
  ) {}

  // Called by MaterialsService right after a PDF upload succeeds.
  // This returns almost instantly — adding a job to the queue is
  // fast; the actual AI work happens later, in AiProcessor.
  async enqueueGeneration(materialId: string, filename: string) {
    await this.queue.add('generate', { materialId, filename });
  }

  // Used by the frontend to check generation status for a material
  async getStatus(materialId: string) {
    const aiContent = await this.prisma.aiContent.findUnique({
      where: { materialId },
      include: {
        flashcardSet: { include: { cards: true } },
        quizBank: { include: { questions: true } },
      },
    });

    if (!aiContent) {
      return { status: 'NOT_STARTED' };
    }

    return aiContent;
  }
}
