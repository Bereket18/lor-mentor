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
  'unpublishSystem',
  'revokeStructure',
] as const;

const REVIEWER_ONLY_HANDLERS = [
  'reviewStructure',
  'reviewSystem',
  'unpublishSystem',
  'revokeStructure',
] as const;

function guardsFor(handler: string): unknown[] {
  const prototype = AnatomyReviewController.prototype as unknown as Record<
    string,
    object
  >;
  return (
    (Reflect.getMetadata(GUARDS_METADATA, prototype[handler]) as
      | unknown[]
      | undefined) ?? []
  );
}

describe('AnatomyReviewController access', () => {
  it('restricts the whole controller to TEACHER', () => {
    const reflector = new Reflector();
    expect(
      reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        AnatomyReviewController,
      ]),
    ).toEqual(['TEACHER']);
  });

  it('applies authentication, role, and throttler guards to the class', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AnatomyReviewController,
    ) as unknown[];

    expect(guards).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard, UserThrottlerGuard]),
    );
  });

  it('does not require reviewer access for ordinary-teacher editing and reads', () => {
    expect(guardsFor('updateStructure')).not.toContain(AnatomyReviewerGuard);
    expect(guardsFor('listSystems')).not.toContain(AnatomyReviewerGuard);
    expect(guardsFor('getSystemStructures')).not.toContain(
      AnatomyReviewerGuard,
    );
    expect(guardsFor('listRevisions')).not.toContain(AnatomyReviewerGuard);
  });

  it('requires explicit reviewer access for sign-off and revocation', () => {
    for (const handler of REVIEWER_ONLY_HANDLERS) {
      expect(guardsFor(handler)).toContain(AnatomyReviewerGuard);
    }
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

  it('has no publish route inside the anatomy lab', () => {
    expect(
      (AnatomyReviewController.prototype as unknown as Record<string, unknown>)
        .publishSystem,
    ).toBeUndefined();
  });
});
