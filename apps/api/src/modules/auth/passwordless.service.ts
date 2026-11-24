import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthChallenge, User } from '@prisma/client';
import { AuthChallengePurpose, AuthMethod } from '@prisma/client';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { normalizeEmail } from '../../common/normalize-email';
import { AuthMethodsConfig } from './auth-methods.config';
import { AuthMailService } from './auth-mail.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import {
  ADDRESS_CODE_PER_HOUR,
  CHALLENGE_TTL_MS,
  ENROLLMENT_TTL_MS,
  GENERIC_ISSUED_MESSAGE,
  MAX_CHALLENGE_ATTEMPTS,
  MAX_CHALLENGES_PER_DAY,
  MAX_CHALLENGES_PER_HOUR,
  PROOF_FAILED_MESSAGE,
  RESEND_COOLDOWN_MS,
  WINDOW_DAY_MS,
  WINDOW_HOUR_MS,
  type ChallengeStartResult,
  equalizeAuthTiming,
  hashChallengeCode,
  isAdminRole,
  isPlausibleEmail,
  isWellFormedAuthCode,
  randomToken,
  returnPathForRole,
  sanitizeReturnPath,
  sha256,
  verifyChallengeCode,
} from './auth-policy';

/** What a successful proof produces, before the controller sets cookies. */
export type AuthCompletion =
  | {
      next: 'signed_in';
      redirectTo: string;
      session: { accessToken: string; refreshToken: string };
      user: { id: string; email: string; fullName: string; role: string };
    }
  | {
      next: 'complete_profile';
      redirectTo: string;
      /** Plaintext grant token; the controller stores it in an HttpOnly cookie. */
      grantToken: string;
    };

/** Public result of starting or resending a challenge. */
export interface ChallengeStart {
  result: ChallengeStartResult;
  /**
   * Plaintext binding nonce for the cookie. Always present for a well-formed
   * start, including a suppressed one; null only for a malformed resend handle.
   */
  browserNonce: string | null;
}

/**
 * Passwordless sign-in: emailed link plus six-digit code, and the restricted
 * profile step for a first-time account.
 *
 * The rules that shape this service:
 *
 *  - Initiation never reveals account state. Known, unknown, inactive and
 *    administrator addresses all produce the same 202 body and no eligibility
 *    field.
 *  - A proof is consumed exactly once, atomically, and only the request that
 *    wins the claim may issue anything.
 *  - Roles come from the database and are re-read while completing, so an
 *    account promoted mid-flight cannot inherit a passwordless session.
 *  - Every stored credential is a digest; plaintext lives only in memory and
 *    in the email/cookie that carries it.
 */
@Injectable()
export class PasswordlessAuthService {
  private readonly logger = new Logger(PasswordlessAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly mail: AuthMailService,
    private readonly methods: AuthMethodsConfig,
    private readonly limits: AuthRateLimitService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Public method flags. Never account-dependent. */
  methodFlags() {
    return {
      googleEnabled: this.methods.googleEnabled,
      emailLinkEnabled: this.methods.emailLinkEnabled,
    };
  }

  // ── Initiation ──────────────────────────────────────────────────

  /**
   * Start an email challenge.
   *
   * Every well-formed request after validation has the same observable shape:
   * a challenge handle, a 60-second retry hint and a fresh binding cookie. An
   * address that must not receive mail (administrator, inactive, or over the
   * delivery cap) gets a challenge-shaped decoy row instead of a different
   * response. Only the worker knows whether the record is deliverable.
   */
  async startEmail(
    rawEmail: string,
    returnTo?: unknown,
  ): Promise<ChallengeStart> {
    this.assertEmailEnabled();

    const email = normalizeEmail(rawEmail);
    if (!isPlausibleEmail(email)) {
      throw new BadRequestException('Enter a valid email address');
    }

    const returnPath = sanitizeReturnPath(returnTo);
    const user = await this.users.findByEmail(email);
    const admin = Boolean(user && isAdminRole(user.role));
    const inactive = Boolean(user && !user.isActive);

    const recent = await this.prisma.authChallenge.findFirst({
      where: {
        email,
        consumedAt: null,
        supersededAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      // Reuse the active challenge so the code in the email that just went out
      // still works. Rotate the binding so the response always carries one.
      return {
        result: this.genericResult(recent.id),
        browserNonce: await this.rotateBinding(recent.id),
      };
    }

    const allowed = await this.mayIssue(email);
    const deliverable = !admin && !inactive && allowed;

    if (admin) {
      await this.audit('AUTH_PASSWORDLESS_ADMIN_REFUSED', user!.id, {
        method: 'EMAIL_LINK',
      });
    }
    if (!deliverable) {
      await this.audit('AUTH_EMAIL_SUPPRESSED', user?.id ?? null, {
        method: 'EMAIL_LINK',
        reason: admin ? 'ADMIN' : inactive ? 'INACTIVE' : 'CAP',
      });
      if (!admin && !inactive) {
        // Kept for operators; the caller still receives the generic 202.
        this.logger.warn('Email challenge issuance cap reached');
      }
    }

    const purpose = user
      ? AuthChallengePurpose.LOGIN
      : AuthChallengePurpose.SIGNUP;

    const issued = await this.createChallenge({
      purpose,
      email,
      userId: user?.id ?? null,
      returnPath,
      deliverable,
    });

    // Enqueue even for a decoy: the request path, Redis work and response shape
    // must not depend on whether the address is allowed to receive mail.
    await this.enqueueMail(
      email,
      issued,
      user?.id ?? null,
      purpose,
      deliverable,
    );

    return {
      result: this.genericResult(issued.challenge.id),
      browserNonce: issued.browserNonce,
    };
  }

  /**
   * Resend using the bound handle. Supersedes every active email challenge for
   * the address, so the newest email is the only one that can be used.
   */
  async resendEmail(
    challengeId: string,
    browserNonce: string | undefined,
  ): Promise<ChallengeStart> {
    this.assertEmailEnabled();

    const challenge = await this.findChallenge(challengeId);
    if (!challenge) {
      return { result: this.genericResult(challengeId), browserNonce: null };
    }

    // The resend must come from the browser that started the flow. A wrong
    // binding answers exactly like a successful resend and changes nothing.
    if (!this.bindingMatches(challenge, browserNonce)) {
      return {
        result: this.genericResult(challenge.id),
        browserNonce: null,
      };
    }

    if (Date.now() - challenge.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      return {
        result: this.genericResult(challenge.id),
        browserNonce: await this.rotateBinding(challenge.id),
      };
    }

    const user = await this.users.findByEmail(challenge.email);
    const admin = Boolean(user && isAdminRole(user.role));
    const inactive = Boolean(user && !user.isActive);
    const allowed = await this.mayIssue(challenge.email);
    const deliverable = !admin && !inactive && allowed;

    if (admin) {
      await this.audit('AUTH_PASSWORDLESS_ADMIN_REFUSED', user!.id, {
        method: 'EMAIL_LINK',
      });
    }
    if (!deliverable) {
      await this.audit('AUTH_EMAIL_SUPPRESSED', user?.id ?? null, {
        method: 'EMAIL_LINK',
        reason: admin ? 'ADMIN' : inactive ? 'INACTIVE' : 'CAP',
      });
    }

    const issued = await this.createChallenge({
      purpose: challenge.purpose,
      email: challenge.email,
      userId: user?.id ?? null,
      returnPath: challenge.returnPath ?? undefined,
      deliverable,
    });

    await this.enqueueMail(
      challenge.email,
      issued,
      user?.id ?? null,
      challenge.purpose,
      deliverable,
    );

    await this.audit('AUTH_CHALLENGE_SUPERSEDED', user?.id ?? null, {
      method: 'EMAIL_LINK',
    });

    return {
      result: this.genericResult(issued.challenge.id),
      browserNonce: issued.browserNonce,
    };
  }

  // ── Proofs ──────────────────────────────────────────────────────

  /** Redeem the six-digit code from the browser that started the challenge. */
  async verifyCode(
    challengeId: string,
    code: string,
    browserNonce: string | undefined,
  ): Promise<AuthCompletion> {
    this.assertEmailEnabled();
    if (!isWellFormedAuthCode(code)) {
      await equalizeAuthTiming(code ?? '');
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    const challenge = await this.findChallenge(challengeId);
    if (!challenge) {
      await equalizeAuthTiming(code);
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    // Address-wide comparison budget across resends. Counted before the
    // binding check so a submission from the wrong browser still spends this
    // address's budget; exceeding it is indistinguishable on the wire from a
    // wrong code.
    const addressBudget = await this.limits.consumeAddressCode(
      challenge.email,
      { limit: ADDRESS_CODE_PER_HOUR, windowMs: WINDOW_HOUR_MS },
    );
    if (!addressBudget.allowed) {
      await equalizeAuthTiming(code);
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    // A correct code from the wrong browser is still rejected. This is what
    // stops a code seen in a forwarded email from being redeemed elsewhere.
    if (!this.bindingMatches(challenge, browserNonce)) {
      await equalizeAuthTiming(code);
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    // Reserve an attempt before the expensive comparison. The UPDATE requires
    // attempts < MAX, so concurrent submissions cannot exceed the budget.
    const reserved = await this.prisma.authChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        supersededAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: MAX_CHALLENGE_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count !== 1) {
      await equalizeAuthTiming(code);
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    const matches = await verifyChallengeCode(
      challenge.id,
      code,
      this.requirePepper(),
      challenge.codeHash,
    );
    if (!matches) {
      await this.audit('AUTH_CHALLENGE_REJECTED', challenge.userId, {
        method: 'EMAIL_LINK',
        reason: 'BAD_CODE',
      });
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    const claimed = await this.claim(challenge.id);
    if (!claimed) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    return this.finalize(claimed);
  }

  /**
   * Redeem the emailed link.
   *
   * Deliberately does NOT require the original browser binding: the link may be
   * opened on a phone when sign-in started on a laptop. What it does require is
   * an explicit POST carrying the high-entropy link secret and a CSRF token for
   * the receiving browser. The original device's code is invalidated by the
   * single use.
   */
  async confirmLink(
    challengeId: string,
    linkToken: string,
  ): Promise<AuthCompletion> {
    this.assertEmailEnabled();

    if (typeof linkToken !== 'string' || linkToken.length < 20) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    const challenge = await this.findChallenge(challengeId);
    if (!challenge) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    // Reserve an attempt before the comparison, exactly like the code path. The
    // UPDATE requires attempts < MAX, so guessing the link handle shares the
    // same per-challenge budget as guessing the code (P2-6). The 256-bit token
    // makes a correct guess infeasible; this only keeps the abuse matrix
    // uniform and still lets a genuine link redeem while under budget.
    const reserved = await this.prisma.authChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        supersededAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: MAX_CHALLENGE_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count !== 1) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    const expected = Buffer.from(challenge.linkTokenHash, 'utf8');
    const actual = Buffer.from(sha256(linkToken), 'utf8');
    const matches =
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual);
    if (!matches) {
      await this.audit('AUTH_CHALLENGE_REJECTED', challenge.userId, {
        method: 'EMAIL_LINK',
        reason: 'BAD_LINK',
      });
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    const claimed = await this.claim(challenge.id);
    if (!claimed) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    return this.finalize(claimed);
  }

  // ── Profile completion ─────────────────────────────────────────

  /** Read the grant's safe status. No consumption, no session. */
  async grantStatus(grantToken: string | undefined) {
    const grant = await this.findGrant(grantToken);
    if (!grant) throw new NotFoundException('Invalid or expired profile link');
    this.assertGrantMethodEnabled(grant.method);
    return {
      email: grant.email,
      existingAccount: Boolean(grant.userId),
      expiresAt: grant.expiresAt,
    };
  }

  /**
   * Create the account (or finish recovery of one) from a valid grant.
   *
   * Only the fields the student may choose are read from the request. Email is
   * locked to the grant, and role, identifiers and verification flags are never
   * accepted — a client cannot ask to be a teacher.
   *
   * The grant is re-read and consumed inside the same transaction that creates
   * or updates the user. An account that appeared after a newcomer grant is a
   * conflict, not a profile to overwrite; an administrator or inactive account
   * is refused before any mutation. The user row is locked while its role and
   * activity are checked, so a promotion racing this request is seen here.
   */
  async completeProfile(
    grantToken: string | undefined,
    input: {
      fullName: string;
      phoneNumber: string;
      departmentId: string;
      academicYearId: string;
    },
  ): Promise<AuthCompletion> {
    const grant = await this.findGrant(grantToken);
    if (!grant)
      throw new BadRequestException('Invalid or expired profile link');

    const user = await this.prisma.$transaction(async (tx) => {
      const current = await tx.enrollmentGrant.findFirst({
        where: {
          tokenHash: grant.tokenHash,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!current) {
        throw new BadRequestException('Invalid or expired profile link');
      }
      this.assertGrantMethodEnabled(current.method);

      const department = await tx.department.findUnique({
        where: { id: input.departmentId },
      });
      if (!department || department.isArchived) {
        throw new BadRequestException('Selected department is not valid');
      }

      const academicYear = await tx.academicYear.findUnique({
        where: { id: input.academicYearId },
      });
      if (
        !academicYear ||
        academicYear.isArchived ||
        academicYear.departmentId !== input.departmentId
      ) {
        throw new BadRequestException(
          'Selected academic year does not belong to the selected department',
        );
      }

      const byEmail = await tx.user.findUnique({
        where: { email: current.email },
        select: { id: true },
      });

      let existing: { id: string; role: string; isActive: boolean } | null =
        null;
      if (byEmail) {
        // Lock the row, then read the values from inside the lock. A role
        // promotion that is already committed is visible; one that is waiting
        // on this lock runs after the profile transaction.
        const rows = await tx.$queryRaw<
          Array<{ id: string; role: string; isActive: boolean }>
        >`
          SELECT "id", "role"::text AS "role", "isActive"
          FROM "User"
          WHERE "id" = ${byEmail.id}
          FOR UPDATE
        `;
        existing = rows[0] ?? null;
      }

      if (existing) {
        if (!current.userId || existing.id !== current.userId) {
          // The address was taken by a different account, or an account
          // appeared after a newcomer grant. Never overwrite it.
          throw new ConflictException(
            'This email address is no longer available. Start again.',
          );
        }
        if (!existing.isActive || isAdminRole(existing.role)) {
          throw new BadRequestException(
            'This account cannot finish profile setup. Start again or contact support.',
          );
        }
      } else if (current.userId) {
        // The recovery target vanished while the grant was open. Creating a
        // fresh account from this grant would silently change its meaning.
        throw new ConflictException(
          'This profile is no longer available. Start again.',
        );
      }

      // Consume only after every re-resolution check has passed. A later
      // failure rolls this back with the user write.
      const consumed = await tx.enrollmentGrant.updateMany({
        where: {
          id: current.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('Invalid or expired profile link');
      }

      if (existing) {
        // Recovery path: trust only the fields the student just re-entered;
        // never the preparer's values. Password login is already disabled by
        // the recovery step; do not change it again here.
        return tx.user.update({
          where: { id: existing.id },
          data: {
            fullName: input.fullName,
            phoneNumber: input.phoneNumber,
            departmentId: input.departmentId,
            academicYearId: input.academicYearId,
            isEmailVerified: true,
            profileCompletedAt: new Date(),
          },
        });
      }

      // New passwordless account: no usable password. The stored hash is of a
      // discarded random secret, so password login cannot succeed until the
      // student deliberately sets one through the reset flow.
      const discarded = await bcrypt.hash(randomToken(32), 12);
      try {
        return await tx.user.create({
          data: {
            email: current.email,
            passwordHash: discarded,
            fullName: input.fullName,
            phoneNumber: input.phoneNumber,
            departmentId: input.departmentId,
            academicYearId: input.academicYearId,
            isEmailVerified: true,
            passwordLoginEnabled: false,
            profileCompletedAt: new Date(),
            role: 'STUDENT',
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'This email address is no longer available. Start again.',
          );
        }
        throw error;
      }
    });

    await this.audit('AUTH_PROFILE_COMPLETED', user.id, {
      method: grant.method,
    });

    return this.signedIn(user, grant.method, grant.returnPath);
  }

  // ── Internals ───────────────────────────────────────────────────

  /**
   * Whether a new challenge may be issued for this address.
   *
   * Two layers, deliberately:
   *
   *  - Redis gives an atomic, cross-instance window (5/hour, 10/day) so two
   *    replicas cannot both slip a request past the cap;
   *  - the durable AuthChallenge count still backstops a Redis restart and
   *    keeps the cap correct across window boundaries.
   *
   * A refusal is not an error: the caller answers with the generic 202.
   */
  private async mayIssue(email: string): Promise<boolean> {
    const atomic = await this.limits.consumeAddressDelivery(
      email,
      { limit: MAX_CHALLENGES_PER_HOUR, windowMs: WINDOW_HOUR_MS },
      { limit: MAX_CHALLENGES_PER_DAY, windowMs: WINDOW_DAY_MS },
    );
    if (!atomic.allowed) {
      this.logger.warn('Email challenge issuance rate limit reached');
      return false;
    }
    return this.withinIssuanceCaps(email);
  }

  private async withinIssuanceCaps(email: string): Promise<boolean> {
    const [hour, day] = await Promise.all([
      this.prisma.authChallenge.count({
        where: {
          email,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      }),
      this.prisma.authChallenge.count({
        where: {
          email,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    if (hour >= MAX_CHALLENGES_PER_HOUR || day >= MAX_CHALLENGES_PER_DAY) {
      this.logger.warn('Email challenge issuance cap reached');
      return false;
    }
    return true;
  }

  private async createChallenge(input: {
    purpose: AuthChallengePurpose;
    email: string;
    userId: string | null;
    returnPath?: string;
    deliverable: boolean;
  }): Promise<{
    challenge: { id: string; code: string; linkToken: string };
    browserNonce: string;
  }> {
    const pepper = this.requirePepper();
    const id = randomToken(32);
    const linkToken = randomToken(32);
    const browserNonce = randomToken(32);
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashChallengeCode(id, code, pepper);

    // One active challenge per address. Take a transaction-scoped advisory
    // lock keyed by an HMAC of the address before superseding and inserting.
    // Without it, two concurrent starts can both pass the cooldown read and
    // both insert, leaving two active rows (P1-1). The lock is released when
    // the transaction ends; a second caller simply waits its turn, then
    // supersedes the first row before creating its own.
    const lockKey = this.challengeLockKey(input.email);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${lockKey}::bigint)) AS lock`;

      await tx.authChallenge.updateMany({
        where: { email: input.email, consumedAt: null, supersededAt: null },
        data: { supersededAt: new Date() },
      });

      await tx.authChallenge.create({
        data: {
          id,
          purpose: input.purpose,
          email: input.email,
          userId: input.userId,
          linkTokenHash: sha256(linkToken),
          codeHash,
          browserNonceHash: sha256(browserNonce),
          deliverable: input.deliverable,
          expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
          returnPath: input.returnPath ?? null,
        },
      });
    });

    return { challenge: { id, code, linkToken }, browserNonce };
  }

  /**
   * Put the mail on the encrypted queue. Best-effort: a queue failure must not
   * turn into an account oracle, so the caller still gets the generic 202 and
   * the failure is audited without the payload.
   */
  private async enqueueMail(
    email: string,
    issued: {
      challenge: { id: string; code: string; linkToken: string };
    },
    userId: string | null,
    purpose: AuthChallengePurpose,
    deliverable: boolean,
  ): Promise<void> {
    try {
      await this.mail.enqueue({
        challengeId: issued.challenge.id,
        to: email,
        code: issued.challenge.code,
        confirmationLink: this.confirmationLink(
          issued.challenge.id,
          issued.challenge.linkToken,
        ),
        expiresInMinutes: CHALLENGE_TTL_MS / 60_000,
        deliverable,
        userId,
        purpose,
      });
    } catch {
      this.logger.error('Could not enqueue a sign-in email');
      await this.audit('AUTH_EMAIL_DELIVERY_FAILED', userId, {
        method: 'EMAIL_LINK',
      });
    }
  }

  /**
   * Rotate the browser binding for an existing challenge.
   *
   * Cooldown responses return the same handle, so the user's open tab keeps
   * working, but they still receive a fresh binding cookie just like a newly
   * issued challenge. This removes the cookie-presence difference between
   * eligible and suppressed addresses.
   */
  private async rotateBinding(challengeId: string): Promise<string> {
    const browserNonce = randomToken(32);
    await this.prisma.authChallenge.update({
      where: { id: challengeId },
      data: { browserNonceHash: sha256(browserNonce) },
    });
    return browserNonce;
  }

  /** Atomically mark a challenge consumed. Returns the row for the winner only. */
  private async claim(challengeId: string): Promise<AuthChallenge | null> {
    const result = await this.prisma.authChallenge.updateMany({
      where: {
        id: challengeId,
        consumedAt: null,
        supersededAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1) return null;
    return this.prisma.authChallenge.findUnique({ where: { id: challengeId } });
  }

  private async findChallenge(
    challengeId: string,
  ): Promise<AuthChallenge | null> {
    if (typeof challengeId !== 'string' || challengeId.length < 16) return null;
    return this.prisma.authChallenge.findUnique({ where: { id: challengeId } });
  }

  private async findGrant(token: string | undefined) {
    if (!token || token.length < 20) return null;
    return this.prisma.enrollmentGrant.findFirst({
      where: {
        tokenHash: sha256(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  private bindingMatches(
    challenge: AuthChallenge,
    browserNonce: string | undefined,
  ): boolean {
    if (!browserNonce) return false;
    const expected = Buffer.from(challenge.browserNonceHash, 'utf8');
    const actual = Buffer.from(sha256(browserNonce), 'utf8');
    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  }

  /**
   * Turn a claimed challenge into either a session or a profile grant.
   *
   * This is where account state is re-read. The challenge says which address
   * was proved; it never says who that address may become.
   */
  private async finalize(challenge: AuthChallenge): Promise<AuthCompletion> {
    const user = await this.prisma.user.findUnique({
      where: { email: challenge.email },
    });

    if (user && isAdminRole(user.role)) {
      await this.audit('AUTH_PASSWORDLESS_ADMIN_REFUSED', user.id, {
        method: 'EMAIL_LINK',
      });
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }
    if (user && !user.isActive) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    if (!user) {
      await this.audit('AUTH_CHALLENGE_CONSUMED', null, {
        method: 'EMAIL_LINK',
        next: 'complete_profile',
      });
      const grantToken = await this.issueGrant({
        email: challenge.email,
        userId: null,
        method: 'EMAIL_LINK',
        returnPath: challenge.returnPath ?? undefined,
      });
      return {
        next: 'complete_profile',
        redirectTo: '/complete-profile',
        grantToken,
      };
    }

    // Verified local email but an unverified password still on the row means
    // the account may have been pre-hijacked: someone registered this address
    // before its owner ever proved it. Treat the password as attacker-controlled.
    if (!user.isEmailVerified) {
      await this.recoverPreHijackedUser(user);
      await this.audit('AUTH_PREHIJACK_RECOVERED', user.id, {
        method: 'EMAIL_LINK',
      });
      const grantToken = await this.issueGrant({
        email: user.email,
        userId: user.id,
        method: 'EMAIL_LINK',
        returnPath: challenge.returnPath ?? undefined,
      });
      return {
        next: 'complete_profile',
        redirectTo: '/complete-profile',
        grantToken,
      };
    }

    // A passwordless signup whose profile step was never finished.
    if (!user.profileCompletedAt && !user.passwordLoginEnabled) {
      const grantToken = await this.issueGrant({
        email: user.email,
        userId: user.id,
        method: 'EMAIL_LINK',
        returnPath: challenge.returnPath ?? undefined,
      });
      return {
        next: 'complete_profile',
        redirectTo: '/complete-profile',
        grantToken,
      };
    }

    await this.audit('AUTH_CHALLENGE_CONSUMED', user.id, {
      method: 'EMAIL_LINK',
    });
    await this.audit('AUTH_PASSWORDLESS_LOGIN_SUCCEEDED', user.id, {
      method: 'EMAIL_LINK',
    });

    return this.signedIn(user, 'EMAIL_LINK', challenge.returnPath);
  }

  /**
   * Invalidate an attacker-controlled password before letting the real owner in.
   *
   * All of it lands in one transaction so there is no window where the account
   * is verified but the old password still works.
   */
  private async recoverPreHijackedUser(user: User): Promise<void> {
    const discarded = await bcrypt.hash(randomToken(32), 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: discarded,
          passwordLoginEnabled: false,
          isEmailVerified: true,
          failedLoginCount: 0,
          lockoutUntil: null,
          passwordResetToken: null,
          passwordResetExpiry: null,
          profileCompletedAt: null,
          sessionVersion: { increment: 1 },
        },
      }),
      this.prisma.authChallenge.updateMany({
        where: { userId: user.id, consumedAt: null, supersededAt: null },
        data: { supersededAt: new Date() },
      }),
      this.prisma.verificationCode.updateMany({
        where: { userId: user.id, consumedAt: null, supersededAt: null },
        data: { supersededAt: new Date() },
      }),
    ]);
  }

  private async issueGrant(input: {
    email: string;
    userId: string | null;
    method: AuthMethod;
    returnPath?: string;
  }): Promise<string> {
    const token = randomToken(32);
    await this.prisma.enrollmentGrant.create({
      data: {
        id: randomToken(32),
        tokenHash: sha256(token),
        email: input.email,
        userId: input.userId,
        method: input.method,
        browserNonceHash: sha256(token),
        returnPath: input.returnPath ?? null,
        expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS),
      },
    });
    return token;
  }

  /**
   * Revoke the refresh token this browser presented before a fresh sign-in
   * (P1-7).
   *
   * A new cookie pair overwrites the browser's copy, but a previously captured
   * token stays valid until it expires or rotates. Denylisting the presented
   * `jti` closes that window and keeps the existing rotation behaviour.
   *
   * Returns true when the presented token belonged to a different account, so
   * the caller can describe the switch (P1-6). An unreadable or expired token
   * is ignored: there is nothing left to revoke. A Redis failure propagates:
   * continuing would write a new session while silently leaving the old token
   * alive.
   */
  async revokePresentedRefreshToken(
    token: string | undefined,
    newUserId: string,
  ): Promise<boolean> {
    if (!token) return false;
    let payload: { sub: string; jti?: string; exp?: number };
    try {
      payload = await this.auth.verifyRefreshToken(token);
    } catch {
      return false;
    }
    await this.auth.revokeRefreshPayload(payload);
    return payload.sub !== newUserId;
  }

  /** Sign in an eligible user and hand the tokens back to the controller. */
  private async signedIn(
    user: Pick<User, 'id' | 'email' | 'fullName' | 'role'>,
    method: AuthMethod,
    returnPath: string | null,
  ): Promise<AuthCompletion> {
    const session = await this.auth.issueSession(user.id, method);
    return {
      next: 'signed_in',
      redirectTo: returnPathForRole(returnPath, user.role),
      session,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  private confirmationLink(challengeId: string, linkToken: string): string {
    // Read the validated configuration, not the raw process environment (P2-3).
    const base =
      this.config.get<string>('WEB_PUBLIC_URL')?.trim() ??
      'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/auth/email/confirm#challenge=${encodeURIComponent(
      challengeId,
    )}&token=${encodeURIComponent(linkToken)}`;
  }

  private genericResult(challengeId: string): ChallengeStartResult {
    return {
      message: GENERIC_ISSUED_MESSAGE,
      challengeId,
      retryAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    };
  }

  /**
   * Stable 64-bit advisory-lock key for an address. HMAC keeps the raw email
   * out of the lock key and reuses the rate-limit secret that is already
   * required whenever email sign-in is enabled.
   */
  private challengeLockKey(email: string): string {
    const secret = this.methods.rateKeySecret();
    if (!secret) {
      // Fail closed: env validation requires this secret for email sign-in.
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }
    const digest = crypto
      .createHmac('sha256', secret)
      .update(`challenge-lock:${email}`, 'utf8')
      .digest();
    return digest.readBigInt64BE(0).toString();
  }

  private requirePepper(): string {
    const pepper = this.methods.codePepper();
    if (!pepper) {
      // Fail closed: without the pepper a code hash is not the reviewed shape.
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }
    return pepper;
  }

  private assertEmailEnabled(): void {
    if (!this.methods.emailLinkEnabled) {
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }
  }

  /**
   * A grant remembers which method produced it. If that method has since been
   * switched off, the grant must not be completable — otherwise disabling a
   * method would still leave a way in for anyone holding a pending grant.
   */
  private assertGrantMethodEnabled(method: AuthMethod): void {
    if (method === AuthMethod.EMAIL_LINK) {
      this.assertEmailEnabled();
      return;
    }
    if (method === AuthMethod.GOOGLE && !this.methods.googleEnabled) {
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }
  }

  private async audit(
    action: string,
    actorId: string | null,
    meta: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actorId ?? null,
          action,
          entityType: actorId ? 'User' : null,
          entityId: actorId ?? null,
          meta: meta as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Audit must never fail the request, but it also must not be silent in
      // operators' logs.
      this.logger.warn(`Could not write audit event ${action}`);
    }
  }
}
