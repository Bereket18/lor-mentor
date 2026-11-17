import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { UsersService } from '../../modules/users/users.service';
import { JwtStrategy } from './jwt.strategy';

function makeStrategy(user: Record<string, unknown> | null): JwtStrategy {
  const config = {
    get: (key: string) =>
      key === 'JWT_ACCESS_SECRET' ? 'x'.repeat(40) : undefined,
  } as unknown as ConfigService;
  const users = {
    findById: async () => user,
  } as unknown as UsersService;
  return new JwtStrategy(config, users);
}

const baseUser = {
  id: 'user-1',
  email: 'student@example.com',
  fullName: 'Student',
  role: 'STUDENT',
  phoneNumber: null,
  avatarPath: null,
  isActive: true,
  isEmailVerified: true,
  isAnatomyReviewer: false,
  createdAt: new Date(),
  sessionVersion: 3,
  passwordLoginEnabled: true,
  profileCompletedAt: new Date(),
};

describe('JwtStrategy session enforcement', () => {
  it('accepts a token whose version matches the database', async () => {
    const strategy = makeStrategy(baseUser);
    await expect(
      strategy.validate({ sub: 'user-1', email: 'x', role: 'STUDENT', ver: 3 }),
    ).resolves.toMatchObject({ id: 'user-1' });
  });

  it('rejects a token minted before a session-version increment', async () => {
    const strategy = makeStrategy(baseUser);
    await expect(
      strategy.validate({ sub: 'user-1', email: 'x', role: 'STUDENT', ver: 2 }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('treats a legacy token as version 0', async () => {
    const strategy = makeStrategy(baseUser);
    await expect(
      strategy.validate({ sub: 'user-1', email: 'x', role: 'STUDENT' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a legacy token while the account has never been revoked', async () => {
    const strategy = makeStrategy({ ...baseUser, sessionVersion: 0 });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'x', role: 'STUDENT' }),
    ).resolves.toMatchObject({ id: 'user-1' });
  });

  it('rejects a passwordless session for an administrator', async () => {
    const strategy = makeStrategy({ ...baseUser, role: 'ADMIN' });
    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'x',
        role: 'ADMIN',
        ver: 3,
        am: 'EMAIL_LINK',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a password session for an administrator', async () => {
    const strategy = makeStrategy({ ...baseUser, role: 'SUPER_ADMIN' });
    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'x',
        role: 'SUPER_ADMIN',
        ver: 3,
        am: 'PASSWORD',
      }),
    ).resolves.toMatchObject({ role: 'SUPER_ADMIN' });
  });

  it('rejects a deactivated account', async () => {
    const strategy = makeStrategy({ ...baseUser, isActive: false });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'x', role: 'STUDENT', ver: 3 }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
