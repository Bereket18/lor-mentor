import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenDenylistService } from '../../common/redis/token-denylist.service';
import { VerificationPurpose } from '@prisma/client';
import {
  CODE_TTL_MINUTES,
  CODE_TTL_MS,
  MAX_CODES_PER_HOUR,
  MAX_VERIFY_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  equalizeVerificationTiming,
  generateVerificationCode,
  hashVerificationCode,
  verifyCodeHash,
} from './verification-code';

/** Decoded refresh-token payload. `jti`/`exp` are absent on pre-denylist tokens. */
interface RefreshPayload {
  sub: string;
  jti?: string;
  exp?: number;
  /** Issued-at, epoch seconds. Assigned by jsonwebtoken on every token. */
  iat?: number;
}

// Brute-force lockout policy: after MAX_FAILED consecutive failures the account
// is locked for LOCKOUT_MINUTES. The counter resets on any successful login.
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * The one message POST /auth/verify-email returns for every failure: wrong
 * code, expired, already used, superseded by a resend, out of attempts, unknown
 * address, or an account that is already verified.
 *
 * A single string on purpose. Distinguishing "no such account" from "wrong
 * code" would turn the endpoint into a way to find out which addresses are
 * registered here; distinguishing "expired" from "wrong" would confirm that a
 * guess was at least the right shape. The user can act on all of them the same
 * way, which is what the last sentence tells them to do.
 */
const VERIFY_FAILED_MESSAGE =
  'That verification code is incorrect or has expired. Request a new code.';

/**
 * Parse a JWT-style duration (`s`, `m`, `h`, `d`; bare number = seconds).
 * Returns null when the value is not understood.
 */
function parseDurationSeconds(value: string): number | null {
  const match = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3_600,
    d: 86_400,
  };
  return amount * (multipliers[unit] ?? 1);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly denylist: TokenDenylistService,
  ) {
    // How long the "sessions revoked at T" marker must survive: at least as
    // long as a refresh token can live, plus a day of slack so clock skew or a
    // slow restart cannot expire the marker before the tokens it governs. When
    // JWT_REFRESH_EXPIRES_IN is unparseable we keep the marker for 30 days —
    // erring long only costs one Redis key per reset.
    const refreshTtl = parseDurationSeconds(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );
    this.refreshRevocationTtlSeconds = (refreshTtl ?? 30 * 86_400) + 86_400;
  }

  /** TTL for the per-user session-revocation marker (see revokeUserSessions). */
  private readonly refreshRevocationTtlSeconds: number;

  // ── REGISTER ──────────────────────────────────────────
  async register(dto: RegisterDto) {
    // 1. Check if email is already taken
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists',
      );
    }

    // 2. Verify the department exists
    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!department || department.isArchived) {
      throw new BadRequestException('Selected department is not valid');
    }

    // 3. Verify the academic year exists AND belongs to that department
    // This prevents a student submitting a mismatched departmentId/academicYearId
    // pair by manipulating the request directly (Zero Trust — never trust client data)
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: dto.academicYearId },
    });
    if (
      !academicYear ||
      academicYear.isArchived ||
      academicYear.departmentId !== dto.departmentId
    ) {
      throw new BadRequestException(
        'Selected academic year does not belong to the selected department',
      );
    }

    // 4. Hash the password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // 5. Create the user in the database
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      departmentId: dto.departmentId,
      academicYearId: dto.academicYearId,
      phoneNumber: dto.phoneNumber,
    });

    // 6. Issue a 6-digit verification code.
    //
    // Only the bcrypt hash is persisted. `code` exists in memory just long
    // enough to be emailed: it is never written to the database, never returned
    // in the response body and never logged.
    const code = generateVerificationCode();
    const codeHash = await hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // If issuing or sending fails, roll the account back. Otherwise the user is
    // left half-created: unable to sign in (email unverified) and unable to
    // register again (the address is taken).
    try {
      await this.usersService.issueVerificationCode({
        userId: user.id,
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
        codeHash,
        expiresAt,
      });
      await this.mail.sendEmailVerification(user.email, code, CODE_TTL_MINUTES);
    } catch (error) {
      this.logger.error(
        `Verification setup failed for ${user.email}; rolling back registration`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      throw new ServiceUnavailableException(
        'We could not send the verification email. Please try again in a moment.',
      );
    }

    return {
      message:
        'Registration successful. We sent a 6-digit verification code to your email address.',
    };
  }

  // ── RESEND VERIFICATION CODE ──────────────────────────
  // Always returns the same generic message so callers can't probe which
  // emails exist or are unverified (same anti-enumeration stance as
  // forgot-password). The cooldown and the hourly cap deliberately answer the
  // same way: a distinct "slow down" response for a real account and a generic
  // one for an unknown address would give the enumeration away.
  async resendVerification(email: string) {
    const generic = {
      message:
        'If that email is registered and unverified, a new verification code has been sent.',
    };

    const user = await this.usersService.findByEmail(email);
    if (!user || user.isEmailVerified) return generic;

    const purpose = VerificationPurpose.EMAIL_VERIFICATION;
    const now = Date.now();

    // Both limits are enforced against the database rather than by the
    // throttler. The global throttler counts in process memory, so its per-IP
    // limits are per-instance and reset on every deploy — and neither limit
    // here is per-IP in the first place. Both are per-account, which is what
    // stops someone using resend to repeatedly invalidate another person's
    // in-flight code or to use the mail path as a flood target.
    const issuedDuringCooldown = await this.usersService.countCodesIssuedSince({
      userId: user.id,
      purpose,
      since: new Date(now - RESEND_COOLDOWN_MS),
    });
    if (issuedDuringCooldown > 0) return generic;

    const issuedThisHour = await this.usersService.countCodesIssuedSince({
      userId: user.id,
      purpose,
      since: new Date(now - 60 * 60 * 1000),
    });
    if (issuedThisHour >= MAX_CODES_PER_HOUR) {
      this.logger.warn(
        `Verification code hourly cap reached for user ${user.id}; not sending`,
      );
      return generic;
    }

    // Captured before issuing so a failed send can put this code back in play.
    const previouslyActive = await this.usersService.findActiveVerificationCode(
      {
        userId: user.id,
        purpose,
        maxAttempts: MAX_VERIFY_ATTEMPTS,
      },
    );

    const code = generateVerificationCode();
    const codeHash = await hashVerificationCode(code);
    const expiresAt = new Date(now + CODE_TTL_MS);

    let issued: { id: string } | null = null;
    try {
      issued = await this.usersService.issueVerificationCode({
        userId: user.id,
        purpose,
        codeHash,
        expiresAt,
      });
      await this.mail.sendEmailVerification(user.email, code, CODE_TTL_MINUTES);
    } catch (error) {
      this.logger.error(
        `Resend verification code failed for user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Do not strand the user with no usable code when the replacement email
      // never left. The restore is guarded on our new row still being the one
      // in play, so a concurrent resend that already replaced it is not undone.
      if (issued) {
        await this.usersService
          .restoreSupersededCode({
            newCodeId: issued.id,
            expectedNewHash: codeHash,
            supersededId: previouslyActive?.id ?? null,
          })
          .catch(() => {});
      }
    }

    return generic;
  }

  // ── VERIFY EMAIL ──────────────────────────────────────
  //
  // Scoped by email rather than by the code alone. Six digits is only a 10^6
  // keyspace, so a lookup by code value could match a different account's row;
  // addressing the user first keeps the comparison inside one account.
  async verifyEmail(email: string, code: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || user.isEmailVerified) {
      await equalizeVerificationTiming(code);
      throw new BadRequestException(VERIFY_FAILED_MESSAGE);
    }

    const active = await this.usersService.findActiveVerificationCode({
      userId: user.id,
      purpose: VerificationPurpose.EMAIL_VERIFICATION,
      maxAttempts: MAX_VERIFY_ATTEMPTS,
    });

    if (!active) {
      // Nothing to compare against: expired, already used, superseded, or out
      // of attempts. Spend the same time as a real comparison so the response
      // time does not say which of those it was.
      await equalizeVerificationTiming(code);
      throw new BadRequestException(VERIFY_FAILED_MESSAGE);
    }

    if (!(await verifyCodeHash(code, active.codeHash))) {
      // The increment is bounded in the database, so concurrent wrong guesses
      // cannot push the counter past the budget.
      await this.usersService.recordVerificationMiss({
        id: active.id,
        maxAttempts: MAX_VERIFY_ATTEMPTS,
      });
      throw new BadRequestException(VERIFY_FAILED_MESSAGE);
    }

    const claimed = await this.usersService.claimVerificationCode({
      id: active.id,
      codeHash: active.codeHash,
      maxAttempts: MAX_VERIFY_ATTEMPTS,
    });

    if (!claimed) {
      // Lost a race with another request carrying the same correct code. If
      // that request succeeded the account is already verified, so report
      // success rather than telling a user who typed the right code that it was
      // wrong.
      const current = await this.usersService.findById(user.id);
      if (!current?.isEmailVerified) {
        throw new BadRequestException(VERIFY_FAILED_MESSAGE);
      }
    }

    await this.usersService.markEmailVerified(user.id);

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // ── LOGIN ─────────────────────────────────────────────
  async login(dto: LoginDto, ip?: string) {
    // 1. Find the user by email
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      // Important: same message for wrong email OR wrong password
      // Never tell an attacker which one was wrong
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Brute-force lockout — reject early while the account is locked.
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw new UnauthorizedException(
        'Too many failed attempts. This account is temporarily locked. ' +
          'Please try again later or reset your password.',
      );
    }

    // 3. Check the account is active
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Contact support.',
      );
    }

    // 4. Check email is verified
    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in.',
      );
    }

    // 5. Compare the password with the stored hash
    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      await this.recordFailedLogin(user.id, user.failedLoginCount, ip);
      throw new UnauthorizedException('Invalid email or password');
    }

    // 6. Success — clear any accumulated failure state.
    if (user.failedLoginCount > 0 || user.lockoutUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockoutUntil: null },
      });
    }

    // 7. Create the JWT tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isAnatomyReviewer: user.isAnatomyReviewer,
      },
      ...tokens,
    };
  }

  /**
   * Increment the failed-login counter and, once the threshold is reached, lock
   * the account for LOCKOUT_MINUTES (resetting the counter so a fresh window of
   * attempts is available after the lock expires). Every failure — and every
   * resulting lock — is written to the audit log with the originating IP.
   */
  private async recordFailedLogin(
    userId: string,
    currentCount: number,
    ip?: string,
  ) {
    const nextCount = currentCount + 1;
    const willLock = nextCount >= MAX_FAILED_LOGINS;

    await this.prisma.user.update({
      where: { id: userId },
      data: willLock
        ? {
            failedLoginCount: 0,
            lockoutUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
          }
        : { failedLoginCount: nextCount },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: willLock ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: userId,
        ipAddress: ip ?? null,
        meta: {
          attempt: nextCount,
          lockMinutes: willLock ? LOCKOUT_MINUTES : 0,
        },
      },
    });
  }

  // ── REFRESH TOKEN ─────────────────────────────────────
  async refreshTokens(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokens(userId, user.email, user.role);
  }

  async verifyRefreshToken(token: string): Promise<RefreshPayload> {
    return this.jwtService.verifyAsync<RefreshPayload>(token, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
    });
  }

  /** Reject a refresh token that was revoked (logout) or already rotated. */
  async assertRefreshTokenActive(
    jti: string | undefined,
    userId?: string,
    issuedAt?: number,
  ): Promise<void> {
    // A password reset revokes every refresh token issued before it, so a
    // token that was already stolen stops working even though its `jti` was
    // never individually denied. Tokens minted after the reset still pass.
    if (await this.denylist.isSessionRevoked(userId, issuedAt)) {
      throw new UnauthorizedException(
        'Session has been revoked. Please sign in again.',
      );
    }
    if (await this.denylist.isDenied(jti)) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }
  }

  /** Add a decoded refresh token to the denylist until its own expiry. */
  async revokeRefreshPayload(payload: RefreshPayload): Promise<void> {
    if (!payload.jti || !payload.exp) return;
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    await this.denylist.deny(payload.jti, ttl);
  }

  /** Verify + revoke a raw refresh token (used on logout). Ignores bad tokens. */
  async revokeRefreshToken(token: string): Promise<void> {
    try {
      const payload = await this.verifyRefreshToken(token);
      await this.revokeRefreshPayload(payload);
    } catch {
      // Already invalid/expired — nothing to revoke.
    }
  }

  // ── FORGOT PASSWORD ───────────────────────────────────
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);

    // Always return success even if email not found
    // This prevents attackers from discovering which emails exist
    if (!user) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.usersService.saveResetToken(user.id, token, expiry);

    const resetUrl = `${this.publicWebBase()}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.mail.sendPasswordReset(user.email, resetUrl);
    } catch (error) {
      this.logger.error(
        `Password reset email failed for user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  // ── RESET PASSWORD ────────────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    // Hash first so the DB write is instant once we claim the token.
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Atomic claim: one UPDATE that matches the token AND checks expiry.
    // Eliminates the TOCTOU race in the old findByResetToken + updatePassword
    // two-trip flow that caused "new password doesn't work after reset".
    const userId = await this.usersService.claimResetToken(token, passwordHash);

    if (!userId) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    // Changing the password ends every session that existed before it. The
    // user id comes back from the claim so this only ever runs for the account
    // that actually consumed a valid token. Refresh tokens minted from here on
    // (`iat` after this instant) keep working; anything older is rejected by
    // AuthService.assertRefreshTokenActive.
    await this.denylist.revokeUserSessions(
      userId,
      this.refreshRevocationTtlSeconds,
    );

    return { message: 'Password reset successful. You can now log in.' };
  }

  private publicWebBase(): string {
    const webBase =
      this.config.get<string>('WEB_PUBLIC_URL') ??
      this.config.get<string>('APP_URL') ??
      'http://localhost:3000';
    return webBase.replace(/\/$/, '');
  }

  // ── PRIVATE: Generate JWT Tokens ──────────────────────
  private async generateTokens(userId: string, email: string, role: string) {
    // The payload is the data stored inside the token
    // Keep it small — only what we need to identify the user
    const payload = { sub: userId, email, role };

    // Access token — short lived (15 minutes)
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    // Refresh token — longer lived (7 days). The `jti` (unique token id) lets
    // us revoke this exact token server-side on logout / rotation.
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti: crypto.randomUUID() },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      },
    );

    return { accessToken, refreshToken };
  }
}
