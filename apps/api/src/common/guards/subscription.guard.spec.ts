import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionsService } from '../../modules/subscriptions/subscriptions.service';

/** Build a minimal HTTP ExecutionContext whose request carries `user`. */
function contextWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('SubscriptionGuard', () => {
  let ensureActiveForStudent: jest.Mock;
  let guard: SubscriptionGuard;

  beforeEach(() => {
    ensureActiveForStudent = jest.fn();
    guard = new SubscriptionGuard({
      ensureActiveForStudent,
    } as unknown as SubscriptionsService);
  });

  it('fails closed (returns false) when no user is on the request', async () => {
    await expect(guard.canActivate(contextWithUser(undefined))).resolves.toBe(
      false,
    );
    expect(ensureActiveForStudent).not.toHaveBeenCalled();
  });

  it('delegates to ensureActiveForStudent with the user id and role', async () => {
    const user = { id: 'u1', role: 'STUDENT' };
    await expect(guard.canActivate(contextWithUser(user))).resolves.toBe(true);
    expect(ensureActiveForStudent).toHaveBeenCalledWith('u1', 'STUDENT');
  });

  it('propagates ForbiddenException from the service (unsubscribed student)', async () => {
    ensureActiveForStudent.mockRejectedValue(
      new ForbiddenException('An active subscription is required'),
    );
    await expect(
      guard.canActivate(contextWithUser({ id: 'u2', role: 'STUDENT' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows through when the service resolves (staff or active sub)', async () => {
    ensureActiveForStudent.mockResolvedValue(undefined);
    await expect(
      guard.canActivate(contextWithUser({ id: 'admin1', role: 'ADMIN' })),
    ).resolves.toBe(true);
  });
});
