import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../../common/types/request-user';
import type {
  ReviewStructureDto,
  ReviewSystemDto,
  UpdateAnatomyStructureDto,
} from './dto/anatomy-review.dto';

const TEXT_FIELDS = [
  'summary',
  'location',
  'function',
  'bloodSupply',
  'clinicalNotes',
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

export type AnatomyReviewStatus = 'empty' | 'draft' | 'pending' | 'reviewed';

interface EditableSnapshot {
  summary: string;
  location: string | null;
  function: string | null;
  bloodSupply: string | null;
  clinicalNotes: string | null;
  references: string[];
  relatedSlugs: string[];
}

const STALE_MESSAGE =
  'This structure changed since you loaded it. Reload the latest version and try again.';

const STRUCTURE_INCLUDE = {
  reviewedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AnatomyStructureInclude;

type StructureWithReviewer = Prisma.AnatomyStructureGetPayload<{
  include: typeof STRUCTURE_INCLUDE;
}>;

type StructureText = Pick<StructureWithReviewer, TextField>;

function isFilled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function missingTextFields(structure: StructureText): TextField[] {
  return TEXT_FIELDS.filter((field) => !isFilled(structure[field]));
}

function statusFor(
  structure: StructureText & { isReviewed: boolean },
): AnatomyReviewStatus {
  if (structure.isReviewed) return 'reviewed';
  const filled = TEXT_FIELDS.filter((field) =>
    isFilled(structure[field]),
  ).length;
  if (filled === 0) return 'empty';
  if (filled < TEXT_FIELDS.length) return 'draft';
  return 'pending';
}

function snapshot(structure: StructureWithReviewer): EditableSnapshot {
  return {
    summary: structure.summary,
    location: structure.location,
    function: structure.function,
    bloodSupply: structure.bloodSupply,
    clinicalNotes: structure.clinicalNotes,
    references: structure.references,
    relatedSlugs: structure.relatedSlugs,
  };
}

function normalizeNullable(value: string): string | null {
  return value.length > 0 ? value : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function serializeStructure(structure: StructureWithReviewer) {
  const { reviewedBy, ...rest } = structure;
  return {
    ...rest,
    status: statusFor(structure),
    reviewedByName: reviewedBy?.fullName ?? null,
  };
}

@Injectable()
export class AnatomyReviewService {
  private readonly logger = new Logger(AnatomyReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // All systems, including drafts, with the four review-state counts the
  // reviewer dashboard shows.
  async listSystems() {
    const systems = await this.prisma.anatomySystem.findMany({
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
        structures: {
          select: {
            summary: true,
            location: true,
            function: true,
            bloodSupply: true,
            clinicalNotes: true,
            isReviewed: true,
          },
        },
      },
    });

    return systems.map(({ structures, ...system }) => {
      const counts = { empty: 0, draft: 0, pending: 0, reviewed: 0 };
      for (const structure of structures) {
        counts[statusFor(structure)] += 1;
      }
      return {
        ...system,
        structureCount: structures.length,
        counts,
      };
    });
  }

  async getSystemStructures(slug: string) {
    const system = await this.prisma.anatomySystem.findUnique({
      where: { slug },
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
      },
    });

    if (!system) {
      throw new NotFoundException('Anatomy system not found');
    }

    const structures = await this.prisma.anatomyStructure.findMany({
      where: { systemId: system.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: STRUCTURE_INCLUDE,
    });

    return {
      ...system,
      structureCount: structures.length,
      structures: structures.map(serializeStructure),
    };
  }

  async updateStructure(
    user: RequestUser,
    id: string,
    dto: UpdateAnatomyStructureDto,
  ) {
    const existing = await this.prisma.anatomyStructure.findUnique({
      where: { id },
      include: {
        ...STRUCTURE_INCLUDE,
        system: { select: { slug: true, name: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Anatomy structure not found');
    }

    const expected = new Date(dto.updatedAt);
    if (existing.updatedAt.getTime() !== expected.getTime()) {
      throw new ConflictException(STALE_MESSAGE);
    }

    const next: EditableSnapshot = {
      summary: dto.summary !== undefined ? dto.summary : existing.summary,
      location:
        dto.location !== undefined
          ? normalizeNullable(dto.location)
          : existing.location,
      function:
        dto.function !== undefined
          ? normalizeNullable(dto.function)
          : existing.function,
      bloodSupply:
        dto.bloodSupply !== undefined
          ? normalizeNullable(dto.bloodSupply)
          : existing.bloodSupply,
      clinicalNotes:
        dto.clinicalNotes !== undefined
          ? normalizeNullable(dto.clinicalNotes)
          : existing.clinicalNotes,
      references:
        dto.references !== undefined
          ? unique(dto.references)
          : existing.references,
      relatedSlugs:
        dto.relatedSlugs !== undefined
          ? unique(dto.relatedSlugs)
          : existing.relatedSlugs,
    };

    if (dto.relatedSlugs !== undefined) {
      await this.assertRelatedSlugs(
        existing.systemId,
        next.relatedSlugs,
        existing.slug,
      );
    }

    const previous = snapshot(existing);
    const changed = JSON.stringify(previous) !== JSON.stringify(next);
    // Unchecked variant: reviewedById is a relation scalar, so it is only
    // exposed on the unchecked input type.
    const data: Prisma.AnatomyStructureUncheckedUpdateManyInput = { ...next };

    // Editing a reviewed row sends it back to pending review. A no-op save
    // leaves the approval intact.
    if (changed && existing.isReviewed) {
      data.isReviewed = false;
      data.reviewedAt = null;
      data.reviewedById = null;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // updateMany with the loaded updatedAt is the concurrency guard: if
      // another editor saved first, no row matches and the request gets 409.
      const update = await tx.anatomyStructure.updateMany({
        where: { id, updatedAt: expected },
        data,
      });
      if (update.count === 0) {
        throw new ConflictException(STALE_MESSAGE);
      }

      const revision = await tx.anatomyStructureRevision.create({
        data: {
          structureId: id,
          editorId: user.id,
          previous: previous as unknown as Prisma.InputJsonValue,
          new: next as unknown as Prisma.InputJsonValue,
          note: dto.note ?? null,
        },
      });

      const structure = await tx.anatomyStructure.findUniqueOrThrow({
        where: { id },
        include: STRUCTURE_INCLUDE,
      });

      return { structure, revisionId: revision.id };
    });

    await this.recordAudit({
      action: 'ANATOMY_STRUCTURE_UPDATE',
      actorId: user.id,
      entityType: 'AnatomyStructure',
      entityId: id,
      meta: {
        systemSlug: existing.system.slug,
        structureSlug: existing.slug,
        revisionId: result.revisionId,
        changed,
        clearedReview: changed && existing.isReviewed,
      },
    });

    return {
      ...serializeStructure(result.structure),
      revisionId: result.revisionId,
      changed,
    };
  }

  async reviewStructure(
    user: RequestUser,
    id: string,
    dto: ReviewStructureDto,
  ) {
    const existing = await this.prisma.anatomyStructure.findUnique({
      where: { id },
      include: {
        ...STRUCTURE_INCLUDE,
        system: { select: { slug: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Anatomy structure not found');
    }

    const expected = dto.updatedAt ? new Date(dto.updatedAt) : null;
    if (expected && existing.updatedAt.getTime() !== expected.getTime()) {
      throw new ConflictException(STALE_MESSAGE);
    }

    const missing = missingTextFields(existing);
    if (missing.length > 0) {
      throw new ConflictException(
        `Cannot mark reviewed: fill in ${missing.join(', ')} first.`,
      );
    }

    if (existing.isReviewed) {
      return { ...serializeStructure(existing), alreadyReviewed: true };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const update = await tx.anatomyStructure.updateMany({
        where: expected ? { id, updatedAt: expected } : { id },
        data: {
          isReviewed: true,
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
      });
      if (update.count === 0) {
        if (expected) throw new ConflictException(STALE_MESSAGE);
        throw new NotFoundException('Anatomy structure not found');
      }
      return tx.anatomyStructure.findUniqueOrThrow({
        where: { id },
        include: STRUCTURE_INCLUDE,
      });
    });

    await this.recordAudit({
      action: 'ANATOMY_STRUCTURE_REVIEW',
      actorId: user.id,
      entityType: 'AnatomyStructure',
      entityId: id,
      meta: {
        systemSlug: existing.system.slug,
        structureSlug: existing.slug,
        note: dto.note ?? null,
      },
    });

    return { ...serializeStructure(updated), alreadyReviewed: false };
  }

  async reviewSystem(user: RequestUser, slug: string, dto: ReviewSystemDto) {
    const system = await this.prisma.anatomySystem.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        structures: {
          select: {
            id: true,
            slug: true,
            summary: true,
            location: true,
            function: true,
            bloodSupply: true,
            clinicalNotes: true,
            isReviewed: true,
          },
        },
      },
    });

    if (!system) {
      throw new NotFoundException('Anatomy system not found');
    }

    if (system.structures.length === 0) {
      throw new ConflictException('Cannot review a system with no structures.');
    }

    const incomplete = system.structures.filter(
      (structure) => missingTextFields(structure).length > 0,
    );
    if (incomplete.length > 0) {
      const sample = incomplete
        .slice(0, 5)
        .map((structure) => structure.slug)
        .join(', ');
      const suffix = incomplete.length > 5 ? ', ...' : '';
      throw new ConflictException(
        `Cannot mark the system reviewed: ${incomplete.length} structure(s) still need teaching text (${sample}${suffix}).`,
      );
    }

    const unreviewedIds = system.structures
      .filter((structure) => !structure.isReviewed)
      .map((structure) => structure.id);

    if (unreviewedIds.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.anatomyStructure.updateMany({
          where: { id: { in: unreviewedIds } },
          data: {
            isReviewed: true,
            reviewedAt: new Date(),
            reviewedById: user.id,
          },
        });
      });
    }

    await this.recordAudit({
      action: 'ANATOMY_SYSTEM_REVIEW',
      actorId: user.id,
      entityType: 'AnatomySystem',
      entityId: system.id,
      meta: {
        systemSlug: system.slug,
        structureCount: system.structures.length,
        updatedCount: unreviewedIds.length,
        note: dto.note ?? null,
      },
    });

    return {
      systemSlug: system.slug,
      structureCount: system.structures.length,
      updatedCount: unreviewedIds.length,
    };
  }

  async revokeStructure(
    user: RequestUser,
    id: string,
    dto: ReviewStructureDto,
  ) {
    const existing = await this.prisma.anatomyStructure.findUnique({
      where: { id },
      include: {
        ...STRUCTURE_INCLUDE,
        system: { select: { slug: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Anatomy structure not found');
    }

    if (!existing.isReviewed) {
      return { ...serializeStructure(existing), alreadyRevoked: true };
    }

    const updated = await this.prisma.anatomyStructure.update({
      where: { id },
      data: { isReviewed: false, reviewedAt: null, reviewedById: null },
      include: STRUCTURE_INCLUDE,
    });

    await this.recordAudit({
      action: 'ANATOMY_STRUCTURE_REVOKE',
      actorId: user.id,
      entityType: 'AnatomyStructure',
      entityId: id,
      meta: {
        systemSlug: existing.system.slug,
        structureSlug: existing.slug,
        note: dto.note ?? null,
      },
    });

    return { ...serializeStructure(updated), alreadyRevoked: false };
  }

  async listRevisions(id: string) {
    const structure = await this.prisma.anatomyStructure.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!structure) {
      throw new NotFoundException('Anatomy structure not found');
    }

    const revisions = await this.prisma.anatomyStructureRevision.findMany({
      where: { structureId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { editor: { select: { id: true, fullName: true } } },
    });

    return revisions.map((revision) => ({
      id: revision.id,
      structureId: revision.structureId,
      editorId: revision.editorId,
      editorName: revision.editor.fullName,
      createdAt: revision.createdAt,
      previous: revision.previous,
      new: revision.new,
      note: revision.note,
    }));
  }

  private async assertRelatedSlugs(
    systemId: string,
    slugs: string[],
    selfSlug: string,
  ) {
    if (slugs.includes(selfSlug)) {
      throw new BadRequestException(
        'A structure cannot list itself as a related structure.',
      );
    }

    if (slugs.length === 0) return;

    const found = await this.prisma.anatomyStructure.findMany({
      where: { systemId, slug: { in: slugs } },
      select: { slug: true },
    });
    const foundSlugs = new Set(found.map((structure) => structure.slug));
    const missing = slugs.filter((slug) => !foundSlugs.has(slug));

    if (missing.length > 0) {
      throw new BadRequestException(
        `relatedSlugs must reference existing structures in this system: ${missing.join(', ')}`,
      );
    }
  }

  // Revisions are the durable edit history; the shared audit log is a
  // secondary trail. A failed audit write is logged but must not turn a
  // successful save into a 500.
  private async recordAudit(entry: {
    action: string;
    actorId: string;
    entityType: string;
    entityId: string;
    meta: Prisma.InputJsonValue;
  }) {
    try {
      await this.audit.record(entry);
    } catch (error) {
      this.logger.error(
        `Could not write anatomy audit entry ${entry.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
