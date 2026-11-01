/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuditService } from '../audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../../common/types/request-user';
import { AnatomyReviewService } from './anatomy-review.service';

const loadedAt = new Date('2026-10-31T10:00:00.000Z');
const savedAt = new Date('2026-10-31T10:05:00.000Z');

const teacher = {
  id: 'teacher-1',
  role: 'TEACHER',
  isAnatomyReviewer: true,
  fullName: 'Dr Editor',
} as unknown as RequestUser;

function structure(overrides: Record<string, unknown> = {}) {
  return {
    id: 'structure-1',
    systemId: 'system-1',
    slug: 'aorta',
    name: 'Aorta',
    latinName: 'Aorta',
    summary: 'Main artery of the body.',
    location: 'Thorax and abdomen',
    function: 'Distributes oxygenated blood',
    bloodSupply: 'Vasa vasorum',
    clinicalNotes: 'Aortic dissection is a surgical emergency.',
    meshName: 'aorta',
    layer: 'arteries',
    relatedSlugs: [],
    references: ['FMA:3734'],
    sortOrder: 1,
    isReviewed: true,
    reviewedAt: new Date('2026-10-01T09:00:00.000Z'),
    reviewedById: 'teacher-old',
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    updatedAt: loadedAt,
    reviewedBy: { id: 'teacher-old', fullName: 'Dr Old Reviewer' },
    system: { slug: 'heart', name: 'Heart', isPublished: true },
    ...overrides,
  };
}

function setup() {
  const findUnique = jest.fn();
  const findUniqueOrThrow = jest.fn();
  const updateMany = jest.fn();
  const update = jest.fn();
  const findMany = jest.fn();
  const revisionCreate = jest.fn();
  const revisionFindMany = jest.fn();
  const systemFindUnique = jest.fn();
  const systemFindMany = jest.fn();
  const userFindMany = jest.fn().mockResolvedValue([]);

  const prisma: PrismaService = {
    anatomyStructure: {
      findUnique,
      findUniqueOrThrow,
      updateMany,
      update,
      findMany,
    },
    anatomyStructureRevision: {
      create: revisionCreate,
      findMany: revisionFindMany,
    },
    anatomySystem: {
      findUnique: systemFindUnique,
      findMany: systemFindMany,
    },
    user: { findMany: userFindMany },
    $transaction: jest.fn(
      async (callback: (tx: PrismaService) => Promise<unknown>) =>
        callback(prisma),
    ),
  } as unknown as PrismaService;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  const notifications = {
    notifyUsers: jest.fn().mockResolvedValue(0),
  } as unknown as NotificationsService;

  return {
    service: new AnatomyReviewService(prisma, audit, notifications),
    audit: audit as unknown as { record: jest.Mock },
    notifications: notifications as unknown as { notifyUsers: jest.Mock },
    prisma: prisma as unknown as {
      $transaction: jest.Mock;
    },
    mocks: {
      findUnique,
      findUniqueOrThrow,
      updateMany,
      update,
      findMany,
      revisionCreate,
      revisionFindMany,
      systemFindUnique,
      systemFindMany,
      userFindMany,
    },
  };
}

describe('AnatomyReviewService', () => {
  it('clears approval, creates one revision, and audits an edit to a reviewed row', async () => {
    const { service, audit, mocks } = setup();
    mocks.findUnique.mockResolvedValue(structure());
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });
    mocks.findUniqueOrThrow.mockResolvedValue(
      structure({
        summary: 'Updated summary.',
        isReviewed: false,
        reviewedAt: null,
        reviewedById: null,
        reviewedBy: null,
        updatedAt: savedAt,
      }),
    );

    const result = await service.updateStructure(teacher, 'structure-1', {
      updatedAt: loadedAt.toISOString(),
      summary: 'Updated summary.',
      note: 'Tightened wording',
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'structure-1', updatedAt: loadedAt },
      data: expect.objectContaining({
        summary: 'Updated summary.',
        isReviewed: false,
        reviewedAt: null,
        reviewedById: null,
      }),
    });
    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        structureId: 'structure-1',
        editorId: 'teacher-1',
        note: 'Tightened wording',
        previous: expect.objectContaining({
          summary: 'Main artery of the body.',
        }),
        new: expect.objectContaining({ summary: 'Updated summary.' }),
      }),
    });
    expect(result.status).toBe('pending');
    expect(result.revisionId).toBe('revision-1');
    expect(result.reviewedByName).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ANATOMY_STRUCTURE_UPDATE',
        entityId: 'structure-1',
      }),
    );
  });

  it('leaves approval intact when a save changes nothing', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue(structure());
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });
    mocks.findUniqueOrThrow.mockResolvedValue(structure());

    await service.updateStructure(teacher, 'structure-1', {
      updatedAt: loadedAt.toISOString(),
    });

    const data = mocks.updateMany.mock.calls[0][0].data;
    expect(data.isReviewed).toBeUndefined();
    expect(data.reviewedAt).toBeUndefined();
    expect(data.reviewedById).toBeUndefined();
  });

  it('rejects a stale updatedAt with 409 before writing', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue(structure());

    await expect(
      service.updateStructure(teacher, 'structure-1', {
        updatedAt: new Date(loadedAt.getTime() - 1000).toISOString(),
        summary: 'Stale edit',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.revisionCreate).not.toHaveBeenCalled();
  });

  it('returns 409 and writes no revision when another save wins the race', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue(structure());
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateStructure(teacher, 'structure-1', {
        updatedAt: loadedAt.toISOString(),
        summary: 'Racing edit',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mocks.revisionCreate).not.toHaveBeenCalled();
  });

  it('normalizes empty optional text to null and de-duplicates references', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue(
      structure({ isReviewed: false, reviewedBy: null }),
    );
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });
    mocks.findUniqueOrThrow.mockResolvedValue(
      structure({
        isReviewed: false,
        reviewedBy: null,
        location: null,
        references: ['FMA:3734'],
      }),
    );

    await service.updateStructure(teacher, 'structure-1', {
      updatedAt: loadedAt.toISOString(),
      location: '',
      references: ['FMA:3734', 'FMA:3734'],
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'structure-1', updatedAt: loadedAt },
      data: expect.objectContaining({
        location: null,
        references: ['FMA:3734'],
      }),
    });
  });

  it('rejects relatedSlugs that do not exist in the same system', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue(structure());
    mocks.findMany.mockResolvedValue([{ slug: 'aorta' }]);

    await expect(
      service.updateStructure(teacher, 'structure-1', {
        updatedAt: loadedAt.toISOString(),
        relatedSlugs: ['does-not-exist'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a structure listing itself as related', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue(structure());

    await expect(
      service.updateStructure(teacher, 'structure-1', {
        updatedAt: loadedAt.toISOString(),
        relatedSlugs: ['aorta'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to review a structure with missing teaching text', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue(
      structure({ isReviewed: false, reviewedBy: null, clinicalNotes: null }),
    );

    await expect(
      service.reviewStructure(teacher, 'structure-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('records reviewer identity and status when approving a structure', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue(
      structure({
        isReviewed: false,
        reviewedBy: null,
        reviewedAt: null,
        reviewedById: null,
      }),
    );
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue(
      structure({
        isReviewed: true,
        reviewedAt: savedAt,
        reviewedById: 'teacher-1',
        reviewedBy: { id: 'teacher-1', fullName: 'Dr Reviewer' },
        updatedAt: savedAt,
      }),
    );

    const result = await service.reviewStructure(teacher, 'structure-1', {
      updatedAt: loadedAt.toISOString(),
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'structure-1', updatedAt: loadedAt },
      data: expect.objectContaining({
        isReviewed: true,
        reviewedById: 'teacher-1',
        reviewedAt: expect.any(Date),
      }),
    });
    expect(result.status).toBe('reviewed');
    expect(result.reviewedByName).toBe('Dr Reviewer');
  });

  it('revokes approval without touching teaching text', async () => {
    const { service, audit, mocks } = setup();
    mocks.findUnique.mockResolvedValue(structure());
    mocks.update.mockResolvedValue(
      structure({
        isReviewed: false,
        reviewedAt: null,
        reviewedById: null,
        reviewedBy: null,
      }),
    );

    const result = await service.revokeStructure(teacher, 'structure-1', {});

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'structure-1' },
      data: { isReviewed: false, reviewedAt: null, reviewedById: null },
      include: { reviewedBy: { select: { id: true, fullName: true } } },
    });
    expect(result.status).toBe('pending');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ANATOMY_STRUCTURE_REVOKE' }),
    );
  });

  it('lists revisions newest first with editor names', async () => {
    const { service, mocks } = setup();
    mocks.findUnique.mockResolvedValue({ id: 'structure-1' });
    mocks.revisionFindMany.mockResolvedValue([
      {
        id: 'revision-2',
        structureId: 'structure-1',
        editorId: 'teacher-1',
        createdAt: savedAt,
        previous: { summary: 'Old' },
        new: { summary: 'New' },
        note: 'Clarified',
        editor: { id: 'teacher-1', fullName: 'Dr Editor' },
      },
    ]);

    const revisions = await service.listRevisions('structure-1');

    expect(mocks.revisionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { structureId: 'structure-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(revisions).toEqual([
      expect.objectContaining({
        id: 'revision-2',
        editorName: 'Dr Editor',
        note: 'Clarified',
      }),
    ]);
  });

  it('refuses to review a system when any structure is incomplete', async () => {
    const { service, mocks } = setup();
    mocks.systemFindUnique.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart',
      structures: [
        {
          id: 'structure-1',
          slug: 'aorta',
          summary: 'Complete',
          location: 'Chest',
          function: 'Pumps',
          bloodSupply: 'Vasa',
          clinicalNotes: 'Notes',
          isReviewed: false,
        },
        {
          id: 'structure-2',
          slug: 'atrium',
          summary: 'Incomplete',
          location: null,
          function: null,
          bloodSupply: null,
          clinicalNotes: null,
          isReviewed: false,
        },
      ],
    });

    await expect(
      service.reviewSystem(teacher, 'heart', {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('reviews only the unreviewed structures in one transaction', async () => {
    const { service, audit, mocks } = setup();
    mocks.systemFindUnique.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart',
      structures: [
        {
          id: 'structure-1',
          slug: 'aorta',
          summary: 'Complete',
          location: 'Chest',
          function: 'Pumps',
          bloodSupply: 'Vasa',
          clinicalNotes: 'Notes',
          isReviewed: true,
        },
        {
          id: 'structure-2',
          slug: 'atrium',
          summary: 'Complete',
          location: 'Chest',
          function: 'Fills',
          bloodSupply: 'Coronary',
          clinicalNotes: 'Notes',
          isReviewed: false,
        },
      ],
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.reviewSystem(teacher, 'heart', {});

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['structure-2'] } },
      data: expect.objectContaining({
        isReviewed: true,
        reviewedById: 'teacher-1',
      }),
    });
    expect(result).toEqual({
      systemSlug: 'heart',
      structureCount: 2,
      updatedCount: 1,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ANATOMY_SYSTEM_REVIEW' }),
    );
  });

  it('counts empty, draft, pending, and reviewed structures per system', async () => {
    const { service, mocks } = setup();
    mocks.systemFindMany.mockResolvedValue([
      {
        id: 'system-1',
        slug: 'heart',
        name: 'Heart',
        latinName: 'Cor',
        description: 'Heart',
        modelUrl: '/models/heart.glb',
        isSample: true,
        isPublished: true,
        sortOrder: 1,
        structures: [
          {
            summary: '',
            location: null,
            function: null,
            bloodSupply: null,
            clinicalNotes: null,
            isReviewed: false,
          },
          {
            summary: 'Draft text',
            location: null,
            function: null,
            bloodSupply: null,
            clinicalNotes: null,
            isReviewed: false,
          },
          {
            summary: 'All text',
            location: 'Chest',
            function: 'Pumps',
            bloodSupply: 'Vasa',
            clinicalNotes: 'Notes',
            isReviewed: false,
          },
          {
            summary: 'All text',
            location: 'Chest',
            function: 'Pumps',
            bloodSupply: 'Vasa',
            clinicalNotes: 'Notes',
            isReviewed: true,
          },
        ],
      },
    ]);

    const systems = await service.listSystems();

    expect(systems).toEqual([
      expect.objectContaining({
        slug: 'heart',
        structureCount: 4,
        counts: { empty: 1, draft: 1, pending: 1, reviewed: 1 },
      }),
    ]);
  });

  it('notifies other reviewers about a changed edit and excludes the editor', async () => {
    const { service, notifications, mocks } = setup();
    mocks.findUnique.mockResolvedValue(
      structure({ isReviewed: false, reviewedBy: null }),
    );
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });
    mocks.findUniqueOrThrow.mockResolvedValue(
      structure({ summary: 'Updated summary.', isReviewed: false }),
    );
    mocks.userFindMany.mockResolvedValue([{ id: 'teacher-2' }]);

    await service.updateStructure(teacher, 'structure-1', {
      updatedAt: loadedAt.toISOString(),
      summary: 'Updated summary.',
    });

    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['teacher-2'],
        title: 'Anatomy edit: Aorta',
      }),
    );
  });

  it('notifies other teachers and students when published content is reviewed', async () => {
    const { service, notifications, mocks } = setup();
    mocks.findUnique.mockResolvedValue(
      structure({
        isReviewed: false,
        reviewedBy: null,
        reviewedAt: null,
        reviewedById: null,
      }),
    );
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue(
      structure({
        isReviewed: true,
        reviewedAt: savedAt,
        reviewedById: 'teacher-1',
        reviewedBy: { id: 'teacher-1', fullName: 'Dr Reviewer' },
      }),
    );
    mocks.userFindMany
      .mockResolvedValueOnce([{ id: 'teacher-2' }])
      .mockResolvedValueOnce([{ id: 'student-1' }]);

    await service.reviewStructure(teacher, 'structure-1', {});

    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['teacher-2', 'student-1'],
        title: 'Anatomy reviewed: Aorta',
      }),
    );
  });

  it('does not notify students when an unpublished system is edited or reviewed', async () => {
    const { service, notifications, mocks } = setup();
    mocks.findUnique.mockResolvedValue(
      structure({
        isReviewed: false,
        reviewedBy: null,
        system: { slug: 'urinary', name: 'Urinary', isPublished: false },
      }),
    );
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue(
      structure({
        isReviewed: true,
        reviewedAt: savedAt,
        reviewedById: 'teacher-1',
        reviewedBy: { id: 'teacher-1', fullName: 'Dr Reviewer' },
        system: { slug: 'urinary', name: 'Urinary', isPublished: false },
      }),
    );
    mocks.userFindMany.mockResolvedValue([{ id: 'teacher-2' }]);

    await service.reviewStructure(teacher, 'structure-1', {});

    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['teacher-2'] }),
    );
  });
});
