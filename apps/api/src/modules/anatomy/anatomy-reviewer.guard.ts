import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../../common/types/request-user';

/**
 * Second gate behind RolesGuard. The review controller is already restricted to
 * TEACHER, but a teacher must also be explicitly flagged by the local
 * anatomy:reviewer script. ADMIN and SUPER_ADMIN never pass either gate.
 */
@Injectable()
export class AnatomyReviewerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.role !== 'TEACHER' || user.isAnatomyReviewer !== true) {
      throw new ForbiddenException(
        'Faculty anatomy review is restricted to approved reviewers.',
      );
    }

    return true;
  }
}
