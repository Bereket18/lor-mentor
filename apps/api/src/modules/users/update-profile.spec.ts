import type { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

/**
 * Regression coverage for a mass-assignment defect on PATCH /users/me/profile.
 *
 * The route declares `@Body() body: { fullName?: string }` — a type-only
 * annotation, not a DTO class. Nest's global ValidationPipe skips validation
 * when it has no class metatype, so `whitelist` / `forbidNonWhitelisted` do not
 * apply and the raw parsed body used to reach `prisma.user.update` unchanged.
 * A caller could therefore send `{"fullName":"x","role":"SUPER_ADMIN"}` and
 * promote themselves. The service now copies only the field it owns.
 */
describe('UsersService.updateProfile — allow-list', () => {
  const updateUser = jest.fn();

  const prisma = {
    user: { update: updateUser },
  } as unknown as PrismaService;

  // This suite only exercises updateProfile; mail/config are inert here but
  // required by the constructor.
  const service = new UsersService(
    prisma,
    { sendStaffInvitation: jest.fn() } as never,
    { get: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    updateUser.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      fullName: 'New Name',
      avatarPath: null,
    });
  });

  function submittedData(): Record<string, unknown> {
    expect(updateUser).toHaveBeenCalledTimes(1);
    const call = updateUser.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    return call[0].data;
  }

  it('writes the submitted full name', async () => {
    const result = await service.updateProfile('user-1', {
      fullName: 'New Name',
    });

    expect(submittedData()).toEqual({ fullName: 'New Name' });
    expect(result).toEqual({
      message: 'Profile updated',
      user: {
        id: 'user-1',
        email: 'student@example.com',
        fullName: 'New Name',
        avatarPath: null,
      },
    });
  });

  it('drops a privilege field injected into the body', async () => {
    // Cast through unknown: the point is that a hostile client is not bound by
    // the TypeScript signature at runtime.
    await service.updateProfile('user-1', {
      fullName: 'New Name',
      role: 'SUPER_ADMIN',
    } as unknown as { fullName?: string });

    expect(submittedData()).toEqual({ fullName: 'New Name' });
    expect(submittedData()).not.toHaveProperty('role');
  });

  it('drops every other column a caller might try to set', async () => {
    await service.updateProfile('user-1', {
      fullName: 'New Name',
      isEmailVerified: true,
      status: 'ACTIVE',
      departmentId: 'dept-9',
      id: 'someone-else',
      email: 'attacker@example.com',
      isAnatomyReviewer: true,
    } as unknown as { fullName?: string });

    expect(submittedData()).toEqual({ fullName: 'New Name' });
  });

  it('writes nothing when the name is absent or not a string', async () => {
    await service.updateProfile('user-1', {});
    expect(submittedData()).toEqual({});

    jest.clearAllMocks();
    updateUser.mockResolvedValue({});
    await service.updateProfile('user-1', {
      fullName: 42,
    } as unknown as { fullName?: string });
    expect(submittedData()).toEqual({});
  });
});
