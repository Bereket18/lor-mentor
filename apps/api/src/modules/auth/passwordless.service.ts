import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthChallenge, User } from '@prisma/client';
import { AuthChallengePurpose, AuthMethod } from '@prisma/client';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { normalizeEmail } from '../../common/normalize-email';
import { AuthMethodsConfig } from './auth-methods.config';
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
  homeForRole,
  isAdminRole,
  isPlausibleEmail,
  isWellFormedAuthCode,
  randomToken,
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
  /** Plaintext binding nonce for the cookie, or null when nothing was issued. */
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
    private readonly mail: MailService,
    private readonly methods: AuthMethodsConfig,
    private readonly limits: AuthRateLimitService,
    private readonly auth: AuthService,
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
   * Returns the same 202-equivalent data for every well-formed address. When
   * the address belongs to an administrator, is inactive, or is inside the
   * cooldown, no new row is written and no mail is sent — but the caller cannot
   * tell.
   */
  async startEmail(rawEmail: string, returnTo?: unknown): Promise<ChallengeStart> {
    this.assertEmailEnabled();

    const email = normalizeEmail(rawEmail);
    if (!isPlausibleEmail(email)) {
      throw new BadRequestException('Enter a valid email address');
    }

    const returnPath = sanitizeReturnPath(returnTo);
    const user = await this.users.findByEmail(email);

    if (user && isAdminRole(user.role)) {
      await this.audit('AUTH_PASSWORDLESS_ADMIN_REFUSED', user.id, {
        method: 'EMAIL_LINK',
      });
      return this.suppressed();
    }
    if (user && !user.isActive) {
      return this.suppressed();
    }

    const recent = await this.prisma.authChallenge.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      // Answer with the challenge already issued so the code in the email that
      // just went out still works. Nothing new is sent or written.
      return {
        result: this.genericResult(recent.id),
        browserNonce: null,
      };
    }

    if (!(await this.mayIssue(email))) {
      return this.suppressed();
    }

    const purpose = user
      ? AuthChallengePurpose.LOGIN
      : AuthChallengePurpose.SIGNUP;

    const issued = await this.createChallenge({
      purpose,
      email,
      userId: user?.id ?? null,
      returnPath,
    });

    await this.deliver(email, issued, user?.id ?? null, purpose);

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
        browserNonce: null,
      };
    }

    const user = await this.users.findByEmail(challenge.email);
    if (user && isAdminRole(user.role)) {
      return this.suppressed();
    }

    if (!(await this.mayIssue(challenge.email))) {
      return this.suppressed();
    }

    const issued = await this.createChallenge({
      purpose: challenge.purpose,
      email: challenge.email,
      userId: user?.id ?? null,
      returnPath: challenge.returnPath ?? undefined,
    });

    await this.deliver(
      challenge.email,
      issued,
      user?.id ?? null,
      challenge.purpose,
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

    const expected = Buffer.from(challenge.linkTokenHash, 'utf8');
    const actual = Buffer.from(sha256(linkToken), 'utf8');
    const matches =
      expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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
    if (!grant) throw new BadRequestException('Invalid or expired profile link');
    this.assertGrantMethodEnabled(grant.method);

    const department = await this.prisma.department.findUnique({
      where: { id: input.departmentId },
    });
    if (!department || department.isArchived) {
      throw new BadRequestException('Selected department is not valid');
    }

    const academicYear = await this.prisma.academicYear.findUnique({
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

    const consumed = await this.prisma.enrollmentGrant.updateMany({
      where: {
        id: grant.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('Invalid or expired profile link');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: grant.email },
      select: { id: true },
    });

    if (existing && grant.userId && existing.id !== grant.userId) {
      // The address was taken by a different account while the grant was open.
      // Refuse rather than overwrite; support resolves it.
      throw new ConflictException(
        'This email address is no longer available. Start again.',
      );
    }

    const user = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        // Recovery path: the grant's user exists (unverified account whose
        // password was invalidated). Trust only the fields the student just
        // re-entered; never the preparer's values.
        return tx.user.update({
          where: { id: existing.id },
          data: {
            fullName: input.fullName,
            phoneNumber: input.phoneNumber,
            departmentId: input.departmentId,
            academicYearId: input.academicYearId,
            isEmailVerified: true,
            profileCompletedAt: new Date(),
            passwordLoginEnabled: false,
          },
        });
      }

      // New passwordless account: no usable password. The stored hash is of a
      // discarded random secret, so password login cannot succeed until the
      // student deliberately sets one through the reset flow.
      const discarded = await bcrypt.hash(randomToken(32), 12);
      return tx.user.create({
        data: {
          email: grant.email,
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

    await this.prisma.$transaction([
      this.prisma.authChallenge.updateMany({
        where: { email: input.email, consumedAt: null, supersededAt: null },
        data: { supersededAt: new Date() },
      }),
      this.prisma.authChallenge.create({
        data: {
          id,
          purpose: input.purpose,
          email: input.email,
          userId: input.userId,
          linkTokenHash: sha256(linkToken),
          codeHash,
          browserNonceHash: sha256(browserNonce),
          expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
          returnPath: input.returnPath ?? null,
        },
      }),
    ]);

    return { challenge: { id, code, linkToken }, browserNonce };
  }

  /** Send the sign-in email. Best-effort; never turns into an account oracle. */
  private async deliver(
    email: string,
    issued: {
      challenge: { id: string; code: string; linkToken: string };
    },
    userId: string | null,
    purpose: AuthChallengePurpose,
  ): Promise<void> {
    try {
      await this.mail.sendAuthSignIn({
        to: email,
        code: issued.challenge.code,
        confirmationLink: this.confirmationLink(
          issued.challenge.id,
          issued.challenge.linkToken,
        ),
        expiresInMinutes: CHALLENGE_TTL_MS / 60_000,
      });
    } catch {
      this.logger.error('Could not send a sign-in email (SMTP failure)');
      await this.audit('AUTH_EMAIL_DELIVERY_FAILED', userId, {
        method: 'EMAIL_LINK',
      });
      return;
    }

    await this.audit('AUTH_EMAIL_REQUESTED', userId, {
      method: 'EMAIL_LINK',
      purpose,
    });
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

  private async findChallenge(challengeId: string): Promise<AuthChallenge | null> {
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
      expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
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

  /** Sign in an eligible user and hand the tokens back to the controller. */
  private async signedIn(
    user: Pick<User, 'id' | 'email' | 'fullName' | 'role'>,
    method: AuthMethod,
    returnPath: string | null,
  ): Promise<AuthCompletion> {
    const session = await this.auth.issueSession(user.id, method);
    return {
      next: 'signed_in',
      redirectTo: sanitizeReturnPath(
        returnPath ?? undefined,
        homeForRole(user.role),
      ),
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
    const base = process.env.WEB_PUBLIC_URL?.trim() ?? 'http://localhost:3000';
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

  /** The generic 202 shape used when nothing was actually issued. */
  private suppressed(): ChallengeStart {
    return { result: this.genericResult(randomToken()), browserNonce: null };
  }

  private requirePepper(): string {
    const pepper = this.methods.codePepper();
    if (!pepper) {
      // Fail closed: without the pepper a code hash is not the reviewed shape.
      throw new ServiceUnavailableException('Sign-in is not available right now');
    }
    return pepper;
  }

  private assertEmailEnabled(): void {
    if (!this.methods.emailLinkEnabled) {
      throw new ServiceUnavailableException('Sign-in is not available right now');
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
      throw new ServiceUnavailableException('Sign-in is not available right now');
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
