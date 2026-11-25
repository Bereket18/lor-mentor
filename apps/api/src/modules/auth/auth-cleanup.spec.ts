import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  AUTH_CLEANUP_INTERVAL_MS,
  AUTH_CLEANUP_TX_TIMEOUT_MS,
  purgeExpiredAuthRows,
} from './auth-cleanup';
import { AuthCleanupService } from './auth-cleanup.service';

function buildPrisma(options: { acquired?: boolean } = {}) {
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ acquired: options.acquired ?? true }]),
    authChallenge: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    enrollmentGrant: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    authOAuthTransaction: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (arg: unknown, _options?: unknown): Promise<unknown> =>
        (arg as (client: typeof tx) => Promise<unknown>)(tx),
    ),
  };

  return { prisma, tx };
}

describe('purgeExpiredAuthRows', () => {
  it('takes the advisory lock and deletes only rows past the retention floor', async () => {
    const { prisma, tx } = buildPrisma();
    tx.authChallenge.deleteMany.mockResolvedValue({ count: 3 });
    tx.enrollmentGrant.deleteMany.mockResolvedValue({ count: 2 });
    tx.authOAuthTransaction.deleteMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-11-23T12:00:00.000Z');

    const result = await purgeExpiredAuthRows(
      prisma as unknown as PrismaService,
      now,
    );

    expect(result).toEqual({
      challenges: 3,
      grants: 2,
      oauthTransactions: 1,
      durationMs: expect.any(Number),
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: AUTH_CLEANUP_TX_TIMEOUT_MS,
    });

    // The daily issuance cap counts every row created in the last 24 hours,
    // so no challenge younger than that may be removed.
    const challengeWhere = tx.authChallenge.deleteMany.mock.calls[0][0].where;
    expect(challengeWhere.createdAt.lt.toISOString()).toBe(
      '2026-11-22T12:00:00.000Z',
    );
    expect(challengeWhere.OR).toEqual([
      { supersededAt: { not: null } },
      { consumedAt: { not: null } },
      { expiresAt: { lt: new Date('2026-11-23T11:55:00.000Z') } },
    ]);

    // Grants are removed after the same terminal window, or an hour past
    // expiry; nothing counts grant rows any more.
    const grantWhere = tx.enrollmentGrant.deleteMany.mock.calls[0][0].where;
    expect(grantWhere.OR).toEqual([
      {
        consumedAt: { not: null },
        createdAt: { lt: new Date('2026-11-22T12:00:00.000Z') },
      },
      { expiresAt: { lt: new Date('2026-11-23T11:00:00.000Z') } },
    ]);

    // Expired OAuth transactions are removed a fixed hour after expiry.
    const oauthWhere =
      tx.authOAuthTransaction.deleteMany.mock.calls[0][0].where;
    expect(oauthWhere.expiresAt.lt.toISOString()).toBe(
      '2026-11-23T11:00:00.000Z',
    );
  });

  it('deletes nothing when another instance holds the lock', async () => {
    const { prisma, tx } = buildPrisma({ acquired: false });

    const result = await purgeExpiredAuthRows(
      prisma as unknown as PrismaService,
    );

    expect(result).toBeNull();
    expect(tx.authChallenge.deleteMany).not.toHaveBeenCalled();
    expect(tx.enrollmentGrant.deleteMany).not.toHaveBeenCalled();
    expect(tx.authOAuthTransaction.deleteMany).not.toHaveBeenCalled();
  });
});

describe('AuthCleanupService', () => {
  it('reports the removed counts when a sweep deletes rows', async () => {
    const { prisma, tx } = buildPrisma();
    tx.authChallenge.deleteMany.mockResolvedValue({ count: 4 });
    tx.enrollmentGrant.deleteMany.mockResolvedValue({ count: 1 });
    tx.authOAuthTransaction.deleteMany.mockResolvedValue({ count: 2 });
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const service = new AuthCleanupService(
      prisma as unknown as PrismaService,
    );

    const result = await service.runScheduled();

    expect(result?.challenges).toBe(4);
    expect(result?.grants).toBe(1);
    expect(result?.oauthTransactions).toBe(2);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'auth_cleanup_removed challenges=4 grants=1 oauth_transactions=2',
      ),
    );
    log.mockRestore();
  });

  it('logs and swallows a failed sweep so the timer cannot crash the API', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('database gone')),
    };
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const service = new AuthCleanupService(
      prisma as unknown as PrismaService,
    );

    await expect(service.runScheduled()).resolves.toBeNull();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('auth_cleanup_failed database gone'),
    );
    error.mockRestore();
  });

  it('sweeps once at boot, hourly after that, and stops on shutdown', async () => {
    jest.useFakeTimers();
    try {
      const { prisma } = buildPrisma();
      const service = new AuthCleanupService(
        prisma as unknown as PrismaService,
      );

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(AUTH_CLEANUP_INTERVAL_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);

      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(AUTH_CLEANUP_INTERVAL_MS * 3);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
