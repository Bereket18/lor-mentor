/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { AuditService } from '../audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../../common/types/request-user';
import { AnatomyReviewService } from './anatomy-review.service';

const loadedAt = new Date('2026-10-31T10:00:00.000Z');
const savedAt = new Date('2026-10-31T10:05:00.000Z');

const reviewer = {
  id: 'teacher-1',
  role: 'TEACHER',
  isAnatomyReviewer: true,
  isActive: true,
  fullName: 'Dr Reviewer',
} as unknown as RequestUser;

const ordinaryTeacher = {
  id: 'teacher-2',
  role: 'TEACHER',
  isAnatomyReviewer: false,
  isActive: true,
  fullName: 'Dr Editor',
} as unknown as RequestUser;

const otherReviewer = {
  id: 'teacher-3',
  role: 'TEACHER',
  isAnatomyReviewer: true,
  isActive: true,
  fullName: 'Dr Second Reviewer',
} as unknown as RequestUser;

const admin = {
  id: 'admin-1',
  role: 'ADMIN',
  isAnatomyReviewer: false,
  isActive: true,
  fullName: 'Admin Approver',
} as unknown as RequestUser;

const student = {
  id: 'student-1',
  role: 'STUDENT',
  isAnatomyReviewer: false,
  isActive: true,
  fullName: 'Student',
} as unknown as RequestUser;

const completeText = {
  summary: 'Main artery of the body.',
  location: 'Thorax and abdomen',
  function: 'Distributes oxygenated blood',
  bloodSupply: 'Vasa vasorum',
  clinicalNotes: 'Aortic dissection is a surgical emergency.',
  references: ['FMA:3734'],
  relatedSlugs: [],
};

function structure(overrides: Record<string, unknown> = {}) {
  return {
    id: 'structure-1',
    systemId: 'system-1',
    slug: 'aorta',
    name: 'Aorta',
    latinName: 'Aorta',
    ...completeText,
    meshName: 'aorta',
    layer: 'arteries',
    sortOrder: 1,
    isReviewed: true,
    reviewedAt: new Date('2026-10-01T09:00:00.000Z'),
    reviewedById: 'teacher-old',
    reviewedRevisionId: 'signoff-old',
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    updatedAt: loadedAt,
    reviewedBy: { id: 'teacher-old', fullName: 'Dr Old Reviewer' },
    revisions: [],
    system: { slug: 'heart', name: 'Heart', isPublished: true },
    ...overrides,
  };
}

function completeStructure(overrides: Record<string, unknown> = {}) {
  return {
    id: 'structure-1',
    slug: 'aorta',
    ...completeText,
    isReviewed: true,
    reviewedRevisionId: 'signoff-1',
    ...overrides,
  };
}

function setup() {
  const findUnique = jest.fn();
  const findUniqueOrThrow = jest.fn();
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const update = jest.fn();
  const findMany = jest.fn();
  const revisionCreate = jest
    .fn()
    .mockImplementation(() => ({ id: `revision-${Date.now()}` }));
  const revisionFindMany = jest.fn().mockResolvedValue([]);
  const revisionFindFirst = jest.fn().mockResolvedValue(null);
  const systemFindUnique = jest.fn();
  const systemFindMany = jest.fn();
  const systemUpdate = jest.fn().mockResolvedValue({ isPublished: false });
  const userFindMany = jest.fn().mockResolvedValue([]);
  const settingsFindUnique = jest.fn().mockResolvedValue(null);
  const settingsUpsert = jest.fn().mockResolvedValue({
    requireSecondReviewer: true,
    updatedAt: savedAt,
  });
  const queryRaw = jest.fn().mockResolvedValue([{ id: 'system-1' }]);

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
      findFirst: revisionFindFirst,
    },
    anatomySystem: {
      findUnique: systemFindUnique,
      findMany: systemFindMany,
      update: systemUpdate,
    },
    anatomyReviewSettings: {
      findUnique: settingsFindUnique,
      upsert: settingsUpsert,
    },
    user: { findMany: userFindMany },
    $queryRaw: queryRaw,
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
      revisionFindFirst,
      systemFindUnique,
      systemFindMany,
      systemUpdate,
      userFindMany,
      settingsFindUnique,
      settingsUpsert,
      queryRaw,
    },
  };
}

describe('AnatomyReviewService', () => {
  describe('editing and sign-off invalidation', () => {
    it('clears sign-off, records both revisions, audits invalidation, and unpublishes on edit', async () => {
      const { service, audit, mocks } = setup();
      mocks.findUnique.mockResolvedValue(structure());
      mocks.revisionCreate
        .mockResolvedValueOnce({ id: 'revision-edit' })
        .mockResolvedValueOnce({ id: 'revision-invalidated' });
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({
          summary: 'Updated summary.',
          isReviewed: false,
          reviewedAt: null,
          reviewedById: null,
          reviewedRevisionId: null,
          reviewedBy: null,
          updatedAt: savedAt,
        }),
      );

      const result = await service.updateStructure(reviewer, 'structure-1', {
        updatedAt: loadedAt.toISOString(),
        summary: 'Updated summary.',
        note: 'Tightened wording',
      });

      expect(mocks.queryRaw).toHaveBeenCalled();
      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: { id: 'structure-1', updatedAt: loadedAt },
        data: expect.objectContaining({
          summary: 'Updated summary.',
          isReviewed: false,
          reviewedAt: null,
          reviewedById: null,
          reviewedRevisionId: null,
        }),
      });
      expect(mocks.revisionCreate).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          structureId: 'structure-1',
          editorId: 'teacher-1',
          note: 'Tightened wording',
          kind: 'edit',
          previous: expect.objectContaining({
            summary: 'Main artery of the body.',
          }),
          new: expect.objectContaining({ summary: 'Updated summary.' }),
        }),
      });
      expect(mocks.revisionCreate).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          structureId: 'structure-1',
          kind: 'sign-off-invalidated',
        }),
      });
      expect(mocks.systemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'system-1' },
          data: expect.objectContaining({
            contentRevision: { increment: 1 },
            isPublished: false,
            publicationApprovedAt: null,
            publicationApprovedById: null,
            publicationApprovedRevision: null,
          }),
        }),
      );
      expect(result.status).toBe('pending');
      expect(result.revisionId).toBe('revision-edit');
      expect(result.invalidationRevisionId).toBe('revision-invalidated');
      expect(result.systemUnpublished).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANATOMY_STRUCTURE_UPDATE',
          entityId: 'structure-1',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANATOMY_SIGN_OFF_INVALIDATED',
          entityId: 'structure-1',
        }),
      );
    });

    it('lets an ordinary teacher edit but never sign off', async () => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(
        structure({ isReviewed: false, reviewedBy: null }),
      );
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({ summary: 'Edited', isReviewed: false, reviewedBy: null }),
      );
      mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });

      const result = await service.updateStructure(
        ordinaryTeacher,
        'structure-1',
        {
          updatedAt: loadedAt.toISOString(),
          summary: 'Edited',
        },
      );
      expect(result.changed).toBe(true);

      mocks.findUnique.mockResolvedValue(
        structure({ isReviewed: false, reviewedBy: null }),
      );
      await expect(
        service.reviewStructure(ordinaryTeacher, 'structure-1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects edits from inactive accounts', async () => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(structure());
      const inactive = { ...ordinaryTeacher, isActive: false };

      await expect(
        service.updateStructure(inactive, 'structure-1', {
          updatedAt: loadedAt.toISOString(),
          summary: 'Nope',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    });

    it('leaves approval intact when a save changes nothing', async () => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(structure());
      mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });
      mocks.findUniqueOrThrow.mockResolvedValue(structure());

      await service.updateStructure(reviewer, 'structure-1', {
        updatedAt: loadedAt.toISOString(),
      });

      const data = mocks.updateMany.mock.calls[0][0].data;
      expect(data.isReviewed).toBeUndefined();
      expect(data.reviewedAt).toBeUndefined();
      expect(data.reviewedById).toBeUndefined();
      expect(data.reviewedRevisionId).toBeUndefined();
      expect(mocks.systemUpdate).not.toHaveBeenCalled();
    });

    it('rejects a stale updatedAt with 409 before writing', async () => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(structure());

      await expect(
        service.updateStructure(reviewer, 'structure-1', {
          updatedAt: new Date(loadedAt.getTime() - 1000).toISOString(),
          summary: 'Stale edit',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.revisionCreate).not.toHaveBeenCalled();
    });

    it('returns 409 and writes no revision when a concurrent save wins', async () => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(structure());
      mocks.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStructure(reviewer, 'structure-1', {
          updatedAt: loadedAt.toISOString(),
          summary: 'Racing edit',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mocks.revisionCreate).not.toHaveBeenCalled();
      expect(mocks.systemUpdate).not.toHaveBeenCalled();
    });

    it('normalizes empty optional text and de-duplicates references', async () => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(
        structure({ isReviewed: false, reviewedBy: null }),
      );
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({ isReviewed: false, reviewedBy: null, location: null }),
      );
      mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });

      await service.updateStructure(reviewer, 'structure-1', {
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
        service.updateStructure(reviewer, 'structure-1', {
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
        service.updateStructure(reviewer, 'structure-1', {
          updatedAt: loadedAt.toISOString(),
          relatedSlugs: ['aorta'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('notifies other reviewers about a changed edit and excludes the editor', async () => {
      const { service, notifications, mocks } = setup();
      mocks.findUnique.mockResolvedValue(
        structure({ isReviewed: false, reviewedBy: null }),
      );
      mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({ summary: 'Updated summary.', isReviewed: false }),
      );
      mocks.userFindMany.mockResolvedValue([{ id: 'teacher-9' }]);

      await service.updateStructure(ordinaryTeacher, 'structure-1', {
        updatedAt: loadedAt.toISOString(),
        summary: 'Updated summary.',
      });

      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['teacher-9'],
          title: 'Anatomy edit: Aorta',
        }),
      );
    });
  });

  describe('structure sign-off', () => {
    it('refuses sign-off while teaching text is missing', async () => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(
        structure({
          isReviewed: false,
          reviewedBy: null,
          clinicalNotes: null,
        }),
      );

      await expect(
        service.reviewStructure(reviewer, 'structure-1', {}),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mocks.updateMany).not.toHaveBeenCalled();
    });

    it('records reviewer identity, timestamp, and the sign-off revision link', async () => {
      const { service, audit, mocks } = setup();
      mocks.findUnique.mockResolvedValue(
        structure({
          isReviewed: false,
          reviewedBy: null,
          reviewedAt: null,
          reviewedById: null,
          reviewedRevisionId: null,
        }),
      );
      mocks.revisionCreate.mockResolvedValue({ id: 'signoff-new' });
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({
          isReviewed: true,
          reviewedAt: savedAt,
          reviewedById: 'teacher-1',
          reviewedRevisionId: 'signoff-new',
          reviewedBy: { id: 'teacher-1', fullName: 'Dr Reviewer' },
          updatedAt: savedAt,
        }),
      );

      const result = await service.reviewStructure(reviewer, 'structure-1', {
        updatedAt: loadedAt.toISOString(),
      });

      expect(mocks.revisionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          structureId: 'structure-1',
          editorId: 'teacher-1',
          kind: 'sign-off',
          new: expect.objectContaining({
            summary: 'Main artery of the body.',
          }),
        }),
      });
      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'structure-1',
          updatedAt: loadedAt,
          isReviewed: false,
        },
        data: expect.objectContaining({
          isReviewed: true,
          reviewedById: 'teacher-1',
          reviewedRevisionId: 'signoff-new',
          reviewedAt: expect.any(Date),
        }),
      });
      expect(result.status).toBe('reviewed');
      expect(result.reviewedByName).toBe('Dr Reviewer');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANATOMY_STRUCTURE_REVIEW',
          meta: expect.objectContaining({
            reviewedRevisionId: 'signoff-new',
          }),
        }),
      );
    });

    it('treats a duplicate sign-off as a no-op', async () => {
      const { service, audit, mocks } = setup();
      mocks.findUnique.mockResolvedValue(structure());

      const result = await service.reviewStructure(reviewer, 'structure-1', {});

      expect(result.alreadyReviewed).toBe(true);
      expect(mocks.revisionCreate).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each([
      ['student', student],
      ['ordinary teacher', ordinaryTeacher],
      ['administrator', admin],
    ])('rejects sign-off by a %s', async (_label, user) => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(
        structure({ isReviewed: false, reviewedBy: null }),
      );

      await expect(
        service.reviewStructure(user, 'structure-1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    });

    it('rejects sign-off from an inactive reviewer account', async () => {
      const { service, mocks } = setup();
      const inactive = { ...reviewer, isActive: false };
      mocks.findUnique.mockResolvedValue(
        structure({ isReviewed: false, reviewedBy: null }),
      );

      await expect(
        service.reviewStructure(inactive, 'structure-1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a reviewer to sign off their own edit when second reviewer is OFF', async () => {
      const { service, mocks } = setup();
      mocks.settingsFindUnique.mockResolvedValue({
        requireSecondReviewer: false,
      });
      mocks.findUnique.mockResolvedValue(
        structure({
          isReviewed: false,
          reviewedBy: null,
          reviewedAt: null,
          reviewedById: null,
          reviewedRevisionId: null,
          revisions: [{ editorId: 'teacher-1', createdAt: loadedAt }],
        }),
      );
      mocks.revisionCreate.mockResolvedValue({ id: 'signoff-new' });
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({
          isReviewed: true,
          reviewedRevisionId: 'signoff-new',
          reviewedBy: { id: 'teacher-1', fullName: 'Dr Reviewer' },
        }),
      );

      const result = await service.reviewStructure(reviewer, 'structure-1', {});
      expect(result.alreadyReviewed).toBe(false);
    });

    it('blocks the last editor from signing off when second reviewer is ON', async () => {
      const { service, mocks } = setup();
      mocks.settingsFindUnique.mockResolvedValue({
        requireSecondReviewer: true,
      });
      mocks.findUnique.mockResolvedValue(
        structure({
          isReviewed: false,
          reviewedBy: null,
          reviewedRevisionId: null,
          revisions: [{ editorId: 'teacher-1', createdAt: loadedAt }],
        }),
      );

      await expect(
        service.reviewStructure(reviewer, 'structure-1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.revisionCreate).not.toHaveBeenCalled();
    });

    it('lets a different reviewer sign off when second reviewer is ON', async () => {
      const { service, mocks } = setup();
      mocks.settingsFindUnique.mockResolvedValue({
        requireSecondReviewer: true,
      });
      mocks.revisionFindFirst.mockResolvedValue({ editorId: 'teacher-1' });
      mocks.findUnique.mockResolvedValue(
        structure({
          isReviewed: false,
          reviewedBy: null,
          reviewedRevisionId: null,
          revisions: [{ editorId: 'teacher-1', createdAt: loadedAt }],
        }),
      );
      mocks.revisionCreate.mockResolvedValue({ id: 'signoff-new' });
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({
          isReviewed: true,
          reviewedRevisionId: 'signoff-new',
          reviewedById: 'teacher-3',
          reviewedBy: { id: 'teacher-3', fullName: 'Dr Second Reviewer' },
        }),
      );

      const result = await service.reviewStructure(
        otherReviewer,
        'structure-1',
        {},
      );
      expect(result.alreadyReviewed).toBe(false);
    });

    it('notifies other reviewers but not students when an unpublished system is signed off', async () => {
      const { service, notifications, mocks } = setup();
      mocks.findUnique.mockResolvedValue(
        structure({
          isReviewed: false,
          reviewedBy: null,
          reviewedRevisionId: null,
          system: { slug: 'urinary', name: 'Urinary', isPublished: false },
        }),
      );
      mocks.revisionCreate.mockResolvedValue({ id: 'signoff-new' });
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({
          isReviewed: true,
          reviewedRevisionId: 'signoff-new',
          reviewedBy: { id: 'teacher-1', fullName: 'Dr Reviewer' },
          system: { slug: 'urinary', name: 'Urinary', isPublished: false },
        }),
      );
      mocks.userFindMany.mockResolvedValue([{ id: 'teacher-9' }]);

      await service.reviewStructure(reviewer, 'structure-1', {});

      expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        expect.objectContaining({ userIds: ['teacher-9'] }),
      );
    });
  });

  describe('system review', () => {
    it('refuses to review a system when any structure is incomplete', async () => {
      const { service, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue({
        id: 'system-1',
        slug: 'heart',
        name: 'Heart',
        structures: [
          completeStructure({ id: 'structure-1', slug: 'aorta' }),
          {
            id: 'structure-2',
            slug: 'atrium',
            ...completeText,
            summary: '',
            location: null,
            function: null,
            bloodSupply: null,
            clinicalNotes: null,
            isReviewed: false,
            reviewedRevisionId: null,
          },
        ],
      });

      await expect(
        service.reviewSystem(reviewer, 'heart', {}),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.revisionCreate).not.toHaveBeenCalled();
    });

    it('signs off only pending structures and records a revision for each', async () => {
      const { service, audit, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue({
        id: 'system-1',
        slug: 'heart',
        name: 'Heart',
        structures: [
          completeStructure({ id: 'structure-1', slug: 'aorta' }),
          completeStructure({
            id: 'structure-2',
            slug: 'atrium',
            isReviewed: false,
            reviewedRevisionId: null,
          }),
        ],
      });

      const result = await service.reviewSystem(reviewer, 'heart', {});

      expect(mocks.revisionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          structureId: 'structure-2',
          kind: 'sign-off',
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

    it('blocks bulk sign-off of self-edited structures when second reviewer is ON', async () => {
      const { service, mocks } = setup();
      mocks.settingsFindUnique.mockResolvedValue({
        requireSecondReviewer: true,
      });
      mocks.systemFindUnique.mockResolvedValue({
        id: 'system-1',
        slug: 'heart',
        name: 'Heart',
        structures: [
          completeStructure({
            id: 'structure-2',
            slug: 'atrium',
            isReviewed: false,
            reviewedRevisionId: null,
          }),
        ],
      });
      mocks.revisionFindMany.mockResolvedValue([
        { structureId: 'structure-2', editorId: 'teacher-1' },
      ]);

      await expect(
        service.reviewSystem(reviewer, 'heart', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.revisionCreate).not.toHaveBeenCalled();
    });
  });

  describe('review library', () => {
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
          contentRevision: 2,
          publicationApprovedAt: null,
          publicationApprovedById: null,
          publicationApprovedRevision: null,
          publicationApprovedBy: null,
          structures: [
            {
              summary: '',
              location: null,
              function: null,
              bloodSupply: null,
              clinicalNotes: null,
              isReviewed: false,
              reviewedRevisionId: null,
            },
            {
              summary: 'Draft text',
              location: null,
              function: null,
              bloodSupply: null,
              clinicalNotes: null,
              isReviewed: false,
              reviewedRevisionId: null,
            },
            {
              ...completeText,
              isReviewed: false,
              reviewedRevisionId: null,
            },
            {
              ...completeText,
              isReviewed: true,
              reviewedRevisionId: 'signoff-1',
            },
          ],
        },
      ]);

      const systems = await service.listSystems();

      expect(systems).toEqual([
        expect.objectContaining({
          slug: 'heart',
          structureCount: 4,
          signedOffCount: 1,
          counts: { empty: 1, draft: 1, pending: 1, reviewed: 1 },
        }),
      ]);
    });

    it('marks the last editor as blocked when second reviewer is ON', async () => {
      const { service, mocks } = setup();
      mocks.settingsFindUnique.mockResolvedValue({
        requireSecondReviewer: true,
      });
      mocks.systemFindUnique.mockResolvedValue({
        id: 'system-1',
        slug: 'heart',
        name: 'Heart',
        latinName: null,
        description: 'Heart',
        modelUrl: null,
        isSample: false,
        isPublished: false,
        sortOrder: 1,
        contentRevision: 1,
        publicationApprovedAt: null,
        publicationApprovedById: null,
        publicationApprovedRevision: null,
        publicationApprovedBy: null,
      });
      mocks.findMany.mockResolvedValue([
        structure({
          isReviewed: false,
          reviewedBy: null,
          reviewedRevisionId: null,
          revisions: [{ editorId: 'teacher-1', createdAt: loadedAt }],
        }),
      ]);

      const result = await service.getSystemStructures('heart', reviewer);

      expect(result.requireSecondReviewer).toBe(true);
      expect(result.structures[0].signOffBlockedBySecondReviewer).toBe(true);
      expect(result.structures[0].lastEditedById).toBe('teacher-1');
    });

    it('returns no structures when the system is missing', async () => {
      const { service, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue(null);

      await expect(service.getSystemStructures('missing')).rejects.toThrow();
    });
  });

  describe('administrator publication approval', () => {
    it('rejects approval while any structure is unsigned and lists it', async () => {
      const { service, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue({
        id: 'system-1',
        slug: 'urinary',
        name: 'Urinary',
        isPublished: false,
        contentRevision: 0,
        publicationApprovedAt: null,
        publicationApprovedById: null,
        publicationApprovedRevision: null,
        structures: [
          completeStructure({ id: 's1', slug: 'kidney' }),
          completeStructure({
            id: 's2',
            slug: 'bladder',
            isReviewed: false,
            reviewedRevisionId: null,
          }),
        ],
      });

      await expect(
        service.approvePublication(admin, 'urinary', {}),
      ).rejects.toThrow(/bladder/);
      expect(mocks.systemUpdate).not.toHaveBeenCalled();
    });

    it('records the approving administrator, timestamp, and current revision', async () => {
      const { service, audit, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue({
        id: 'system-1',
        slug: 'urinary',
        name: 'Urinary',
        isPublished: false,
        contentRevision: 3,
        publicationApprovedAt: null,
        publicationApprovedById: null,
        publicationApprovedRevision: null,
        structures: [completeStructure({ id: 's1', slug: 'kidney' })],
      });
      mocks.systemUpdate.mockResolvedValue({
        id: 'system-1',
        slug: 'urinary',
        name: 'Urinary',
        contentRevision: 3,
        publicationApprovedAt: savedAt,
        publicationApprovedById: 'admin-1',
        publicationApprovedRevision: 3,
        isPublished: false,
      });

      const result = await service.approvePublication(admin, 'urinary', {});

      expect(mocks.systemUpdate).toHaveBeenCalledWith({
        where: { id: 'system-1' },
        data: {
          publicationApprovedAt: expect.any(Date),
          publicationApprovedById: 'admin-1',
          publicationApprovedRevision: 3,
        },
        select: expect.any(Object),
      });
      expect(result.approved).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANATOMY_PUBLICATION_APPROVE',
          actorId: 'admin-1',
          meta: expect.objectContaining({ contentRevision: 3 }),
        }),
      );
    });

    it.each([
      ['reviewer', reviewer],
      ['ordinary teacher', ordinaryTeacher],
      ['student', student],
    ])('rejects approval by a %s', async (_label, user) => {
      const { service } = setup();
      await expect(
        service.approvePublication(user, 'urinary', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('publishing', () => {
    function publishableSystem(overrides: Record<string, unknown> = {}) {
      return {
        id: 'system-1',
        slug: 'urinary',
        name: 'Urinary',
        isPublished: false,
        contentRevision: 2,
        publicationApprovedAt: savedAt,
        publicationApprovedById: 'admin-1',
        publicationApprovedRevision: 2,
        structures: [
          completeStructure({ id: 's1', slug: 'kidney' }),
          completeStructure({ id: 's2', slug: 'bladder' }),
        ],
        ...overrides,
      };
    }

    it('refuses to publish while structures are unsigned and lists them', async () => {
      const { service, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue(
        publishableSystem({
          structures: [
            completeStructure({ id: 's1', slug: 'kidney' }),
            completeStructure({
              id: 's2',
              slug: 'bladder',
              isReviewed: false,
              reviewedRevisionId: null,
            }),
          ],
        }),
      );

      await expect(service.publishSystem(admin, 'urinary', {})).rejects.toThrow(
        /bladder/,
      );
      expect(mocks.systemUpdate).not.toHaveBeenCalled();
    });

    it('refuses to publish without administrator approval', async () => {
      const { service, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue(
        publishableSystem({
          publicationApprovedAt: null,
          publicationApprovedById: null,
          publicationApprovedRevision: null,
        }),
      );

      await expect(
        service.publishSystem(admin, 'urinary', {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mocks.systemUpdate).not.toHaveBeenCalled();
    });

    it('refuses to publish a stale approval', async () => {
      const { service, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue(
        publishableSystem({ publicationApprovedRevision: 1 }),
      );

      await expect(
        service.publishSystem(admin, 'urinary', {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('publishes when sign-off and current-revision approval are both valid', async () => {
      const { service, audit, notifications, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue(publishableSystem());
      mocks.systemUpdate.mockResolvedValue({});
      mocks.userFindMany
        .mockResolvedValueOnce([{ id: 'teacher-9' }])
        .mockResolvedValueOnce([{ id: 'student-1' }]);

      const result = await service.publishSystem(admin, 'urinary', {});

      expect(mocks.queryRaw).toHaveBeenCalled();
      expect(mocks.systemUpdate).toHaveBeenCalledWith({
        where: { id: 'system-1' },
        data: { isPublished: true },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ANATOMY_SYSTEM_PUBLISH' }),
      );
      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['teacher-9', 'student-1'],
          title: 'Anatomy published: Urinary',
        }),
      );
      expect(result).toEqual({
        systemSlug: 'urinary',
        systemName: 'Urinary',
        structureCount: 2,
        isPublished: true,
        changed: true,
      });
    });

    it('is a no-op when the system is already published', async () => {
      const { service, audit, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue(
        publishableSystem({ isPublished: true }),
      );

      const result = await service.publishSystem(admin, 'urinary', {});

      expect(result.changed).toBe(false);
      expect(mocks.systemUpdate).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each([
      ['reviewer', reviewer],
      ['ordinary teacher', ordinaryTeacher],
      ['student', student],
    ])('rejects publishing by a %s', async (_label, user) => {
      const { service, mocks } = setup();
      await expect(
        service.publishSystem(user, 'urinary', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.systemUpdate).not.toHaveBeenCalled();
    });
  });

  describe('unpublishing and revocation', () => {
    it('unpublishes a published system and clears administrator approval', async () => {
      const { service, audit, notifications, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue({
        id: 'system-1',
        slug: 'heart',
        name: 'Heart',
        isPublished: true,
      });
      mocks.userFindMany.mockResolvedValue([{ id: 'teacher-9' }]);

      const result = await service.unpublishSystem(reviewer, 'heart', {});

      expect(mocks.systemUpdate).toHaveBeenCalledWith({
        where: { id: 'system-1' },
        data: expect.objectContaining({
          isPublished: false,
          publicationApprovedAt: null,
          publicationApprovedById: null,
          publicationApprovedRevision: null,
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ANATOMY_SYSTEM_UNPUBLISH' }),
      );
      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['teacher-9'],
          title: 'Anatomy unpublished: Heart',
        }),
      );
      expect(result).toEqual({
        systemSlug: 'heart',
        systemName: 'Heart',
        isPublished: false,
        changed: true,
      });
    });

    it('lets an administrator unpublish through the admin workflow', async () => {
      const { service, mocks } = setup();
      mocks.systemFindUnique.mockResolvedValue({
        id: 'system-1',
        slug: 'heart',
        name: 'Heart',
        isPublished: true,
      });

      const result = await service.unpublishSystem(admin, 'heart', {});
      expect(result.changed).toBe(true);
    });

    it('revokes a sign-off, records a review revision, and invalidates publication', async () => {
      const { service, audit, mocks } = setup();
      mocks.findUnique.mockResolvedValue(structure());
      mocks.revisionCreate.mockResolvedValue({ id: 'revoke-revision' });
      mocks.update.mockResolvedValue(
        structure({
          isReviewed: false,
          reviewedAt: null,
          reviewedById: null,
          reviewedRevisionId: null,
          reviewedBy: null,
        }),
      );
      mocks.findUniqueOrThrow.mockResolvedValue(
        structure({
          isReviewed: false,
          reviewedAt: null,
          reviewedById: null,
          reviewedRevisionId: null,
          reviewedBy: null,
        }),
      );

      const result = await service.revokeStructure(reviewer, 'structure-1', {});

      expect(mocks.revisionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'review-revoked',
          structureId: 'structure-1',
        }),
      });
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: 'structure-1' },
        data: {
          isReviewed: false,
          reviewedAt: null,
          reviewedById: null,
          reviewedRevisionId: null,
        },
      });
      expect(mocks.systemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
            publicationApprovedAt: null,
            contentRevision: { increment: 1 },
          }),
        }),
      );
      expect(result.status).toBe('pending');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ANATOMY_STRUCTURE_REVOKE' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ANATOMY_SIGN_OFF_INVALIDATED' }),
      );
    });

    it('treats revoking an unsigned structure as a no-op', async () => {
      const { service, mocks } = setup();
      mocks.findUnique.mockResolvedValue(
        structure({ isReviewed: false, reviewedBy: null }),
      );

      const result = await service.revokeStructure(reviewer, 'structure-1', {});
      expect(result.alreadyRevoked).toBe(true);
      expect(mocks.revisionCreate).not.toHaveBeenCalled();
    });
  });

  describe('settings and revisions', () => {
    it('defaults requireSecondReviewer to OFF when no row exists', async () => {
      const { service, mocks } = setup();
      mocks.settingsFindUnique.mockResolvedValue(null);

      await expect(service.getSettings()).resolves.toEqual({
        requireSecondReviewer: false,
        updatedAt: null,
      });
    });

    it('lets an administrator update the setting and audits it', async () => {
      const { service, audit, mocks } = setup();

      const result = await service.updateSettings(admin, {
        requireSecondReviewer: true,
      });

      expect(mocks.settingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'global' },
          update: expect.objectContaining({
            requireSecondReviewer: true,
            updatedById: 'admin-1',
          }),
        }),
      );
      expect(result.requireSecondReviewer).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANATOMY_SETTINGS_UPDATE',
          actorId: 'admin-1',
        }),
      );
    });

    it('rejects settings changes by non-administrators', async () => {
      const { service } = setup();
      await expect(
        service.updateSettings(reviewer, { requireSecondReviewer: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lists revisions newest first with editor names and kind', async () => {
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
          kind: 'edit',
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
          kind: 'edit',
        }),
      ]);
    });
  });
});
