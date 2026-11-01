import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { TokenDenylistService } from '../../common/redis/token-denylist.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JwtService } from '@nestjs/jwt';
import type { MailService } from '../mail/mail.service';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
    quit: jest.fn(),
  })),
}));

/** In-memory stand-in for the Redis client so the real denylist logic runs. */
class FakeRedis {
  readonly store = new Map<string, string>();

  // Declared promise-returning to mirror ioredis, but not `async`: there is
  // nothing to await, and the service only ever `await`s these calls.
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return Promise.resolve('OK');
  }

  exists(key: string): Promise<number> {
    return Promise.resolve(this.store.has(key) ? 1 : 0);
  }

  on(): this {
    return this;
  }

  async quit(): Promise<void> {
    // nothing to close
  }
}

function makeConfig(): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      if (key === 'REDIS_FAIL_MODE') return 'closed';
      return undefined;
    }),
  } as unknown as ConfigService;
}

describe('Password reset revokes existing sessions', () => {
  const claimResetToken = jest.fn();
  const usersService = { claimResetToken } as unknown as UsersService;
  const denylist = new TokenDenylistService(makeConfig());
  const redis = new FakeRedis();

  const auth = new AuthService(
    usersService,
    {} as unknown as JwtService,
    makeConfig(),
    {} as unknown as PrismaService,
    {} as unknown as MailService,
    denylist,
  );

  // The token issued before the reset, and the instant it was signed.
  const OLD_IAT = 1_700_000_000;

  beforeAll(() => {
    (denylist as unknown as { client: FakeRedis }).client = redis;
  });

  beforeEach(() => {
    redis.store.clear();
    jest.clearAllMocks();
    claimResetToken.mockResolvedValue('user-1');
  });

  it('rejects a refresh token issued before the reset and accepts one issued after it', async () => {
    // 1. The user had signed in earlier; that refresh token is still valid.
    await expect(
      auth.assertRefreshTokenActive('jti-old', 'user-1', OLD_IAT),
    ).resolves.toBeUndefined();

    // 2. They reset their password.
    await auth.resetPassword('reset-token', 'BrandNewPassw0rd!');

    // 3. The token from before the reset no longer works.
    await expect(
      auth.assertRefreshTokenActive('jti-old', 'user-1', OLD_IAT),
    ).rejects.toThrow(/revoked/i);

    // 4. Signing in again with the new password mints a token after the
    //    revocation instant, and that one keeps working.
    const newIat = Math.floor(Date.now() / 1000) + 1;
    await expect(
      auth.assertRefreshTokenActive('jti-new', 'user-1', newIat),
    ).resolves.toBeUndefined();
  });

  it('stores the new password as a verifiable hash', async () => {
    await auth.resetPassword('reset-token', 'BrandNewPassw0rd!');

    const [, hash] = claimResetToken.mock.calls[0] as [string, string];
    expect(hash).not.toContain('BrandNewPassw0rd!');
    await expect(bcrypt.compare('BrandNewPassw0rd!', hash)).resolves.toBe(true);
  });

  it('does not revoke anyone when the reset token is invalid or expired', async () => {
    claimResetToken.mockResolvedValue(null);

    await expect(
      auth.resetPassword('stale-token', 'BrandNewPassw0rd!'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(redis.store.size).toBe(0);
    // And an existing session is untouched.
    await expect(
      auth.assertRefreshTokenActive('jti-old', 'user-1', OLD_IAT),
    ).resolves.toBeUndefined();
  });

  it('leaves other accounts signed in', async () => {
    await auth.resetPassword('reset-token', 'BrandNewPassw0rd!');

    await expect(
      auth.assertRefreshTokenActive('jti-other', 'user-2', OLD_IAT),
    ).resolves.toBeUndefined();
  });

  it('still enforces the per-token denylist for logout and rotation', async () => {
    await denylist.deny('jti-logged-out', 600);

    await expect(
      auth.assertRefreshTokenActive('jti-logged-out', 'user-1', OLD_IAT),
    ).rejects.toThrow(/revoked/i);
  });
});
