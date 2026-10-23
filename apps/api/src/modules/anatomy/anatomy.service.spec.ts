import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AnatomyService } from './anatomy.service';

import type { RequestUser } from '../../common/types/request-user';

const student = { id: 'student-1', role: 'STUDENT' } as unknown as RequestUser;

describe('AnatomyService', () => {
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const ensureActiveForStudent = jest.fn();

  const service = new AnatomyService(
    {
      anatomySystem: { findMany, findUnique },
    } as unknown as PrismaService,
    { ensureActiveForStudent } as unknown as SubscriptionsService,
  );

  beforeEach(() => {
    findMany.mockReset();
    findUnique.mockReset();
    ensureActiveForStudent.mockReset();
  });

  it('lists published systems with a structure count', async () => {
    findMany.mockResolvedValue([
      {
        id: 'system-1',
        slug: 'heart',
        name: 'Heart and circulation',
        latinName: 'Systema cardiovasculare',
        description: 'Sample description',
        modelUrl: '/models/anatomy/heart.glb',
        isSample: true,
        sortOrder: 1,
        _count: { structures: 26 },
      },
    ]);

    await expect(service.listSystems()).resolves.toEqual([
      {
        id: 'system-1',
        slug: 'heart',
        name: 'Heart and circulation',
        latinName: 'Systema cardiovasculare',
        description: 'Sample description',
        modelUrl: '/models/anatomy/heart.glb',
        isSample: true,
        sortOrder: 1,
        structureCount: 26,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true } }),
    );
  });

  it('throws NotFound for a missing or unpublished system', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.getSystem(student, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    findUnique.mockResolvedValue({
      id: 'system-2',
      slug: 'brain',
      isPublished: false,
      isSample: true,
      structures: [],
    });
    await expect(service.getSystem(student, 'brain')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ensureActiveForStudent).not.toHaveBeenCalled();
  });

  it('allows a sample system without a subscription check', async () => {
    findUnique.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
      structures: [],
    });

    await expect(service.getSystem(student, 'heart')).resolves.toMatchObject({
      slug: 'heart',
      structureCount: 0,
    });
    expect(ensureActiveForStudent).not.toHaveBeenCalled();
  });

  it('checks the subscription for a non-sample system', async () => {
    findUnique.mockResolvedValue({
      id: 'system-2',
      slug: 'brain',
      name: 'Brain and nervous system',
      isPublished: true,
      isSample: false,
      structures: [],
    });
    ensureActiveForStudent.mockResolvedValue(undefined);

    await expect(service.getSystem(student, 'brain')).resolves.toMatchObject({
      slug: 'brain',
    });
    expect(ensureActiveForStudent).toHaveBeenCalledWith('student-1', 'STUDENT');
  });

  it('propagates ForbiddenException from the subscription check', async () => {
    findUnique.mockResolvedValue({
      id: 'system-2',
      slug: 'brain',
      name: 'Brain and nervous system',
      isPublished: true,
      isSample: false,
      structures: [],
    });
    ensureActiveForStudent.mockRejectedValue(
      new ForbiddenException('An active subscription is required'),
    );

    await expect(service.getSystem(student, 'brain')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('resolves related slugs to names and drops unknown slugs', async () => {
    findUnique.mockResolvedValue({
      id: 'system-1',
      slug: 'heart',
      name: 'Heart and circulation',
      isPublished: true,
      isSample: true,
      structures: [
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
      ],
    });

    const result = await service.getSystem(student, 'heart');

    expect(result.structures[0].related).toEqual([
      { slug: 'left-ventricle', name: 'Left ventricle' },
    ]);
    expect(result.structures[1].related).toEqual([
      { slug: 'aorta', name: 'Aorta' },
    ]);
  });
});
