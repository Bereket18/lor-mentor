import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GeminiService } from '../ai/gemini.service';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AnatomyService } from './anatomy.service';

import type { RequestUser } from '../../common/types/request-user';

const student = { id: 'student-1', role: 'STUDENT' } as unknown as RequestUser;

const previewRoles = ['TEACHER'] as const;
const nonPreviewRoles = ['ADMIN', 'SUPER_ADMIN'] as const;

function userWithRole(role: string): RequestUser {
  return { id: `${role.toLowerCase()}-1`, role } as unknown as RequestUser;
}

const aorta = {
  id: 'structure-1',
  systemId: 'system-1',
  slug: 'aorta',
  name: 'Aorta',
  latinName: 'Aorta',
  summary: 'Main artery',
  location: 'Central chest',
  function: 'Distributes blood',
  bloodSupply: 'Vasa vasorum',
  clinicalNotes: 'Aortic tears are emergencies',
  meshName: 'aorta',
  layer: 'great-vessels',
  relatedSlugs: [],
  sortOrder: 1,
  isReviewed: false,
};

describe('AnatomyService', () => {
  const findSystems = jest.fn();
  const findSystem = jest.fn();
  const findStructures = jest.fn();
  const findStructure = jest.fn();
  const ensureActiveForStudent = jest.fn();
  const explainAnatomyStructure = jest.fn();
  const generateAnatomyQuiz = jest.fn();

  const service = new AnatomyService(
    {
      anatomySystem: { findMany: findSystems, findUnique: findSystem },
      anatomyStructure: {
        findMany: findStructures,
        findFirst: findStructure,
      },
    } as unknown as PrismaService,
    { ensureActiveForStudent } as unknown as SubscriptionsService,
    {
      explainAnatomyStructure,
      generateAnatomyQuiz,
    } as unknown as GeminiService,
  );

  beforeEach(() => {
    findSystems.mockReset();
    findSystem.mockReset();
    findStructures.mockReset();
    findStructure.mockReset();
    ensureActiveForStudent.mockReset();
    explainAnatomyStructure.mockReset();
    generateAnatomyQuiz.mockReset();
  });

  it('lists published systems with a structure count', async () => {
    findSystems.mockResolvedValue([
      {
        id: 'system-1',
        slug: 'heart',
        name: 'Heart and circulation',
        latinName: 'Systema cardiovasculare',
        description: 'Sample description',
        modelUrl: '/models/anatomy/heart.v2.glb',
        isSample: true,
        isPublished: true,
        sortOrder: 1,
        _count: { structures: 26 },
      },
    ]);

    await expect(service.listSystems(student)).resolves.toEqual([
      {
        id: 'system-1',
        slug: 'heart',
        name: 'Heart and circulation',
        latinName: 'Systema cardiovasculare',
        description: 'Sample description',
        modelUrl: '/models/anatomy/heart.v2.glb',
        isSample: true,
        isPublished: true,
        sortOrder: 1,
        structureCount: 26,
      },
    ]);
    expect(findSystems).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true } }),
    );
  });

  it.each(previewRoles)(
    'lists published and unpublished systems for %s',
    async (role) => {
      findSystems.mockResolvedValue([
        {
          id: 'system-2',
          slug: 'urinary',
          name: 'Urinary system',
          latinName: 'Systema urinarium',
          description: 'Draft description',
          modelUrl: '/models/anatomy/urinary.v1.glb',
          isSample: false,
          isPublished: false,
          sortOrder: 2,
          _count: { structures: 15 },
        },
      ]);

      await expect(service.listSystems(userWithRole(role))).resolves.toEqual([
        expect.objectContaining({
          slug: 'urinary',
          isPublished: false,
          structureCount: 15,
        }),
      ]);
      expect(findSystems).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    },
  );

  it('throws NotFound for a missing or unpublished system without loading structures', async () => {
    findSystem.mockResolvedValue(null);
    await expect(service.getSystem(student, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    findSystem.mockResolvedValue({
      id: 'system-2',
      slug: 'brain',
      isPublished: false,
      isSample: true,
    });
    await expect(service.getSystem(student, 'brain')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ensureActiveForStudent).not.toHaveBeenCalled();
    expect(findStructures).not.toHaveBeenCalled();
  });

  it.each(nonPreviewRoles)(
    'treats %s as a non-preview role for unpublished systems',
    async (role) => {
      findSystems.mockResolvedValue([]);
      await service.listSystems(userWithRole(role));
      expect(findSystems).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isPublished: true } }),
      );

      findSystem.mockResolvedValue({
        id: 'system-2',
        slug: 'urinary',
        isPublished: false,
        isSample: true,
      });
      await expect(
        service.getSystem(userWithRole(role), 'urinary'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findStructures).not.toHaveBeenCalled();
    },
  );

  it.each(previewRoles)(
    'allows %s to open an unpublished system for preview',
    async (role) => {
      findSystem.mockResolvedValue({
        id: 'system-2',
        slug: 'urinary',
        name: 'Urinary system',
        isPublished: false,
        isSample: false,
      });
      findStructures.mockResolvedValue([]);
      ensureActiveForStudent.mockResolvedValue(undefined);

      await expect(
        service.getSystem(userWithRole(role), 'urinary'),
      ).resolves.toMatchObject({
        slug: 'urinary',
        isPublished: false,
        structureCount: 0,
      });
      expect(ensureActiveForStudent).toHaveBeenCalledWith(
        `${role.toLowerCase()}-1`,
        role,
      );
    },
  );

  it('allows a sample system without a subscription check', async () => {
    findSystem.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
    });
    findStructures.mockResolvedValue([]);

    await expect(service.getSystem(student, 'heart')).resolves.toMatchObject({
      slug: 'heart',
      structureCount: 0,
    });
    expect(ensureActiveForStudent).not.toHaveBeenCalled();
    expect(findStructures).toHaveBeenCalledWith({
      where: { systemId: 'system-1' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        reviewedBy: { select: { fullName: true } },
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
  });

  it('checks the subscription for a non-sample system', async () => {
    findSystem.mockResolvedValue({
      id: 'system-2',
      slug: 'brain',
      name: 'Brain and nervous system',
      isPublished: true,
      isSample: false,
    });
    findStructures.mockResolvedValue([]);
    ensureActiveForStudent.mockResolvedValue(undefined);

    await expect(service.getSystem(student, 'brain')).resolves.toMatchObject({
      slug: 'brain',
    });
    expect(ensureActiveForStudent).toHaveBeenCalledWith('student-1', 'STUDENT');
  });

  it('does not load structure text when the subscription check fails', async () => {
    findSystem.mockResolvedValue({
      id: 'system-2',
      slug: 'brain',
      name: 'Brain and nervous system',
      isPublished: true,
      isSample: false,
    });
    ensureActiveForStudent.mockRejectedValue(
      new ForbiddenException('An active subscription is required'),
    );

    await expect(service.getSystem(student, 'brain')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findSystem).toHaveBeenCalledWith({ where: { slug: 'brain' } });
    expect(findStructures).not.toHaveBeenCalled();
  });

  it('resolves related slugs to names and drops unknown slugs', async () => {
    findSystem.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
    });
    findStructures.mockResolvedValue([
      {
        id: 'structure-1',
        slug: 'aorta',
        name: 'Aorta',
        relatedSlugs: ['left-ventricle', 'missing'],
        sortOrder: 1,
      },
      {
        id: 'structure-2',
        slug: 'left-ventricle',
        name: 'Left ventricle',
        relatedSlugs: ['aorta'],
        sortOrder: 2,
      },
    ]);

    const result = await service.getSystem(student, 'heart');

    expect(result.structures[0].related).toEqual([
      { slug: 'left-ventricle', name: 'Left ventricle' },
    ]);
    expect(result.structures[1].related).toEqual([
      { slug: 'aorta', name: 'Aorta' },
    ]);
  });

  it('exposes the latest revision editor and timestamp', async () => {
    findSystem.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
    });
    const editedAt = new Date('2026-11-01T08:30:00.000Z');
    findStructures.mockResolvedValue([
      {
        id: 'structure-1',
        slug: 'aorta',
        name: 'Aorta',
        relatedSlugs: [],
        sortOrder: 1,
        isReviewed: true,
        reviewedAt: new Date('2026-11-01T09:00:00.000Z'),
        reviewedBy: { fullName: 'Dr Reviewer' },
        revisions: [
          {
            createdAt: editedAt,
            editor: { fullName: 'Dr Editor' },
          },
        ],
      },
    ]);

    const result = await service.getSystem(student, 'heart');

    expect(result.structures[0]).toMatchObject({
      reviewedByName: 'Dr Reviewer',
      lastEditedByName: 'Dr Editor',
      lastEditedAt: editedAt,
    });
  });

  it('requires an active subscription before loading structure text for AI', async () => {
    findSystem.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
    });
    ensureActiveForStudent.mockRejectedValue(
      new ForbiddenException('An active subscription is required'),
    );

    await expect(
      service.generateStructureQuiz(student, 'heart', 'aorta'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findStructure).not.toHaveBeenCalled();
    expect(generateAnatomyQuiz).not.toHaveBeenCalled();
  });

  it('explains a structure with the curated notes', async () => {
    findSystem.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
    });
    findStructure.mockResolvedValue(aorta);
    explainAnatomyStructure.mockResolvedValue('The aorta is the main artery.');

    await expect(
      service.explainStructure(student, 'heart', 'aorta', {
        question: 'Why is it important?',
      }),
    ).resolves.toEqual({
      explanation: 'The aorta is the main artery.',
    });
    expect(ensureActiveForStudent).toHaveBeenCalledWith('student-1', 'STUDENT');
    expect(findStructure).toHaveBeenCalledWith({
      where: { systemId: 'system-1', slug: 'aorta' },
    });
    expect(explainAnatomyStructure).toHaveBeenCalledWith({
      systemName: 'Heart and circulation',
      structureName: 'Aorta',
      latinName: 'Aorta',
      summary: 'Main artery',
      location: 'Central chest',
      function: 'Distributes blood',
      bloodSupply: 'Vasa vasorum',
      clinicalNotes: 'Aortic tears are emergencies',
      question: 'Why is it important?',
    });
  });

  it('generates a structure quiz', async () => {
    findSystem.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
    });
    findStructure.mockResolvedValue(aorta);
    generateAnatomyQuiz.mockResolvedValue({
      questions: [
        {
          text: 'Which vessel is the main artery?',
          options: ['Aorta', 'SVC', 'IVC', 'Pulmonary trunk'],
          correctOption: 'Aorta',
          explanation: 'The aorta distributes blood to the body.',
        },
      ],
    });

    await expect(
      service.generateStructureQuiz(student, 'heart', 'aorta'),
    ).resolves.toEqual({
      system: { slug: 'heart', name: 'Heart and circulation' },
      structure: { slug: 'aorta', name: 'Aorta', latinName: 'Aorta' },
      questions: [
        {
          text: 'Which vessel is the main artery?',
          options: ['Aorta', 'SVC', 'IVC', 'Pulmonary trunk'],
          correctOption: 'Aorta',
          explanation: 'The aorta distributes blood to the body.',
        },
      ],
    });
    expect(generateAnatomyQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ structureName: 'Aorta' }),
    );
  });

  it('refuses AI explain for a row with empty teaching text', async () => {
    findSystem.mockResolvedValue({
      id: 'system-3',
      slug: 'respiratory',
      name: 'Respiratory system',
      isPublished: true,
      isSample: false,
    });
    findStructure.mockResolvedValue({
      ...aorta,
      id: 'structure-empty',
      slug: 'trachea',
      name: 'Trachea',
      summary: '',
      location: '',
      function: '',
      bloodSupply: '',
      clinicalNotes: '',
    });
    ensureActiveForStudent.mockResolvedValue(undefined);

    await expect(
      service.explainStructure(student, 'respiratory', 'trachea', {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(explainAnatomyStructure).not.toHaveBeenCalled();
  });

  it('refuses AI quiz generation for a row with empty teaching text', async () => {
    findSystem.mockResolvedValue({
      id: 'system-3',
      slug: 'respiratory',
      name: 'Respiratory system',
      isPublished: true,
      isSample: false,
    });
    findStructure.mockResolvedValue({
      ...aorta,
      id: 'structure-empty',
      slug: 'trachea',
      name: 'Trachea',
      summary: '',
      location: '',
      function: '',
      bloodSupply: '',
      clinicalNotes: '',
    });
    ensureActiveForStudent.mockResolvedValue(undefined);

    await expect(
      service.generateStructureQuiz(student, 'respiratory', 'trachea'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(generateAnatomyQuiz).not.toHaveBeenCalled();
  });

  it('throws NotFound when the structure does not exist', async () => {
    findSystem.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
    });
    findStructure.mockResolvedValue(null);

    await expect(
      service.explainStructure(student, 'heart', 'missing', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
