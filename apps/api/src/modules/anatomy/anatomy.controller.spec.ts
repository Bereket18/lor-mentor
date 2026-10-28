import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AnatomyController } from './anatomy.controller';

describe('AnatomyController access', () => {
  it('restricts every anatomy route to students and teachers', () => {
    const reflector = new Reflector();

    expect(
      reflector.getAllAndOverride<string[]>(ROLES_KEY, [AnatomyController]),
    ).toEqual(['STUDENT', 'TEACHER']);
  });

  it('applies authentication before the roles guard', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      AnatomyController,
    );

    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
  });
});
