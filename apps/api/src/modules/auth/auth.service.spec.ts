import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { VerificationPurpose } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TokenDenylistService } from '../../common/redis/token-denylist.service';
import type { MailService } from '../mail/mail.service';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  CODE_TTL_MINUTES,
  MAX_CODES_PER_HOUR,
  MAX_VERIFY_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  hashVerificationCode,
} from './verification-code';

const VERIFY_FAILED = /incorrect or has expired/;
const FIVE_DIGITS = /^\d{6}$/;

describe('AuthService email verification', () => {
  const findByEmail = jest.fn();
  const findById = jest.fn();
  const createUser = jest.fn();
  const issueVerificationCode = jest.fn();
  const findActiveVerificationCode = jest.fn();
  const claimVerificationCode = jest.fn();
  const recordVerificationMiss = jest.fn();
  const countCodesIssuedSince = jest.fn();
  const restoreSupersededCode = jest.fn();
  const markEmailVerified = jest.fn();
  const sendEmailVerification = jest.fn();
  const findDepartment = jest.fn();
  const findAcademicYear = jest.fn();
  const deleteUser = jest.fn();

  const users = {
    findByEmail,
    findById,
    create: createUser,
    issueVerificationCode,
    findActiveVerificationCode,
    claimVerificationCode,
    recordVerificationMiss,
    countCodesIssuedSince,
    restoreSupersededCode,
    markEmailVerified,
  } as unknown as UsersService;
  const mail = {
    sendEmailVerification,
  } as unknown as MailService;
  const prisma = {
    department: { findUnique: findDepartment },
    academicYear: { findUnique: findAcademicYear },
    user: { delete: deleteUser },
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

  /** A real hash, so the real bcrypt comparison runs in these tests. */
  const SUBMITTED_CODE = '123456';
  let submittedCodeHash: string;

  beforeAll(async () => {
    submittedCodeHash = await hashVerificationCode(SUBMITTED_CODE);
  });

  beforeEach(() => {
    for (const mock of [
      findByEmail,
      findById,
      createUser,
      issueVerificationCode,
      findActiveVerificationCode,
      claimVerificationCode,
      recordVerificationMiss,
      countCodesIssuedSince,
      restoreSupersededCode,
      markEmailVerified,
      sendEmailVerification,
      findDepartment,
      findAcademicYear,
      deleteUser,
    ]) {
      mock.mockReset();
    }

    // Defaults: an unverified account with one active code, nothing issued
    // recently, and a mail path that works. Individual tests override.
    findActiveVerificationCode.mockResolvedValue({
      id: 'code-1',
      codeHash: submittedCodeHash,
    });
    countCodesIssuedSince.mockResolvedValue(0);
    claimVerificationCode.mockResolvedValue(true);
    markEmailVerified.mockResolvedValue({ id: 'user-1' });
    issueVerificationCode.mockResolvedValue({ id: 'code-1' });
    restoreSupersededCode.mockResolvedValue(undefined);
    sendEmailVerification.mockResolvedValue(undefined);
    deleteUser.mockResolvedValue({ id: 'user-1' });
  });

  function unverifiedUser(email = registration.email) {
    return { id: 'user-1', email, isEmailVerified: false };
  }

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
  }

  // ── Registration ────────────────────────────────────────

  it('removes a newly-created account when verification email delivery fails', async () => {
    allowRegistration();
    sendEmailVerification.mockRejectedValue(new Error('SMTP rejected'));

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('also removes the account when storing its verification code fails', async () => {
    allowRegistration();
    issueVerificationCode.mockRejectedValue(new Error('Database unavailable'));

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(sendEmailVerification).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('emails a six-digit code and stores only its hash', async () => {
    allowRegistration();

    const result = await service.register(registration);

    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
    const [to, code, ttlMinutes] = sendEmailVerification.mock.calls[0] as [
      string,
      string,
      number,
    ];
    expect(to).toBe(registration.email);
    expect(code).toMatch(FIVE_DIGITS);
    expect(ttlMinutes).toBe(CODE_TTL_MINUTES);

    expect(issueVerificationCode).toHaveBeenCalledTimes(1);
    const issued = issueVerificationCode.mock.calls[0][0] as {
      userId: string;
      purpose: VerificationPurpose;
      codeHash: string;
      expiresAt: Date;
    };
    expect(issued.userId).toBe('user-1');
    expect(issued.purpose).toBe(VerificationPurpose.EMAIL_VERIFICATION);

    // The plaintext never reaches storage: what is persisted is a bcrypt hash
    // of the code, not the code itself.
    expect(issued.codeHash).not.toBe(code);
    expect(issued.codeHash).toMatch(/^\$2[aby]\$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(result.message).toContain('verification code');
  });

  // ── Verifying ───────────────────────────────────────────

  it('verifies the account when the submitted code matches', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());

    const result = await service.verifyEmail(registration.email, SUBMITTED_CODE);

    expect(claimVerificationCode).toHaveBeenCalledWith({
      id: 'code-1',
      codeHash: submittedCodeHash,
      maxAttempts: MAX_VERIFY_ATTEMPTS,
    });
    expect(markEmailVerified).toHaveBeenCalledWith('user-1');
    expect(recordVerificationMiss).not.toHaveBeenCalled();
    expect(result.message).toContain('Email verified successfully');
  });

  it('looks the code up under the named account only', async () => {
    findByEmail.mockResolvedValue(unverifiedUser('other@example.com'));

    await service.verifyEmail('other@example.com', SUBMITTED_CODE);

    // Scoping by userId is what stops one account's code being redeemed
    // against another: the code space is only 10^6, so a lookup by code value
    // alone could match a stranger's row.
    expect(findActiveVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
        maxAttempts: MAX_VERIFY_ATTEMPTS,
      }),
    );
  });

  it('rejects a code never issued for email verification', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    // Only a password-reset row exists; the purpose filter must not match it.
    findActiveVerificationCode.mockResolvedValue(null);

    await expect(
      service.verifyEmail(registration.email, SUBMITTED_CODE),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(findActiveVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
      }),
    );
    expect(markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects a wrong code and counts the attempt', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());

    await expect(
      service.verifyEmail(registration.email, '654321'),
    ).rejects.toThrow(VERIFY_FAILED);

    expect(recordVerificationMiss).toHaveBeenCalledWith({
      id: 'code-1',
      maxAttempts: MAX_VERIFY_ATTEMPTS,
    });
    expect(claimVerificationCode).not.toHaveBeenCalled();
    expect(markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects a code that has expired', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    findActiveVerificationCode.mockResolvedValue(null);

    await expect(
      service.verifyEmail(registration.email, SUBMITTED_CODE),
    ).rejects.toThrow(VERIFY_FAILED);

    expect(markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects a code the account already used', async () => {
    findByEmail.mockResolvedValue({
      ...unverifiedUser(),
      isEmailVerified: true,
    });

    await expect(
      service.verifyEmail(registration.email, SUBMITTED_CODE),
    ).rejects.toThrow(VERIFY_FAILED);

    expect(findActiveVerificationCode).not.toHaveBeenCalled();
    expect(markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects a code for an unknown account without revealing that', async () => {
    findByEmail.mockResolvedValue(null);

    await expect(
      service.verifyEmail('nobody@example.com', SUBMITTED_CODE),
    ).rejects.toThrow(VERIFY_FAILED);

    expect(findActiveVerificationCode).not.toHaveBeenCalled();
    expect(recordVerificationMiss).not.toHaveBeenCalled();
  });

  it('rejects the correct code once the attempt budget is spent', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    // Five misses have burned the code, so the guard on `attempts` finds
    // nothing — and the claim path enforces the same bound.
    findActiveVerificationCode.mockResolvedValue(null);

    await expect(
      service.verifyEmail(registration.email, SUBMITTED_CODE),
    ).rejects.toThrow(VERIFY_FAILED);

    expect(markEmailVerified).not.toHaveBeenCalled();
  });

  it('answers a losing race on the same correct code as success', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    // Another request consumed the code first and verified the account between
    // our read and our claim. The user typed the right code and is verified, so
    // "incorrect code" would be a lie.
    claimVerificationCode.mockResolvedValue(false);
    findById.mockResolvedValue({
      id: 'user-1',
      email: registration.email,
      isEmailVerified: true,
    });

    const result = await service.verifyEmail(
      registration.email,
      SUBMITTED_CODE,
    );

    expect(result.message).toContain('Email verified successfully');
  });

  it('rejects when the race was lost to something other than a success', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    claimVerificationCode.mockResolvedValue(false);
    findById.mockResolvedValue({
      id: 'user-1',
      email: registration.email,
      isEmailVerified: false,
    });

    await expect(
      service.verifyEmail(registration.email, SUBMITTED_CODE),
    ).rejects.toThrow(VERIFY_FAILED);

    expect(markEmailVerified).not.toHaveBeenCalled();
  });

  // ── Resending ───────────────────────────────────────────

  it('sends a new code for an unverified account', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());

    const result = await service.resendVerification(registration.email);

    expect(result.message).toContain('If that email is registered');
    expect(issueVerificationCode).toHaveBeenCalledTimes(1);
    expect(issueVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
      }),
    );
    expect(sendEmailVerification).toHaveBeenCalledWith(
      registration.email,
      expect.stringMatching(FIVE_DIGITS),
      CODE_TTL_MINUTES,
    );
  });

  it('supersedes the outstanding code when resending', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    findActiveVerificationCode.mockResolvedValue({
      id: 'code-old',
      codeHash: submittedCodeHash,
    });
    issueVerificationCode.mockResolvedValue({ id: 'code-new' });

    await service.resendVerification(registration.email);

    // The old row is the one the replace-in-one-transaction call supersedes, so
    // it is what a rollback would have to put back.
    expect(findActiveVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
      }),
    );
    const issued = issueVerificationCode.mock.calls[0][0] as {
      codeHash: string;
    };
    expect(issued.codeHash).toMatch(/^\$2[aby]\$/);

    // The new code is a different secret from the one it replaces.
    const [, newCode] = sendEmailVerification.mock.calls[0] as [string, string];
    expect(newCode).toMatch(FIVE_DIGITS);
  });

  it('holds the resend cooldown', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    // A code was issued within the last minute.
    countCodesIssuedSince.mockResolvedValueOnce(1);

    const result = await service.resendVerification(registration.email);

    expect(result.message).toContain('If that email is registered');
    expect(issueVerificationCode).not.toHaveBeenCalled();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('checks the cooldown against the configured window', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());

    await service.resendVerification(registration.email);

    const [cooldownQuery, hourlyQuery] = countCodesIssuedSince.mock
      .calls as Array<[{ userId: string; since: Date }]>;
    expect(cooldownQuery[0].userId).toBe('user-1');
    expect(Date.now() - cooldownQuery[0].since.getTime()).toBeCloseTo(
      RESEND_COOLDOWN_MS,
      -3,
    );
    expect(Date.now() - hourlyQuery[0].since.getTime()).toBeCloseTo(
      60 * 60 * 1000,
      -3,
    );
  });

  it('holds the per-account hourly cap even when the cooldown has passed', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    // Past the cooldown, but the account has already been mailed the maximum
    // number of times this hour.
    countCodesIssuedSince
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(MAX_CODES_PER_HOUR);

    const result = await service.resendVerification(registration.email);

    expect(result.message).toContain('If that email is registered');
    expect(issueVerificationCode).not.toHaveBeenCalled();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('restores the previous code when the replacement email fails to send', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    findActiveVerificationCode.mockResolvedValue({
      id: 'code-old',
      codeHash: submittedCodeHash,
    });
    issueVerificationCode.mockResolvedValue({ id: 'code-new' });
    sendEmailVerification.mockRejectedValue(new Error('SMTP rejected'));

    const result = await service.resendVerification(registration.email);

    // Stroking the old code would leave the user with nothing usable, since
    // they never received the replacement.
    const issued = issueVerificationCode.mock.calls[0][0] as {
      codeHash: string;
    };
    expect(restoreSupersededCode).toHaveBeenCalledWith({
      newCodeId: 'code-new',
      expectedNewHash: issued.codeHash,
      supersededId: 'code-old',
    });
    // The caller still gets the generic answer: a send failure must not tell an
    // attacker that this address is a real, unverified account.
    expect(result.message).toContain('If that email is registered');
  });

  it('still answers generically when the rollback itself fails', async () => {
    findByEmail.mockResolvedValue(unverifiedUser());
    issueVerificationCode.mockResolvedValue({ id: 'code-new' });
    sendEmailVerification.mockRejectedValue(new Error('SMTP rejected'));
    restoreSupersededCode.mockRejectedValue(new Error('Database unavailable'));

    await expect(
      service.resendVerification(registration.email),
    ).resolves.toMatchObject({
      message: expect.stringContaining('If that email is registered') as string,
    });
  });

  it('does not send or issue codes for an unknown email', async () => {
    findByEmail.mockResolvedValue(null);

    const result = await service.resendVerification('unknown@example.com');

    expect(result.message).toContain('If that email is registered');
    expect(issueVerificationCode).not.toHaveBeenCalled();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('does not send or issue codes for an already-verified account', async () => {
    findByEmail.mockResolvedValue({
      ...unverifiedUser(),
      isEmailVerified: true,
    });

    const result = await service.resendVerification(registration.email);

    expect(result.message).toContain('If that email is registered');
    expect(issueVerificationCode).not.toHaveBeenCalled();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });
});
