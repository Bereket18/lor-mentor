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
import { NotificationsService } from '../notifications/notifications.service';
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

function changedFieldNames(
  previous: EditableSnapshot,
  next: EditableSnapshot,
): string[] {
  return (Object.keys(previous) as (keyof EditableSnapshot)[]).filter(
    (field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
  );
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
    private readonly notifications: NotificationsService,
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
        action: 'edit',
        systemSlug: existing.system.slug,
        systemName: existing.system.name,
        structureId: id,
        structureSlug: existing.slug,
        structureName: existing.name,
        revisionId: result.revisionId,
        changed,
        changedFields: changed ? changedFieldNames(previous, next) : [],
        clearedReview: changed && existing.isReviewed,
        note: dto.note ?? null,
      },
    });

    if (changed) {
      await this.notifyAnatomyChange({
        excludeUserId: user.id,
        includeStudents: false,
        action: 'edit',
        title: `Anatomy edit: ${existing.name}`,
        message: `${user.fullName} updated ${existing.name} in ${existing.system.name}. Faculty review is pending.`,
        systemSlug: existing.system.slug,
        systemName: existing.system.name,
        structureId: id,
        structureSlug: existing.slug,
        structureName: existing.name,
      });
    }

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
        system: { select: { slug: true, name: true, isPublished: true } },
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
        action: 'review',
        systemSlug: existing.system.slug,
        systemName: existing.system.name,
        structureId: id,
        structureSlug: existing.slug,
        structureName: existing.name,
        reviewedAt: updated.reviewedAt,
        note: dto.note ?? null,
      },
    });

    await this.notifyAnatomyChange({
      excludeUserId: user.id,
      includeStudents: existing.system.isPublished,
      action: 'review',
      title: `Anatomy reviewed: ${existing.name}`,
      message: `${user.fullName} reviewed ${existing.name} in ${existing.system.name}.`,
      systemSlug: existing.system.slug,
      systemName: existing.system.name,
      structureId: id,
      structureSlug: existing.slug,
      structureName: existing.name,
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
        isPublished: true,
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
        action: 'review-system',
        systemId: system.id,
        systemSlug: system.slug,
        systemName: system.name,
        structureCount: system.structures.length,
        updatedCount: unreviewedIds.length,
        note: dto.note ?? null,
      },
    });

    if (unreviewedIds.length > 0) {
      await this.notifyAnatomyChange({
        excludeUserId: user.id,
        includeStudents: system.isPublished,
        action: 'review-system',
        title: `Anatomy reviewed: ${system.name}`,
        message: `${user.fullName} reviewed ${unreviewedIds.length} structure(s) in ${system.name}.`,
        systemSlug: system.slug,
        systemName: system.name,
      });
    }

    return {
      systemSlug: system.slug,
      structureCount: system.structures.length,
      updatedCount: unreviewedIds.length,
    };
  }

  // Publish a system so students can see it. Reviewer-only (the controller
  // already enforces TEACHER + the reviewer flag). The gate mirrors the offline
  // CLI's database checks: the system has structures, every structure has
  // non-empty teaching text, and every structure is faculty reviewed. The CLI's
  // extra requirement of an owner-reviewed mapping document stays a
  // terminal-only governance step the API cannot verify.
  async publishSystem(user: RequestUser, slug: string, dto: ReviewSystemDto) {
    const system = await this.prisma.anatomySystem.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        isPublished: true,
        structures: {
          select: {
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

    // Idempotent: publishing an already-published system changes nothing.
    if (system.isPublished) {
      return {
        systemSlug: system.slug,
        systemName: system.name,
        structureCount: system.structures.length,
        isPublished: true,
        changed: false,
      };
    }

    if (system.structures.length === 0) {
      throw new ConflictException('Cannot publish a system with no structures.');
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
        `Cannot publish: ${incomplete.length} structure(s) still need teaching text (${sample}${suffix}).`,
      );
    }

    const unreviewed = system.structures.filter(
      (structure) => !structure.isReviewed,
    );
    if (unreviewed.length > 0) {
      const sample = unreviewed
        .slice(0, 5)
        .map((structure) => structure.slug)
        .join(', ');
      const suffix = unreviewed.length > 5 ? ', ...' : '';
      throw new ConflictException(
        `Cannot publish: ${unreviewed.length} structure(s) are not faculty reviewed (${sample}${suffix}).`,
      );
    }

    await this.prisma.anatomySystem.update({
      where: { id: system.id },
      data: { isPublished: true },
    });

    await this.recordAudit({
      action: 'ANATOMY_SYSTEM_PUBLISH',
      actorId: user.id,
      entityType: 'AnatomySystem',
      entityId: system.id,
      meta: {
        action: 'publish',
        systemId: system.id,
        systemSlug: system.slug,
        systemName: system.name,
        structureCount: system.structures.length,
        note: dto.note ?? null,
      },
    });

    // Publishing is the moment content becomes visible to students, so they are
    // notified too (unlike edit/review on unpublished drafts).
    await this.notifyAnatomyChange({
      excludeUserId: user.id,
      includeStudents: true,
      action: 'publish',
      title: `Anatomy published: ${system.name}`,
      message: `${user.fullName} published ${system.name} to students.`,
      systemSlug: system.slug,
      systemName: system.name,
    });

    return {
      systemSlug: system.slug,
      systemName: system.name,
      structureCount: system.structures.length,
      isPublished: true,
      changed: true,
    };
  }

  // Return a published system to draft so students stop seeing it. No gate:
  // withdrawing content is always allowed for a reviewer.
  async unpublishSystem(user: RequestUser, slug: string, dto: ReviewSystemDto) {
    const system = await this.prisma.anatomySystem.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, isPublished: true },
    });

    if (!system) {
      throw new NotFoundException('Anatomy system not found');
    }

    // Idempotent: nothing to do when it is already a draft.
    if (!system.isPublished) {
      return {
        systemSlug: system.slug,
        systemName: system.name,
        isPublished: false,
        changed: false,
      };
    }

    await this.prisma.anatomySystem.update({
      where: { id: system.id },
      data: { isPublished: false },
    });

    await this.recordAudit({
      action: 'ANATOMY_SYSTEM_UNPUBLISH',
      actorId: user.id,
      entityType: 'AnatomySystem',
      entityId: system.id,
      meta: {
        action: 'unpublish',
        systemId: system.id,
        systemSlug: system.slug,
        systemName: system.name,
        note: dto.note ?? null,
      },
    });

    // Students were told when it was published; tell the reviewers it is gone.
    await this.notifyAnatomyChange({
      excludeUserId: user.id,
      includeStudents: false,
      action: 'unpublish',
      title: `Anatomy unpublished: ${system.name}`,
      message: `${user.fullName} returned ${system.name} to draft. Students can no longer see it.`,
      systemSlug: system.slug,
      systemName: system.name,
    });

    return {
      systemSlug: system.slug,
      systemName: system.name,
      isPublished: false,
      changed: true,
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
        system: { select: { slug: true, name: true, isPublished: true } },
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
        action: 'revoke',
        systemSlug: existing.system.slug,
        systemName: existing.system.name,
        structureId: id,
        structureSlug: existing.slug,
        structureName: existing.name,
        note: dto.note ?? null,
      },
    });

    await this.notifyAnatomyChange({
      excludeUserId: user.id,
      includeStudents: false,
      action: 'revoke',
      title: `Anatomy review revoked: ${existing.name}`,
      message: `${user.fullName} revoked faculty review for ${existing.name} in ${existing.system.name}.`,
      systemSlug: existing.system.slug,
      systemName: existing.system.name,
      structureId: id,
      structureSlug: existing.slug,
      structureName: existing.name,
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

  // In-app notices are best-effort: a notification failure must never make a
  // successful edit/review return an error. Students only hear about content
  // that has actually been reviewed and is published.
  private async notifyAnatomyChange(input: {
    excludeUserId: string;
    includeStudents: boolean;
    action:
      | 'edit'
      | 'review'
      | 'review-system'
      | 'revoke'
      | 'publish'
      | 'unpublish';
    title: string;
    message: string;
    systemSlug: string;
    systemName: string;
    structureId?: string;
    structureSlug?: string;
    structureName?: string;
  }) {
    try {
      const [teachers, students] = await Promise.all([
        this.prisma.user.findMany({
          where: {
            role: 'TEACHER',
            isAnatomyReviewer: true,
            isActive: true,
            id: { not: input.excludeUserId },
          },
          select: { id: true },
        }),
        input.includeStudents
          ? this.prisma.user.findMany({
              where: { role: 'STUDENT', isActive: true },
              select: { id: true },
            })
          : Promise.resolve([] as Array<{ id: string }>),
      ]);

      const userIds = [...teachers, ...students].map((row) => row.id);
      await this.notifications.notifyUsers({
        userIds,
        title: input.title,
        message: input.message,
        meta: {
          action: input.action,
          href: `/anatomy/${input.systemSlug}`,
          systemSlug: input.systemSlug,
          systemName: input.systemName,
          ...(input.structureId ? { structureId: input.structureId } : {}),
          ...(input.structureSlug ? { structureSlug: input.structureSlug } : {}),
          ...(input.structureName
            ? { structureName: input.structureName }
            : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not create anatomy notification ${input.title}`,
        error instanceof Error ? error.stack : String(error),
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
