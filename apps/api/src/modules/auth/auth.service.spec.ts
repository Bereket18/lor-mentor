import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TokenDenylistService } from '../../common/redis/token-denylist.service';
import type { MailService } from '../mail/mail.service';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService email verification', () => {
  const findByEmail = jest.fn();
  const createUser = jest.fn();
  const saveVerifyToken =
    jest.fn<
      (userId: string, token: string, expiry: Date) => Promise<unknown>
    >();
  const sendEmailVerification = jest.fn();
  const findDepartment = jest.fn();
  const findAcademicYear = jest.fn();
  const deleteUser = jest.fn();
  const updateUsers = jest.fn();

  const users = {
    findByEmail,
    create: createUser,
    saveVerifyToken,
  } as unknown as UsersService;
  const mail = {
    sendEmailVerification,
  } as unknown as MailService;
  const prisma = {
    department: { findUnique: findDepartment },
    academicYear: { findUnique: findAcademicYear },
    user: { delete: deleteUser, updateMany: updateUsers },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn((key: string) =>
      key === 'WEB_PUBLIC_URL' ? 'https://lormentor.test/' : undefined,
    ),
  } as unknown as ConfigService;
  const service = new AuthService(
    users,
    {} as JwtService,
    config,
    prisma,
    mail,
    {} as TokenDenylistService,
  );

  const registration = {
    email: 'student@example.com',
    password: 'StrongPass123!',
    fullName: 'Test Student',
    phoneNumber: '0911000000',
    departmentId: 'department-1',
    academicYearId: 'year-1',
  };

  beforeEach(() => {
    findByEmail.mockReset();
    createUser.mockReset();
    saveVerifyToken.mockReset();
    sendEmailVerification.mockReset();
    findDepartment.mockReset();
    findAcademicYear.mockReset();
    deleteUser.mockReset();
    updateUsers.mockReset();
  });

  function allowRegistration() {
    findByEmail.mockResolvedValue(null);
    findDepartment.mockResolvedValue({
      id: 'department-1',
      isArchived: false,
    });
    findAcademicYear.mockResolvedValue({
      id: 'year-1',
      departmentId: 'department-1',
      isArchived: false,
    });
    createUser.mockResolvedValue({
      id: 'user-1',
      email: registration.email,
    });
    deleteUser.mockResolvedValue({ id: 'user-1' });
  }

  it('removes a newly-created account when verification email delivery fails', async () => {
    allowRegistration();
    saveVerifyToken.mockResolvedValue({ id: 'user-1' });
    sendEmailVerification.mockRejectedValue(new Error('SMTP rejected'));

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('also removes the account when storing its verification token fails', async () => {
    allowRegistration();
    saveVerifyToken.mockRejectedValue(new Error('Database unavailable'));

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(sendEmailVerification).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('sends a new verification link for an unverified account', async () => {
    findByEmail.mockResolvedValue({
      id: 'user-1',
      email: registration.email,
      isEmailVerified: false,
      emailVerifyToken: 'old-token',
      emailVerifyExpiry: new Date('2026-07-27T09:00:00.000Z'),
    });
    saveVerifyToken.mockResolvedValue({ id: 'user-1' });
    sendEmailVerification.mockResolvedValue(undefined);

    const result = await service.resendVerification(registration.email);

    expect(result.message).toContain('If that email is registered');
    expect(saveVerifyToken).toHaveBeenCalledWith(
      'user-1',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(Date) as Date,
    );
    expect(sendEmailVerification).toHaveBeenCalledWith(
      registration.email,
      expect.stringMatching(
        /^https:\/\/lormentor\.test\/verify-email\?token=[0-9a-f]{64}&email=student%40example\.com$/,
      ),
    );
  });

  it('restores the previous token when replacement email delivery fails', async () => {
    const oldExpiry = new Date('2026-07-27T09:00:00.000Z');
    findByEmail.mockResolvedValue({
      id: 'user-1',
      email: registration.email,
      isEmailVerified: false,
      emailVerifyToken: 'old-token',
      emailVerifyExpiry: oldExpiry,
    });
    saveVerifyToken.mockResolvedValue({ id: 'user-1' });
    sendEmailVerification.mockRejectedValue(new Error('SMTP rejected'));
    updateUsers.mockResolvedValue({ count: 1 });

    await service.resendVerification(registration.email);

    expect(updateUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          emailVerifyToken: 'old-token',
          emailVerifyExpiry: oldExpiry,
        },
      }),
    );
    expect(updateUsers).toHaveBeenCalledTimes(1);
  });

  it('does not send or change tokens for an unknown email', async () => {
    findByEmail.mockResolvedValue(null);

    const result = await service.resendVerification('unknown@example.com');

    expect(result.message).toContain('If that email is registered');
    expect(saveVerifyToken).not.toHaveBeenCalled();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });
});
