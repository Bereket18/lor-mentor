import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

// Only teachers need to preview unpublished systems. Students must never see
// them, even if the system is a free sample, and the Anatomy Lab is not part of
// the admin surface.
const STAFF_PREVIEW_ROLES = new Set(['TEACHER']);

function canPreviewUnpublished(user: RequestUser): boolean {
  return STAFF_PREVIEW_ROLES.has(user.role);
}

@Injectable()
export class AnatomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly gemini: GeminiService,
  ) {}

  // The picker only needs metadata, never the protected structure text.
  // Students only receive published systems; teachers also receive drafts so
  // they can preview work before an explicit publish decision.
  async listSystems(user: RequestUser) {
    const systems = await this.prisma.anatomySystem.findMany({
      where: canPreviewUnpublished(user) ? {} : { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        latinName: true,
        description: true,
        modelUrl: true,
        isSample: true,
        isPublished: true,
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

    if (!system || (!system.isPublished && !canPreviewUnpublished(user))) {
      throw new NotFoundException('Anatomy system not found');
    }

    if (!system.isSample) {
      await this.subscriptions.ensureActiveForStudent(user.id, user.role);
    }

    const systemStructures = await this.prisma.anatomyStructure.findMany({
      where: { systemId: system.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        reviewedBy: { select: { fullName: true } },
        // The latest revision is the durable record of who last changed the
        // teaching text. Revisions are append-only, so "latest" is reliable
        // even after a review is cleared or restored.
        revisions: {
          where: { kind: 'edit' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            createdAt: true,
            editor: { select: { fullName: true } },
          },
        },
      },
    });

    // Related structures are stored as slugs so the seed stays readable and
    // does not need to know generated ids. Resolve names in one pass, and drop
    // any stale slug instead of failing the whole system.
    const bySlug = new Map(
      systemStructures.map((structure) => [structure.slug, structure]),
    );
    const structures = systemStructures.map(
      ({ reviewedBy, revisions, ...structure }) => {
        const lastRevision = revisions?.[0] ?? null;
        return {
          ...structure,
          // Expose only the reviewer's display name, never their email or id.
          reviewedByName: reviewedBy?.fullName ?? null,
          lastEditedByName: lastRevision?.editor.fullName ?? null,
          lastEditedAt: lastRevision?.createdAt ?? null,
          related: structure.relatedSlugs.flatMap((relatedSlug) => {
            const related = bySlug.get(relatedSlug);
            return related ? [{ slug: related.slug, name: related.name }] : [];
          }),
        };
      },
    );

    // The student/teacher lab surface does not need the administrator's user
    // id; approval is an administrative concern. Publication state already
    // tells the lab whether students can see the system.
    const {
      publicationApprovedById: _publicationApprovedById,
      ...systemMeta
    } = system;

    return {
      ...systemMeta,
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

    // The Step 3 systems are seeded with empty teaching text until faculty
    // review. Do not spend Gemini quota or invent notes from the structure
    // name: refuse both AI tools for a row that has no verified text.
    const hasTeachingText = [
      structure.summary,
      structure.location,
      structure.function,
      structure.bloodSupply,
      structure.clinicalNotes,
    ].some((value) => typeof value === 'string' && value.trim().length > 0);
    if (!hasTeachingText) {
      throw new ConflictException(
        'Teaching notes are not available for this structure yet.',
      );
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
