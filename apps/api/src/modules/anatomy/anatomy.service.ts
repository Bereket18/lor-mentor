import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../ai/gemini.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ExplainStructureDto } from './dto/explain-structure.dto';

import type { RequestUser } from '../../common/types/request-user';
import type { AnatomyStructureContext } from '../ai/gemini.service';

interface AnatomySystemNotes {
  name: string;
}

interface AnatomyStructureNotes {
  name: string;
  latinName: string | null;
  summary: string;
  location: string | null;
  function: string | null;
  bloodSupply: string | null;
  clinicalNotes: string | null;
}

@Injectable()
export class AnatomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly gemini: GeminiService,
  ) {}

  // The picker only needs metadata, never the protected structure text.
  async listSystems() {
    const systems = await this.prisma.anatomySystem.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        latinName: true,
        description: true,
        modelUrl: true,
        isSample: true,
        sortOrder: true,
        _count: { select: { structures: true } },
      },
    });

    return systems.map(({ _count, ...system }) => ({
      ...system,
      structureCount: _count.structures,
    }));
  }

  // The subscription check belongs here, not only in a controller guard: a
  // sample system must remain accessible to unsubscribed students, while a
  // normal system must not leak its structure text.
  async getSystem(user: RequestUser, slug: string) {
    // Load only system metadata first. Structure text must not be fetched
    // until the caller has passed both the publication and access checks.
    const system = await this.prisma.anatomySystem.findUnique({
      where: { slug },
    });

    if (!system || !system.isPublished) {
      throw new NotFoundException('Anatomy system not found');
    }

    if (!system.isSample) {
      await this.subscriptions.ensureActiveForStudent(user.id, user.role);
    }

    const systemStructures = await this.prisma.anatomyStructure.findMany({
      where: { systemId: system.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Related structures are stored as slugs so the seed stays readable and
    // does not need to know generated ids. Resolve names in one pass, and drop
    // any stale slug instead of failing the whole system.
    const bySlug = new Map(
      systemStructures.map((structure) => [structure.slug, structure]),
    );
    const structures = systemStructures.map((structure) => ({
      ...structure,
      related: structure.relatedSlugs.flatMap((relatedSlug) => {
        const related = bySlug.get(relatedSlug);
        return related ? [{ slug: related.slug, name: related.name }] : [];
      }),
    }));

    return {
      ...system,
      structureCount: structures.length,
      structures,
    };
  }

  // AI study tools are intentionally paid even for the free sample system:
  // every call spends Gemini quota, and the sample preview itself stays open.
  async explainStructure(
    user: RequestUser,
    systemSlug: string,
    structureSlug: string,
    dto: ExplainStructureDto,
  ) {
    const { system, structure } = await this.findStructureForAi(
      user,
      systemSlug,
      structureSlug,
    );
    const explanation = await this.gemini.explainAnatomyStructure(
      this.toAiContext(system, structure, dto.question),
    );

    return { explanation };
  }

  async generateStructureQuiz(
    user: RequestUser,
    systemSlug: string,
    structureSlug: string,
  ) {
    const { system, structure } = await this.findStructureForAi(
      user,
      systemSlug,
      structureSlug,
    );
    const quiz = await this.gemini.generateAnatomyQuiz(
      this.toAiContext(system, structure),
    );

    return {
      system: { slug: system.slug, name: system.name },
      structure: {
        slug: structure.slug,
        name: structure.name,
        latinName: structure.latinName,
      },
      questions: quiz.questions,
    };
  }

  private async findStructureForAi(
    user: RequestUser,
    systemSlug: string,
    structureSlug: string,
  ) {
    const system = await this.prisma.anatomySystem.findUnique({
      where: { slug: systemSlug },
    });

    if (!system || !system.isPublished) {
      throw new NotFoundException('Anatomy system not found');
    }

    // Check access before loading structure text, matching the detail route.
    await this.subscriptions.ensureActiveForStudent(user.id, user.role);

    const structure = await this.prisma.anatomyStructure.findFirst({
      where: { systemId: system.id, slug: structureSlug },
    });

    if (!structure) {
      throw new NotFoundException('Anatomy structure not found');
    }

    return { system, structure };
  }

  private toAiContext(
    system: AnatomySystemNotes,
    structure: AnatomyStructureNotes,
    question?: string,
  ): AnatomyStructureContext {
    return {
      systemName: system.name,
      structureName: structure.name,
      latinName: structure.latinName ?? 'Not recorded',
      summary: structure.summary,
      location: structure.location ?? 'Not recorded in the verified notes.',
      function: structure.function ?? 'Not recorded in the verified notes.',
      bloodSupply:
        structure.bloodSupply ?? 'Not recorded in the verified notes.',
      clinicalNotes:
        structure.clinicalNotes ?? 'Not recorded in the verified notes.',
      question: question?.trim() || undefined,
    };
  }
}
