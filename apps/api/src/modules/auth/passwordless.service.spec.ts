import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import type { AuthMailService } from './auth-mail.service';
import type { AuthRateLimitService } from './auth-rate-limit.service';
import type { AuthService } from './auth.service';
import type { AuthMethodsConfig } from './auth-methods.config';
import { PasswordlessAuthService } from './passwordless.service';
import { sha256 } from './auth-policy';

const PROFILE = {
  fullName: 'Test Student',
  phoneNumber: '0911000000',
  departmentId: 'dept-1',
  academicYearId: 'year-1',
};

/** A challenge row with the columns the service reads. */

function buildHarness() {
  const tx = {
    enrollmentGrant: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    department: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'dept-1', isArchived: false }),
    },
    academicYear: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'year-1',
        isArchived: false,
        departmentId: 'dept-1',
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn(),
    },
    authChallenge: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const prisma = {
    authChallenge: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    enrollmentGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (client: typeof tx) => Promise<unknown>)(tx);
    }),
  };

  const users = {
    findByEmail: jest.fn().mockResolvedValue(null),
  };
  const mail = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  };
  const limits = {
    consumeAddressDelivery: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const methods = {
    emailLinkEnabled: true,
    googleEnabled: false,
    codePepper: () => 'p'.repeat(48),
    rateKeySecret: () => 'r'.repeat(48),
  };
  const auth = {
    issueSession: jest.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    }),
  };

  const service = new PasswordlessAuthService(
    prisma as unknown as PrismaService,
    users as unknown as UsersService,
    mail as unknown as AuthMailService,
    methods as unknown as AuthMethodsConfig,
    limits as unknown as AuthRateLimitService,
    auth as unknown as AuthService,
  );

  return { service, prisma, tx, users, mail, limits, methods, auth };
}

function grantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'grant-1',
    tokenHash: sha256('grant-token-value-long-enough'),
    email: 'student@example.com',
    userId: null,
    method: 'EMAIL_LINK',
    browserNonceHash: 'nonce-hash',
    returnPath: null,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 600_000),
    createdAt: new Date(),
    ...overrides,
  };
}

const GRANT_TOKEN = 'grant-token-value-long-enough';

describe('PasswordlessAuthService initiation', () => {
  it('returns the same observable shape for eligible and suppressed addresses', async () => {
    const { service, prisma, tx, users, mail } = buildHarness();

    const unknown = await service.startEmail('new@example.com');

    users.findByEmail.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
      isActive: true,
    });
    const admin = await service.startEmail('admin@example.com');

    expect(Object.keys(admin.result).sort()).toEqual(
      Object.keys(unknown.result).sort(),
    );
    expect(admin.result.message).toBe(unknown.result.message);
    expect(admin.result.retryAfterSeconds).toBe(
      unknown.result.retryAfterSeconds,
    );
    expect(admin.browserNonce).toEqual(expect.any(String));
    expect(unknown.browserNonce).toEqual(expect.any(String));

    // The decoy row still exists, but only the worker knows not to send it.
    expect(tx.authChallenge.create).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const createCalls = tx.authChallenge.create.mock.calls as Array<
      [{ data: { deliverable: boolean; email: string } }]
    >;
    const decoy = createCalls[1][0];
    expect(decoy.data).toMatchObject({
      deliverable: false,
      email: 'admin@example.com',
    });
    expect(mail.enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ deliverable: false, to: 'admin@example.com' }),
    );
    const audits = prisma.auditLog.create.mock.calls as Array<
      [{ data: { action: string } }]
    >;
    expect(audits.map((call) => call[0].data.action)).toContain(
      'AUTH_PASSWORDLESS_ADMIN_REFUSED',
    );
  });

  it('marks an inactive account as non-deliverable without changing the response', async () => {
    const { service, users, mail } = buildHarness();
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      role: 'STUDENT',
      isActive: false,
    });

    const started = await service.startEmail('inactive@example.com');

    expect(started.browserNonce).toEqual(expect.any(String));
    expect(mail.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ deliverable: false }),
    );
  });

  it('reuses the active challenge and rotates the binding during cooldown', async () => {
    const { service, prisma, tx, mail } = buildHarness();
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'active-challenge',
      createdAt: new Date(),
    });

    const started = await service.startEmail('student@example.com');

    expect(started.result.challengeId).toBe('active-challenge');
    expect(started.browserNonce).toEqual(expect.any(String));
    const updateCalls = prisma.authChallenge.update.mock.calls as Array<
      [{ where: { id: string }; data: { browserNonceHash: string } }]
    >;
    expect(updateCalls[0][0].where).toEqual({ id: 'active-challenge' });
    expect(updateCalls[0][0].data.browserNonceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tx.authChallenge.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(mail.enqueue).not.toHaveBeenCalled();
  });

  it('creates a deliverable challenge for an eligible address', async () => {
    const { service, tx, mail } = buildHarness();

    await service.startEmail('student@example.com');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const createdCalls = tx.authChallenge.create.mock.calls as Array<
      [{ data: { deliverable: boolean; purpose: string; email: string } }]
    >;
    const created = createdCalls[0][0];
    expect(created.data).toMatchObject({
      deliverable: true,
      purpose: 'SIGNUP',
      email: 'student@example.com',
    });
    expect(mail.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        deliverable: true,
        purpose: 'SIGNUP',
        to: 'student@example.com',
      }),
    );
  });

  it('fails closed when the cross-instance limiter is unavailable', async () => {
    const { service, tx, limits, mail } = buildHarness();
    limits.consumeAddressDelivery.mockRejectedValue(
      new ServiceUnavailableException('Sign-in is not available right now'),
    );

    await expect(service.startEmail('student@example.com')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(tx.authChallenge.create).not.toHaveBeenCalled();
    expect(mail.enqueue).not.toHaveBeenCalled();
  });
});

describe('PasswordlessAuthService.completeProfile', () => {
  function profileHarness() {
    const harness = buildHarness();
    const grant = grantRow();
    harness.prisma.enrollmentGrant.findFirst.mockResolvedValue(grant);
    harness.tx.enrollmentGrant.findFirst.mockResolvedValue(grant);
    return { ...harness, grant };
  }

  it('refuses an administrator before mutating the account or consuming the grant', async () => {
    const { service, tx, prisma } = profileHarness();
    const grant = grantRow({ userId: 'admin-1' });
    prisma.enrollmentGrant.findFirst.mockResolvedValue(grant);
    tx.enrollmentGrant.findFirst.mockResolvedValue(grant);
    tx.user.findUnique.mockResolvedValue({ id: 'admin-1' });
    tx.$queryRaw.mockResolvedValue([
      { id: 'admin-1', role: 'ADMIN', isActive: true },
    ]);

    await expect(service.completeProfile(GRANT_TOKEN, PROFILE)).rejects.toThrow(
      BadRequestException,
    );

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.enrollmentGrant.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an inactive account', async () => {
    const { service, tx, prisma } = profileHarness();
    const grant = grantRow({ userId: 'user-1' });
    prisma.enrollmentGrant.findFirst.mockResolvedValue(grant);
    tx.enrollmentGrant.findFirst.mockResolvedValue(grant);
    tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
    tx.$queryRaw.mockResolvedValue([
      { id: 'user-1', role: 'STUDENT', isActive: false },
    ]);

    await expect(
      service.completeProfile(GRANT_TOKEN, {
        ...PROFILE,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('refuses a newcomer grant when an account appeared for the address', async () => {
    const { service, tx } = profileHarness();
    tx.user.findUnique.mockResolvedValue({ id: 'someone-else' });
    tx.$queryRaw.mockResolvedValue([
      { id: 'someone-else', role: 'STUDENT', isActive: true },
    ]);

    await expect(service.completeProfile(GRANT_TOKEN, PROFILE)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('refuses a recovery grant when its user has vanished', async () => {
    const { service, tx, prisma } = profileHarness();
    const grant = grantRow({ userId: 'missing-user' });
    prisma.enrollmentGrant.findFirst.mockResolvedValue(grant);
    tx.enrollmentGrant.findFirst.mockResolvedValue(grant);
    tx.user.findUnique.mockResolvedValue(null);

    await expect(service.completeProfile(GRANT_TOKEN, PROFILE)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('creates a new account only after consuming the grant', async () => {
    const { service, tx, auth } = profileHarness();
    tx.user.create.mockResolvedValue({
      id: 'new-user',
      email: 'student@example.com',
      fullName: PROFILE.fullName,
      role: 'STUDENT',
    });

    const result = await service.completeProfile(GRANT_TOKEN, PROFILE);

    expect(result.next).toBe('signed_in');
    expect(auth.issueSession).toHaveBeenCalledWith('new-user', 'EMAIL_LINK');
    expect(tx.enrollmentGrant.updateMany).toHaveBeenCalledTimes(1);
    expect(
      tx.enrollmentGrant.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.user.create.mock.invocationCallOrder[0]);
    const createCalls = tx.user.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0][0].data).toMatchObject({
      email: 'student@example.com',
      role: 'STUDENT',
      passwordLoginEnabled: false,
    });
  });

  it('updates an existing recovery target without changing its password policy', async () => {
    const { service, tx, prisma } = profileHarness();
    const grant = grantRow({ userId: 'user-1' });
    prisma.enrollmentGrant.findFirst.mockResolvedValue(grant);
    tx.enrollmentGrant.findFirst.mockResolvedValue(grant);
    tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
    tx.$queryRaw.mockResolvedValue([
      { id: 'user-1', role: 'STUDENT', isActive: true },
    ]);
    tx.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      fullName: PROFILE.fullName,
      role: 'STUDENT',
    });

    const result = await service.completeProfile(GRANT_TOKEN, PROFILE);

    expect(result.next).toBe('signed_in');
    const updateCalls = tx.user.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const update = updateCalls[0][0];
    expect(update.data).not.toHaveProperty('passwordLoginEnabled');
    expect(update.data).toMatchObject({
      fullName: PROFILE.fullName,
      isEmailVerified: true,
    });
  });

  it('maps a create race to a conflict', async () => {
    const { service, tx } = profileHarness();
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.completeProfile(GRANT_TOKEN, PROFILE)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects a grant that was consumed concurrently', async () => {
    const { service, tx } = profileHarness();
    tx.enrollmentGrant.findFirst.mockResolvedValue(null);

    await expect(service.completeProfile(GRANT_TOKEN, PROFILE)).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });
});
