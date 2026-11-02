import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { AnatomyAdminController } from './anatomy-admin.controller';
import { AnatomyReviewerGuard } from './anatomy-reviewer.guard';

const WRITE_HANDLERS = [
  'approvePublication',
  'publishSystem',
  'unpublishSystem',
  'updateSettings',
] as const;

describe('AnatomyAdminController access', () => {
  it('restricts the controller to ADMIN and SUPER_ADMIN', () => {
    const reflector = new Reflector();
    expect(
      reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        AnatomyAdminController,
      ]),
    ).toEqual(['ADMIN', 'SUPER_ADMIN']);
  });

  it('applies authentication, role, and throttler guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AnatomyAdminController,
    ) as unknown[];

    expect(guards).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard, UserThrottlerGuard]),
    );
  });

  it('never uses the anatomy-lab reviewer guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AnatomyAdminController,
    ) as unknown[];
    expect(guards).not.toContain(AnatomyReviewerGuard);

    for (const handler of [
      'approvePublication',
      'publishSystem',
      'unpublishSystem',
      'updateSettings',
      'getSystem',
    ]) {
      const prototype = AnatomyAdminController.prototype as unknown as Record<
        string,
        object
      >;
      const methodGuards =
        (Reflect.getMetadata(GUARDS_METADATA, prototype[handler]) as
          | unknown[]
          | undefined) ?? [];
      expect(methodGuards).not.toContain(AnatomyReviewerGuard);
    }
  });

  it('throttles every write handler per user', () => {
    const prototype = AnatomyAdminController.prototype as unknown as Record<
      string,
      object
    >;
    for (const handler of WRITE_HANDLERS) {
      const fn = prototype[handler];
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, fn)).toBe(30);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, fn)).toBe(60_000);
    }
  });

  it('does not throttle read handlers', () => {
    const prototype = AnatomyAdminController.prototype as unknown as Record<
      string,
      object
    >;
    for (const handler of ['listSystems', 'getSystem', 'getSettings']) {
      const fn = prototype[handler];
      expect(
        Reflect.getMetadata(`${THROTTLER_LIMIT}default`, fn),
      ).toBeUndefined();
    }
  });
});
