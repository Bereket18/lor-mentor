import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  const findUnique = jest.fn();
  const service = new SubscriptionsService({
    subscription: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('reports no subscription as inactive', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.getForUser('student-1')).resolves.toEqual({
      subscription: null,
      isActive: false,
    });
  });

  it('reports an active, unexpired subscription as active', async () => {
    const subscription = {
      status: 'ACTIVE',
      endDate: new Date(Date.now() + 60_000),
      plan: { id: 'plan-1', name: 'Monthly' },
    };
    findUnique.mockResolvedValue(subscription);

    await expect(service.getForUser('student-1')).resolves.toEqual({
      subscription,
      isActive: true,
    });
  });

  it.each([
    ['EXPIRED', new Date(Date.now() + 60_000)],
    ['ACTIVE', new Date(Date.now() - 60_000)],
  ])(
    'treats status %s with end date %s as inactive',
    async (status, endDate) => {
      findUnique.mockResolvedValue({ status, endDate, plan: {} });

      await expect(service.getForUser('student-1')).resolves.toMatchObject({
        isActive: false,
      });
    },
  );

  it.each(['ADMIN', 'SUPER_ADMIN', 'TEACHER'])(
    'allows %s without querying a subscription',
    async (role) => {
      await expect(
        service.ensureActiveForStudent('staff-1', role),
      ).resolves.toBeUndefined();
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('rejects a student without an active subscription', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.ensureActiveForStudent('student-1', 'STUDENT'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
