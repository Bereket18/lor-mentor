import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../../common/types/request-user';
import { AnatomyReviewerGuard } from './anatomy-reviewer.guard';

function user(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    fullName: 'User One',
    role: 'TEACHER',
    phoneNumber: null,
    avatarPath: null,
    isActive: true,
    isEmailVerified: true,
    isAnatomyReviewer: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function contextFor(currentUser: RequestUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: currentUser }),
    }),
  } as unknown as ExecutionContext;
}

describe('AnatomyReviewerGuard', () => {
  const guard = new AnatomyReviewerGuard();

  it('allows a TEACHER with the reviewer flag', () => {
    expect(
      guard.canActivate(
        contextFor(user({ role: 'TEACHER', isAnatomyReviewer: true })),
      ),
    ).toBe(true);
  });

  it('blocks a TEACHER without the reviewer flag', () => {
    expect(() =>
      guard.canActivate(
        contextFor(user({ role: 'TEACHER', isAnatomyReviewer: false })),
      ),
    ).toThrow(ForbiddenException);
  });

  it('blocks students even if the flag was set by hand', () => {
    expect(() =>
      guard.canActivate(
        contextFor(user({ role: 'STUDENT', isAnatomyReviewer: true })),
      ),
    ).toThrow(ForbiddenException);
  });

  it('blocks ADMIN and SUPER_ADMIN even if the flag was set by hand', () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN'] as const) {
      expect(() =>
        guard.canActivate(contextFor(user({ role, isAnatomyReviewer: true }))),
      ).toThrow(ForbiddenException);
    }
  });

  it('requires authentication before the reviewer check', () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
