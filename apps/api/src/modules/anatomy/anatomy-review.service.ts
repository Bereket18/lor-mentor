import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  ReviewSettingsDto,
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

const SETTINGS_ID = 'global';

const EDIT_REVISION = 'edit';
const SIGN_OFF_REVISION = 'sign-off';
const SIGN_OFF_INVALIDATED_REVISION = 'sign-off-invalidated';
const REVIEW_REVOKED_REVISION = 'review-revoked';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

const SECOND_REVIEWER_MESSAGE =
  'A different designated reviewer must sign this structure off because you were the last person to edit it.';

const STALE_MESSAGE =
  'This structure changed since you loaded it. Reload the latest version and try again.';

interface EditableSnapshot {
  summary: string;
  location: string | null;
  function: string | null;
  bloodSupply: string | null;
  clinicalNotes: string | null;
  references: string[];
  relatedSlugs: string[];
}

const STRUCTURE_INCLUDE = {
  reviewedBy: { select: { id: true, fullName: true } },
  // Only content edits determine "who last edited". Sign-off and invalidation
  // rows are review events, so they are excluded here.
  revisions: {
    where: { kind: EDIT_REVISION },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { editorId: true, createdAt: true },
  },
} satisfies Prisma.AnatomyStructureInclude;

type StructureWithReviewer = Prisma.AnatomyStructureGetPayload<{
  include: typeof STRUCTURE_INCLUDE;
}>;

type StructureText = Pick<StructureWithReviewer, TextField>;

type TransactionClient = Prisma.TransactionClient;

// Minimal surface shared by PrismaService and a transaction client, so the
// second-reviewer check can run both before and inside the lock.
type RevisionClient = {
  anatomyStructureRevision: {
    findMany: PrismaService['anatomyStructureRevision']['findMany'];
  };
};

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

function sampleSlugs(structures: Array<{ slug: string }>): string {
  const sample = structures
    .slice(0, 5)
    .map((structure) => structure.slug)
    .join(', ');
  return structures.length > 5 ? `${sample}, ...` : sample;
}

function serializeStructure(
  structure: StructureWithReviewer,
  options: { requireSecondReviewer?: boolean; userId?: string } = {},
) {
  const { reviewedBy, revisions, ...rest } = structure;
  const lastEdit = revisions?.[0] ?? null;
  const lastEditedById = lastEdit?.editorId ?? null;
  const requireSecondReviewer = options.requireSecondReviewer === true;
  const signOffBlockedBySecondReviewer =
    requireSecondReviewer &&
    options.userId !== undefined &&
    lastEditedById === options.userId;

  return {
    ...rest,
    status: statusFor(structure),
    reviewedByName: reviewedBy?.fullName ?? null,
    lastEditedById,
    lastEditedAt: lastEdit?.createdAt ?? null,
    signOffBlockedBySecondReviewer,
  };
}

function assertActiveAccount(user: RequestUser) {
  if (!user.isActive) {
    throw new ForbiddenException(
      'Your account is inactive. Contact an administrator.',
    );
  }
}

@Injectable()
export class AnatomyReviewService {
  private readonly logger = new Logger(AnatomyReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Authorization helpers ────────────────────────────────────────────────
  // Controllers add the role and reviewer guards, but the service repeats the
  // checks so any future caller (script, admin route, queue worker) cannot
  // bypass them by skipping the HTTP layer.

  private assertReviewer(user: RequestUser) {
    assertActiveAccount(user);
    if (user.role !== 'TEACHER' || user.isAnatomyReviewer !== true) {
      throw new ForbiddenException(
        'Anatomy sign-off is restricted to approved faculty reviewers.',
      );
    }
  }

  private assertAdmin(user: RequestUser) {
    assertActiveAccount(user);
    if (!ADMIN_ROLES.has(user.role)) {
      throw new ForbiddenException(
        'Anatomy publication approval is restricted to administrators.',
      );
    }
  }

  private async requireSecondReviewer(): Promise<boolean> {
    const settings = await this.prisma.anatomyReviewSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { requireSecondReviewer: true },
    });
    return settings?.requireSecondReviewer === true;
  }

  async getSettings() {
    const settings = await this.prisma.anatomyReviewSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { requireSecondReviewer: true, updatedAt: true },
    });
    return {
      requireSecondReviewer: settings?.requireSecondReviewer ?? false,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  async updateSettings(user: RequestUser, dto: ReviewSettingsDto) {
    this.assertAdmin(user);
    const settings = await this.prisma.anatomyReviewSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        requireSecondReviewer: dto.requireSecondReviewer,
        updatedById: user.id,
      },
      update: {
        requireSecondReviewer: dto.requireSecondReviewer,
        updatedById: user.id,
      },
      select: { requireSecondReviewer: true, updatedAt: true },
    });

    await this.recordAudit({
      action: 'ANATOMY_SETTINGS_UPDATE',
      actorId: user.id,
      entityType: 'AnatomyReviewSettings',
      entityId: SETTINGS_ID,
      meta: {
        requireSecondReviewer: settings.requireSecondReviewer,
      },
    });

    return settings;
  }

  // ── Review library ───────────────────────────────────────────────────────

  // All systems, including drafts, with the four review-state counts the
  // reviewer dashboard shows and the administrator approval state.
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
        contentRevision: true,
        publicationApprovedAt: true,
        publicationApprovedById: true,
        publicationApprovedRevision: true,
        publicationApprovedBy: { select: { fullName: true } },
        structures: {
          select: {
            summary: true,
            location: true,
            function: true,
            bloodSupply: true,
            clinicalNotes: true,
            isReviewed: true,
            reviewedRevisionId: true,
          },
        },
      },
    });

    return systems.map(({ structures, publicationApprovedBy, ...system }) => {
      const counts = { empty: 0, draft: 0, pending: 0, reviewed: 0 };
      let signedOff = 0;
      for (const structure of structures) {
        counts[statusFor(structure)] += 1;
        if (structure.isReviewed && structure.reviewedRevisionId) {
          signedOff += 1;
        }
      }
      return {
        ...system,
        publicationApprovedByName: publicationApprovedBy?.fullName ?? null,
        structureCount: structures.length,
        signedOffCount: signedOff,
        unsignedStructures: structures
          .map((structure, index) => ({ structure, index }))
          .filter(
            ({ structure }) =>
              !structure.isReviewed || !structure.reviewedRevisionId,
          )
          .map(({ index }) => index),
        counts,
      };
    });
  }

  async getSystemStructures(slug: string, user?: RequestUser) {
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
        contentRevision: true,
        publicationApprovedAt: true,
        publicationApprovedById: true,
        publicationApprovedRevision: true,
        publicationApprovedBy: { select: { fullName: true } },
      },
    });

    if (!system) {
      throw new NotFoundException('Anatomy system not found');
    }

    const [structures, requireSecondReviewer] = await Promise.all([
      this.prisma.anatomyStructure.findMany({
        where: { systemId: system.id },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: STRUCTURE_INCLUDE,
      }),
      this.requireSecondReviewer(),
    ]);

    const { publicationApprovedBy, ...systemMeta } = system;

    return {
      ...systemMeta,
      publicationApprovedByName: publicationApprovedBy?.fullName ?? null,
      requireSecondReviewer,
      structureCount: structures.length,
      structures: structures.map((structure) =>
        serializeStructure(structure, {
          requireSecondReviewer,
          userId: user?.id,
        }),
      ),
    };
  }

  // ── Editing (ordinary teachers) ──────────────────────────────────────────

  async updateStructure(
    user: RequestUser,
    id: string,
    dto: UpdateAnatomyStructureDto,
  ) {
    assertActiveAccount(user);

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
    const previousWasReviewed = existing.isReviewed;

    // Unchecked variant: reviewedById is a relation scalar, so it is only
    // exposed on the unchecked input type.
    const data: Prisma.AnatomyStructureUncheckedUpdateManyInput = { ...next };

    // Editing signed-off text invalidates the sign-off. A no-op save leaves the
    // approval intact.
    if (changed) {
      data.isReviewed = false;
      data.reviewedAt = null;
      data.reviewedById = null;
      data.reviewedRevisionId = null;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize edits against publication/approval. Both paths lock the
      // parent system row, so a publish cannot commit between an edit's
      // content write and its approval invalidation.
      await this.lockSystem(tx, existing.systemId);

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
          kind: EDIT_REVISION,
        },
      });

      let invalidationRevisionId: string | null = null;
      if (changed && previousWasReviewed) {
        // Durable evidence that the previous sign-off was invalidated by this
        // exact edit, in the same transaction as the content change.
        const invalidation = await tx.anatomyStructureRevision.create({
          data: {
            structureId: id,
            editorId: user.id,
            previous: previous as unknown as Prisma.InputJsonValue,
            new: next as unknown as Prisma.InputJsonValue,
            note: dto.note ?? null,
            kind: SIGN_OFF_INVALIDATED_REVISION,
          },
        });
        invalidationRevisionId = invalidation.id;
      }

      let systemUnpublished = false;
      if (changed) {
        // Any content change makes an existing administrator approval stale.
        // Editing signed-off content also withdraws the system from students.
        const systemUpdate = await tx.anatomySystem.update({
          where: { id: existing.systemId },
          data: {
            contentRevision: { increment: 1 },
            publicationApprovedAt: null,
            publicationApprovedById: null,
            publicationApprovedRevision: null,
            ...(previousWasReviewed ? { isPublished: false } : {}),
          },
          select: { isPublished: true },
        });
        systemUnpublished =
          previousWasReviewed && systemUpdate.isPublished === false;
      }

      const structure = await tx.anatomyStructure.findUniqueOrThrow({
        where: { id },
        include: STRUCTURE_INCLUDE,
      });

      return {
        structure,
        revisionId: revision.id,
        invalidationRevisionId,
        systemUnpublished,
      };
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
        invalidationRevisionId: result.invalidationRevisionId,
        changed,
        changedFields: changed ? changedFieldNames(previous, next) : [],
        clearedReview: changed && previousWasReviewed,
        systemUnpublished: result.systemUnpublished,
        note: dto.note ?? null,
      },
    });

    if (changed && previousWasReviewed) {
      await this.recordAudit({
        action: 'ANATOMY_SIGN_OFF_INVALIDATED',
        actorId: user.id,
        entityType: 'AnatomyStructure',
        entityId: id,
        meta: {
          action: 'sign-off-invalidated',
          systemSlug: existing.system.slug,
          systemName: existing.system.name,
          structureId: id,
          structureSlug: existing.slug,
          structureName: existing.name,
          revisionId: result.invalidationRevisionId,
          editRevisionId: result.revisionId,
          systemUnpublished: result.systemUnpublished,
          note: dto.note ?? null,
        },
      });
    }

    if (changed) {
      await this.notifyAnatomyChange({
        excludeUserId: user.id,
        includeStudents: false,
        action: 'edit',
        title: `Anatomy edit: ${existing.name}`,
        message: `${user.fullName} updated ${existing.name} in ${existing.system.name}. Faculty review and administrator approval are pending.`,
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
      invalidationRevisionId: result.invalidationRevisionId,
      changed,
      systemUnpublished: result.systemUnpublished,
    };
  }

  // ── Structure sign-off (designated reviewers) ────────────────────────────

  async reviewStructure(
    user: RequestUser,
    id: string,
    dto: ReviewStructureDto,
  ) {
    this.assertReviewer(user);

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

    // Duplicate sign-off is a no-op, not a second audit event.
    if (existing.isReviewed && existing.reviewedRevisionId) {
      return { ...serializeStructure(existing), alreadyReviewed: true };
    }

    const requireSecondReviewer = await this.requireSecondReviewer();
    if (requireSecondReviewer) {
      const lastEditorId = existing.revisions?.[0]?.editorId ?? null;
      if (lastEditorId === user.id) {
        throw new ForbiddenException(SECOND_REVIEWER_MESSAGE);
      }
    }

    const previous = snapshot(existing);
    const reviewedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockSystem(tx, existing.systemId);

      // Re-check the second-reviewer rule inside the lock: an edit could have
      // landed after the pre-check and changed the last editor.
      if (requireSecondReviewer) {
        const latestEdit = await tx.anatomyStructureRevision.findFirst({
          where: { structureId: id, kind: EDIT_REVISION },
          orderBy: { createdAt: 'desc' },
          select: { editorId: true },
        });
        if (latestEdit?.editorId === user.id) {
          throw new ForbiddenException(SECOND_REVIEWER_MESSAGE);
        }
      }

      // The sign-off revision is the immutable content version the reviewer
      // approved; reviewedRevisionId points at it.
      const signOffRevision = await tx.anatomyStructureRevision.create({
        data: {
          structureId: id,
          editorId: user.id,
          previous: previous as unknown as Prisma.InputJsonValue,
          new: previous as unknown as Prisma.InputJsonValue,
          note: dto.note ?? null,
          kind: SIGN_OFF_REVISION,
        },
      });

      const update = await tx.anatomyStructure.updateMany({
        where: expected
          ? { id, updatedAt: expected, isReviewed: false }
          : { id, isReviewed: false },
        data: {
          isReviewed: true,
          reviewedAt,
          reviewedById: user.id,
          reviewedRevisionId: signOffRevision.id,
        },
      });
      if (update.count === 0) {
        if (expected) throw new ConflictException(STALE_MESSAGE);
        // Someone else signed off while we waited for the lock.
        return tx.anatomyStructure.findUniqueOrThrow({
          where: { id },
          include: STRUCTURE_INCLUDE,
        });
      }

      return tx.anatomyStructure.findUniqueOrThrow({
        where: { id },
        include: STRUCTURE_INCLUDE,
      });
    });

    if (!updated.isReviewed) {
      throw new ConflictException(
        'This structure could not be signed off. Reload and try again.',
      );
    }

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
        reviewedRevisionId: updated.reviewedRevisionId,
        note: dto.note ?? null,
      },
    });

    await this.notifyAnatomyChange({
      excludeUserId: user.id,
      includeStudents: false,
      action: 'review',
      title: `Anatomy reviewed: ${existing.name}`,
      message: `${user.fullName} signed off ${existing.name} in ${existing.system.name}.`,
      systemSlug: existing.system.slug,
      systemName: existing.system.name,
      structureId: id,
      structureSlug: existing.slug,
      structureName: existing.name,
    });

    return { ...serializeStructure(updated), alreadyReviewed: false };
  }

  async reviewSystem(user: RequestUser, slug: string, dto: ReviewSystemDto) {
    this.assertReviewer(user);

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
            name: true,
            summary: true,
            location: true,
            function: true,
            bloodSupply: true,
            clinicalNotes: true,
            isReviewed: true,
            reviewedRevisionId: true,
            references: true,
            relatedSlugs: true,
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
      throw new ConflictException(
        `Cannot mark the system reviewed: ${incomplete.length} structure(s) still need teaching text (${sampleSlugs(incomplete)}).`,
      );
    }

    const pending = system.structures.filter(
      (structure) => !structure.isReviewed || !structure.reviewedRevisionId,
    );

    const requireSecondReviewer = await this.requireSecondReviewer();
    if (requireSecondReviewer && pending.length > 0) {
      const blockedIds = await this.structuresLastEditedBy(
        this.prisma,
        pending.map((structure) => structure.id),
        user.id,
      );
      const blockedStructures = pending.filter((structure) =>
        blockedIds.has(structure.id),
      );
      if (blockedStructures.length > 0) {
        throw new ForbiddenException(
          `A different designated reviewer must sign off ${blockedStructures.length} structure(s) you were the last to edit (${sampleSlugs(blockedStructures)}).`,
        );
      }
    }

    const reviewedAt = new Date();

    if (pending.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await this.lockSystem(tx, system.id);

        // Re-check inside the lock: an edit may have landed after the
        // pre-check and changed who last touched a structure.
        if (requireSecondReviewer) {
          const blockedIds = await this.structuresLastEditedBy(
            tx,
            pending.map((structure) => structure.id),
            user.id,
          );
          const blockedStructures = pending.filter((structure) =>
            blockedIds.has(structure.id),
          );
          if (blockedStructures.length > 0) {
            throw new ForbiddenException(
              `A different designated reviewer must sign off ${blockedStructures.length} structure(s) you were the last to edit (${sampleSlugs(blockedStructures)}).`,
            );
          }
        }

        for (const structure of pending) {
          const signOffRevision = await tx.anatomyStructureRevision.create({
            data: {
              structureId: structure.id,
              editorId: user.id,
              previous: snapshotFields(
                structure,
              ) as unknown as Prisma.InputJsonValue,
              new: snapshotFields(
                structure,
              ) as unknown as Prisma.InputJsonValue,
              note: dto.note ?? null,
              kind: SIGN_OFF_REVISION,
            },
          });
          await tx.anatomyStructure.update({
            where: { id: structure.id },
            data: {
              isReviewed: true,
              reviewedAt,
              reviewedById: user.id,
              reviewedRevisionId: signOffRevision.id,
            },
          });
        }
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
        updatedCount: pending.length,
        note: dto.note ?? null,
      },
    });

    if (pending.length > 0) {
      await this.notifyAnatomyChange({
        excludeUserId: user.id,
        includeStudents: false,
        action: 'review-system',
        title: `Anatomy reviewed: ${system.name}`,
        message: `${user.fullName} signed off ${pending.length} structure(s) in ${system.name}.`,
        systemSlug: system.slug,
        systemName: system.name,
      });
    }

    return {
      systemSlug: system.slug,
      structureCount: system.structures.length,
      updatedCount: pending.length,
    };
  }

  // ── Administrator publication workflow ───────────────────────────────────

  // Approve publication of the current content revision. This is deliberately
  // separate from faculty sign-off and is only reachable from the admin
  // surface. Every structure must already carry a valid sign-off.
  async approvePublication(
    user: RequestUser,
    slug: string,
    dto: ReviewSystemDto,
  ) {
    this.assertAdmin(user);

    const approved = await this.prisma.$transaction(async (tx) => {
      const system = await this.loadSystemForPublication(tx, slug);
      this.assertPublishable(system);

      await this.lockSystem(tx, system.id);
      // Re-read inside the lock so an edit cannot land between the check and
      // the approval.
      const locked = await this.loadSystemForPublication(tx, slug);
      this.assertPublishable(locked);

      return tx.anatomySystem.update({
        where: { id: locked.id },
        data: {
          publicationApprovedAt: new Date(),
          publicationApprovedById: user.id,
          publicationApprovedRevision: locked.contentRevision,
        },
        select: {
          id: true,
          slug: true,
          name: true,
          contentRevision: true,
          publicationApprovedAt: true,
          publicationApprovedById: true,
          publicationApprovedRevision: true,
          isPublished: true,
        },
      });
    });

    await this.recordAudit({
      action: 'ANATOMY_PUBLICATION_APPROVE',
      actorId: user.id,
      entityType: 'AnatomySystem',
      entityId: approved.id,
      meta: {
        action: 'approve-publication',
        systemId: approved.id,
        systemSlug: approved.slug,
        systemName: approved.name,
        contentRevision: approved.contentRevision,
        publicationApprovedAt: approved.publicationApprovedAt,
        note: dto.note ?? null,
      },
    });

    return {
      systemSlug: approved.slug,
      systemName: approved.name,
      contentRevision: approved.contentRevision,
      publicationApprovedAt: approved.publicationApprovedAt,
      publicationApprovedRevision: approved.publicationApprovedRevision,
      isPublished: approved.isPublished,
      approved: true,
    };
  }

  // Publish a system so students can see it. Requires BOTH a complete set of
  // faculty sign-offs and a fresh administrator approval for the current
  // content revision. Administrator-only.
  async publishSystem(user: RequestUser, slug: string, dto: ReviewSystemDto) {
    this.assertAdmin(user);

    const published = await this.prisma.$transaction(async (tx) => {
      await this.lockSystemBySlug(tx, slug);
      const system = await this.loadSystemForPublication(tx, slug);
      this.assertPublishable(system);

      if (
        !system.publicationApprovedAt ||
        !system.publicationApprovedById ||
        system.publicationApprovedRevision !== system.contentRevision
      ) {
        throw new ConflictException(
          'Cannot publish: an administrator must approve the current revision first. Approval is missing or stale.',
        );
      }

      // Idempotent: publishing an already-published system changes nothing.
      if (system.isPublished) {
        return { system, changed: false };
      }

      await tx.anatomySystem.update({
        where: { id: system.id },
        data: { isPublished: true },
      });

      return { system, changed: true };
    });

    if (!published.changed) {
      return {
        systemSlug: published.system.slug,
        systemName: published.system.name,
        structureCount: published.system.structures.length,
        isPublished: true,
        changed: false,
      };
    }

    await this.recordAudit({
      action: 'ANATOMY_SYSTEM_PUBLISH',
      actorId: user.id,
      entityType: 'AnatomySystem',
      entityId: published.system.id,
      meta: {
        action: 'publish',
        systemId: published.system.id,
        systemSlug: published.system.slug,
        systemName: published.system.name,
        structureCount: published.system.structures.length,
        contentRevision: published.system.contentRevision,
        publicationApprovedRevision:
          published.system.publicationApprovedRevision,
        note: dto.note ?? null,
      },
    });

    // Publishing is the moment content becomes visible to students, so they are
    // notified too (unlike edit/review on unpublished drafts).
    await this.notifyAnatomyChange({
      excludeUserId: user.id,
      includeStudents: true,
      action: 'publish',
      title: `Anatomy published: ${published.system.name}`,
      message: `An administrator published ${published.system.name} to students.`,
      systemSlug: published.system.slug,
      systemName: published.system.name,
    });

    return {
      systemSlug: published.system.slug,
      systemName: published.system.name,
      structureCount: published.system.structures.length,
      isPublished: true,
      changed: true,
    };
  }

  // Return a published system to draft so students stop seeing it. Both
  // reviewers (withdrawing their own content) and administrators may do this.
  async unpublishSystem(user: RequestUser, slug: string, dto: ReviewSystemDto) {
    if (user.role === 'TEACHER') {
      this.assertReviewer(user);
    } else {
      this.assertAdmin(user);
    }

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

    await this.prisma.$transaction(async (tx) => {
      await this.lockSystem(tx, system.id);
      await tx.anatomySystem.update({
        where: { id: system.id },
        data: {
          isPublished: false,
          publicationApprovedAt: null,
          publicationApprovedById: null,
          publicationApprovedRevision: null,
        },
      });
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

  // ── Review revocation ────────────────────────────────────────────────────

  async revokeStructure(
    user: RequestUser,
    id: string,
    dto: ReviewStructureDto,
  ) {
    this.assertReviewer(user);

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

    const previous = snapshot(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockSystem(tx, existing.systemId);

      const revision = await tx.anatomyStructureRevision.create({
        data: {
          structureId: id,
          editorId: user.id,
          previous: previous as unknown as Prisma.InputJsonValue,
          new: previous as unknown as Prisma.InputJsonValue,
          note: dto.note ?? null,
          kind: REVIEW_REVOKED_REVISION,
        },
      });

      await tx.anatomyStructure.update({
        where: { id },
        data: {
          isReviewed: false,
          reviewedAt: null,
          reviewedById: null,
          reviewedRevisionId: null,
        },
      });

      // A withdrawn sign-off makes any publication decision invalid.
      await tx.anatomySystem.update({
        where: { id: existing.systemId },
        data: {
          contentRevision: { increment: 1 },
          isPublished: false,
          publicationApprovedAt: null,
          publicationApprovedById: null,
          publicationApprovedRevision: null,
        },
      });

      const structure = await tx.anatomyStructure.findUniqueOrThrow({
        where: { id },
        include: STRUCTURE_INCLUDE,
      });

      return { structure, revisionId: revision.id };
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
        revisionId: updated.revisionId,
        note: dto.note ?? null,
      },
    });

    await this.recordAudit({
      action: 'ANATOMY_SIGN_OFF_INVALIDATED',
      actorId: user.id,
      entityType: 'AnatomyStructure',
      entityId: id,
      meta: {
        action: 'sign-off-revoked',
        systemSlug: existing.system.slug,
        systemName: existing.system.name,
        structureId: id,
        structureSlug: existing.slug,
        structureName: existing.name,
        revisionId: updated.revisionId,
        note: dto.note ?? null,
      },
    });

    await this.notifyAnatomyChange({
      excludeUserId: user.id,
      includeStudents: false,
      action: 'revoke',
      title: `Anatomy review revoked: ${existing.name}`,
      message: `${user.fullName} revoked faculty sign-off for ${existing.name} in ${existing.system.name}. Administrator approval is invalidated.`,
      systemSlug: existing.system.slug,
      systemName: existing.system.name,
      structureId: id,
      structureSlug: existing.slug,
      structureName: existing.name,
    });

    return { ...serializeStructure(updated.structure), alreadyRevoked: false };
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
      kind: revision.kind,
    }));
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  // Returns the ids in `structureIds` whose most recent content edit belongs to
  // `editorId`. Only the last editor is blocked; a teacher who edited a
  // structure before someone else may still review it.
  private async structuresLastEditedBy(
    client: RevisionClient,
    structureIds: string[],
    editorId: string,
  ): Promise<Set<string>> {
    if (structureIds.length === 0) return new Set();

    const revisions = await client.anatomyStructureRevision.findMany({
      where: {
        structureId: { in: structureIds },
        kind: EDIT_REVISION,
      },
      orderBy: { createdAt: 'desc' },
      select: { structureId: true, editorId: true },
    });

    const lastEditorByStructure = new Map<string, string>();
    for (const revision of revisions) {
      if (!lastEditorByStructure.has(revision.structureId)) {
        lastEditorByStructure.set(revision.structureId, revision.editorId);
      }
    }

    return new Set(
      structureIds.filter((id) => lastEditorByStructure.get(id) === editorId),
    );
  }

  // SELECT ... FOR UPDATE on the parent system serializes edits, sign-offs,
  // publication approval, publish, and unpublish against each other.
  private async lockSystem(tx: TransactionClient, systemId: string) {
    await tx.$queryRaw`SELECT "id" FROM "AnatomySystem" WHERE "id" = ${systemId} FOR UPDATE`;
  }

  private async lockSystemBySlug(tx: TransactionClient, slug: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AnatomySystem" WHERE "slug" = ${slug} FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException('Anatomy system not found');
    }
  }

  private async loadSystemForPublication(tx: TransactionClient, slug: string) {
    const system = await tx.anatomySystem.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        isPublished: true,
        contentRevision: true,
        publicationApprovedAt: true,
        publicationApprovedById: true,
        publicationApprovedRevision: true,
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
            reviewedRevisionId: true,
          },
        },
      },
    });

    if (!system) {
      throw new NotFoundException('Anatomy system not found');
    }
    return system;
  }

  // Throws a 4xx that names every unsigned structure. Administrator approval
  // and publishing both use this, so an administrator cannot bypass the
  // unsigned check.
  private assertPublishable(system: {
    structures: Array<{
      slug: string;
      summary: string;
      location: string | null;
      function: string | null;
      bloodSupply: string | null;
      clinicalNotes: string | null;
      isReviewed: boolean;
      reviewedRevisionId: string | null;
    }>;
    publicationApprovedAt: Date | null;
  }) {
    if (system.structures.length === 0) {
      throw new ConflictException(
        'Cannot publish a system with no structures.',
      );
    }

    const incomplete = system.structures.filter(
      (structure) => missingTextFields(structure).length > 0,
    );
    if (incomplete.length > 0) {
      throw new ConflictException(
        `Cannot publish: ${incomplete.length} structure(s) still need teaching text (${sampleSlugs(incomplete)}).`,
      );
    }

    const unsigned = system.structures.filter(
      (structure) => !structure.isReviewed || !structure.reviewedRevisionId,
    );
    if (unsigned.length > 0) {
      throw new ConflictException(
        `Cannot publish: ${unsigned.length} structure(s) are not faculty signed off (${sampleSlugs(unsigned)}).`,
      );
    }
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
  // successful edit/review return an error.
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
          ...(input.structureSlug
            ? { structureSlug: input.structureSlug }
            : {}),
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

function snapshotFields(structure: {
  summary: string;
  location: string | null;
  function: string | null;
  bloodSupply: string | null;
  clinicalNotes: string | null;
  references: string[];
  relatedSlugs: string[];
}): EditableSnapshot {
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
