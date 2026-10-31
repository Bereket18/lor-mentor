import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AnatomyReviewController } from './anatomy-review.controller';
import { AnatomyReviewerGuard } from './anatomy-reviewer.guard';

const WRITE_HANDLERS = [
  'updateStructure',
  'reviewStructure',
  'reviewSystem',
  'revokeStructure',
] as const;

describe('AnatomyReviewController access', () => {
  it('restricts the whole controller to TEACHER', () => {
    const reflector = new Reflector();
    expect(
      reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        AnatomyReviewController,
      ]),
    ).toEqual(['TEACHER']);
  });

  it('applies authentication, role, reviewer, and throttler guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AnatomyReviewController,
    ) as unknown[];

    expect(guards).toEqual(
      expect.arrayContaining([
        JwtAuthGuard,
        RolesGuard,
        AnatomyReviewerGuard,
        UserThrottlerGuard,
      ]),
    );
  });

  it('throttles every write handler per user', () => {
    for (const handler of WRITE_HANDLERS) {
      const fn = AnatomyReviewController.prototype[handler] as object;
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, fn)).toBe(30);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, fn)).toBe(60_000);
    }
  });

  it('does not throttle read handlers', () => {
    for (const handler of [
      'listSystems',
      'getSystemStructures',
      'listRevisions',
    ] as const) {
      const fn = AnatomyReviewController.prototype[handler] as object;
      expect(
        Reflect.getMetadata(`${THROTTLER_LIMIT}default`, fn),
      ).toBeUndefined();
    }
  });
});
