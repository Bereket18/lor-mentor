import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import { UsersService } from './users.service';

/**
 * Financial records must survive account deletion.
 *
 * Before this change `cascadeDeleteUser` deleted every Payment and
 * Subscription row belonging to the account. Those rows are the college's
 * accounting record and back receipts already issued to students, so an
 * admin deleting a user silently destroyed financial history with no way back.
 * There is no approved retention policy, so the safe behaviour is to refuse
 * the delete and point at deactivation.
 */
describe('UsersService — financial record retention', () => {
  const findUniqueUser = jest.fn();
  const countPayments = jest.fn();
  const countSubscriptions = jest.fn();
  const transaction = jest.fn();

  const prisma = {
    user: { findUnique: findUniqueUser },
    payment: { count: countPayments },
    subscription: { count: countSubscriptions },
    $transaction: transaction,
  } as unknown as PrismaService;

  const service = new UsersService(
    prisma,
    { sendStaffInvitation: jest.fn() } as unknown as MailService,
    { get: jest.fn() } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findUniqueUser.mockResolvedValue({ role: 'STUDENT' });
    countPayments.mockResolvedValue(0);
    countSubscriptions.mockResolvedValue(0);
  });

  it('refuses to delete an account that has payment history', async () => {
    countPayments.mockResolvedValue(2);

    await expect(
      service.deleteUser('user-1', 'admin-1', 'ADMIN'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction).not.toHaveBeenCalled();
    await expect(
      service.deleteUser('user-1', 'admin-1', 'ADMIN'),
    ).rejects.toThrow(/Deactivate the account instead/);
  });

  it('refuses to delete an account that has a subscription but no payments', async () => {
    countSubscriptions.mockResolvedValue(1);

    await expect(
      service.deleteUser('user-1', 'admin-1', 'ADMIN'),
    ).rejects.toThrow(/1 subscription\(s\)/);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('still deletes an account with no financial history', async () => {
    await expect(
      service.deleteUser('user-1', 'admin-1', 'ADMIN'),
    ).resolves.toEqual({ message: 'User deleted' });

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing self-delete and role protections', async () => {
    await expect(
      service.deleteUser('admin-1', 'admin-1', 'ADMIN'),
    ).rejects.toThrow('You cannot delete your own account');

    expect(countPayments).not.toHaveBeenCalled();
  });
});

describe('UsersService.deleteInactiveUsers — financial record retention', () => {
  const findManyUsers = jest.fn();
  const findManyPayments = jest.fn();
  const findManySubscriptions = jest.fn();
  const transaction = jest.fn();

  const prisma = {
    user: { findMany: findManyUsers },
    payment: { findMany: findManyPayments },
    subscription: { findMany: findManySubscriptions },
    $transaction: transaction,
  } as unknown as PrismaService;

  const service = new UsersService(
    prisma,
    { sendStaffInvitation: jest.fn() } as unknown as MailService,
    { get: jest.fn() } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findManyPayments.mockResolvedValue([]);
    findManySubscriptions.mockResolvedValue([]);
  });

  it('never sweeps an inactive account that has financial history', async () => {
    findManyUsers.mockResolvedValue([
      { id: 'student-1', email: 'a@example.com', fullName: 'A' },
      { id: 'student-2', email: 'b@example.com', fullName: 'B' },
    ]);
    findManyPayments.mockResolvedValue([{ userId: 'student-1' }]);

    const result = await service.deleteInactiveUsers();

    expect(result.deleted).toBe(1);
    expect(result.retained).toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result.message).toContain('retained 1 with financial history');
  });

  it('deletes nothing when every candidate has financial history', async () => {
    findManyUsers.mockResolvedValue([
      { id: 'student-1', email: 'a@example.com', fullName: 'A' },
    ]);
    findManySubscriptions.mockResolvedValue([{ userId: 'student-1' }]);

    const result = await service.deleteInactiveUsers();

    expect(result.deleted).toBe(0);
    expect(result.retained).toBe(1);
    expect(transaction).not.toHaveBeenCalled();
  });
});
