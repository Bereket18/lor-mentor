import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextWithRole(role?: string): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { id: 'user-1', role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows an authenticated route with no role metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    expect(
      new RolesGuard(reflector).canActivate(contextWithRole('STUDENT')),
    ).toBe(true);
  });

  it('allows a user whose role is explicitly permitted', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN', 'SUPER_ADMIN']),
    } as unknown as Reflector;

    expect(
      new RolesGuard(reflector).canActivate(contextWithRole('ADMIN')),
    ).toBe(true);
  });

  it.each([undefined, 'STUDENT', 'TEACHER'])(
    'rejects a missing or unauthorized role (%s)',
    (role) => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
      } as unknown as Reflector;

      expect(() =>
        new RolesGuard(reflector).canActivate(contextWithRole(role)),
      ).toThrow(ForbiddenException);
    },
  );
});
