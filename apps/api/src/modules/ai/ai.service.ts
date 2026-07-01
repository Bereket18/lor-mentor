import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
    await this.prisma.aiContent.upsert({
      where: { materialId },
      create: { materialId, status: 'PENDING', error: null },
      update: { status: 'PENDING', error: null },
    });
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

  /**
   * Re-run AI generation for a PDF material that hasn't completed (e.g. a job
   * that FAILED). Refuses COMPLETED materials so we never clobber existing
   * flashcards/quiz (which would also orphan student attempts/reviews).
   */
  async regenerate(materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, type: true, filePath: true },
    });
    if (!material) throw new NotFoundException('Material not found');
    if (material.type !== 'PDF' || !material.filePath) {
      throw new BadRequestException(
        'AI generation only applies to PDF materials',
      );
    }

    const existing = await this.prisma.aiContent.findUnique({
      where: { materialId },
    });
    if (existing?.status === 'COMPLETED') {
      throw new BadRequestException(
        'AI content has already been generated for this material',
      );
    }
    if (existing) {
      await this.prisma.aiContent.update({
        where: { id: existing.id },
        data: { status: 'PENDING', error: null },
      });
    }

    await this.enqueueGeneration(materialId, material.filePath);
    return { status: 'PENDING' };
  }
}
