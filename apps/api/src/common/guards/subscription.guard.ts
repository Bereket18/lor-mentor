import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SubscriptionsService } from '../../modules/subscriptions/subscriptions.service';
import type { RequestUser } from '../types/request-user';

/**
 * Gates a route behind an active subscription. Apply AFTER JwtAuthGuard (which
 * populates req.user), e.g. `@UseGuards(JwtAuthGuard, SubscriptionGuard)` on a
 * controller or `@UseGuards(SubscriptionGuard)` on a single content endpoint.
 *
 * Delegates to the canonical SubscriptionsService.ensureActiveForStudent, which
 * lets staff (ADMIN / SUPER_ADMIN / TEACHER) through and throws Forbidden for a
 * student without an active subscription. This is the same check materials and
 * the AI tutor already enforce — used here to stop unsubscribed students from
 * pulling paid quiz/flashcard content.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) {
      // JwtAuthGuard must run first; if it didn't, fail closed.
      return false;
    }
    await this.subscriptions.ensureActiveForStudent(user.id, user.role);
    return true;
  }
}
