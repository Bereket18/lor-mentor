import { BadRequestException, Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import type { AuthMailService } from './auth-mail.service';
import type { AuthRateLimitService } from './auth-rate-limit.service';
import type { AuthService } from './auth.service';
import type { AuthMethodsConfig } from './auth-methods.config';
import { PasswordlessAuthService } from './passwordless.service';
import { AuthMailProcessor } from './auth-mail.processor';
import { sha256 } from './auth-policy';

/**
 * Canary redaction (acceptance plan, section 12 item 4).
 *
 * Every value that must never leave the process — the raw email address, the
 * six-digit code, the link token, the confirmation link and the browser
 * binding — is injected (or read back from the one place it legitimately
 * exists) and then searched for in everything an operator could later read: the
 * HTTP response body, the audit metadata, and the application log.
 *
 * A canary that is never produced would make the assertions vacuous, so each
 * test first proves the secret was actually generated (the mail payload carries
 * it) and only then proves it is redacted everywhere else.
 */

const CANARY_EMAIL = 'canary-redaction-7f3a91cd@example.test';
const CANARY_ADMIN_EMAIL = 'canary-admin-1b2c3d4e@example.test';

/** Every Logger line written while the spy is installed. */
function captureLogs() {
  const lines: string[] = [];
  const methods = ['log', 'error', 'warn', 'debug', 'verbose'] as const;
  const spies = methods.map((method) =>
    jest
      .spyOn(Logger.prototype, method)
      .mockImplementation((...args: unknown[]) => {
        lines.push(args.map((arg) => String(arg)).join(' '));
      }),
  );
  return {
    lines,
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

/** Flatten every string reachable from a value, for substring searching. */
function deepStrings(value: unknown, out: string[] = []): string[] {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => deepStrings(item, out));
    return out;
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      deepStrings(item, out),
    );
  }
  return out;
}

function buildHarness() {
  const tx = {
    authChallenge: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    authChallenge: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (client: typeof tx) => Promise<unknown>)(tx);
    }),
  };
  const users = { findByEmail: jest.fn().mockResolvedValue(null) };
  const mail = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const limits = {
    consumeAddressDelivery: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const methods = {
    emailLinkEnabled: true,
    googleEnabled: false,
    codePepper: () => 'p'.repeat(48),
    rateKeySecret: () => 'r'.repeat(48),
  };
  const auth = {
    issueSession: jest.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    }),
  };

  const service = new PasswordlessAuthService(
    prisma as unknown as PrismaService,
    users as unknown as UsersService,
    mail as unknown as AuthMailService,
    methods as unknown as AuthMethodsConfig,
    limits as unknown as AuthRateLimitService,
    auth as unknown as AuthService,
  );

  return { service, prisma, tx, users, mail, limits };
}

describe('PasswordlessAuthService canary redaction', () => {
  let logs: ReturnType<typeof captureLogs>;
  beforeEach(() => {
    logs = captureLogs();
  });
  afterEach(() => {
    logs.restore();
  });

  it('never lets the code, link token or address reach the response, audit or log', async () => {
    const { service, prisma, mail } = buildHarness();

    const started = await service.startEmail(CANARY_EMAIL, '/dashboard');

    // The secret exists exactly once: on the encrypted mail payload.
    const payload = (mail.enqueue.mock.calls as Array<[Record<string, string>]>)[0][0];
    expect(payload.to).toBe(CANARY_EMAIL);
    const code = payload.code;
    const link = payload.confirmationLink;
    expect(code).toMatch(/^\d{6}$/);
    expect(link).toContain('token=');
    const linkToken = decodeURIComponent(
      link.split('token=')[1] ?? '',
    );
    expect(linkToken.length).toBeGreaterThan(20);

    // Non-vacuous: the payload really carries the secrets we now search for.
    expect(deepStrings(started)).toContain(payload.challengeId);

    // 1. The HTTP response carries only the opaque handle.
    const responseStrings = deepStrings(started.result).join('\n');
    expect(responseStrings).not.toContain(CANARY_EMAIL);
    expect(responseStrings).not.toContain(code);
    expect(responseStrings).not.toContain(linkToken);
    expect(responseStrings).not.toContain(link);
    expect(Object.keys(started.result).sort()).toEqual([
      'challengeId',
      'message',
      'retryAfterSeconds',
    ]);

    // 2. No audit row carries the address, code, token or link.
    const auditBlob = JSON.stringify(
      (prisma.auditLog.create.mock.calls as Array<[{ data: unknown }]>).map(
        (call) => call[0].data,
      ),
    );
    expect(auditBlob).not.toContain(CANARY_EMAIL);
    expect(auditBlob).not.toContain(code);
    expect(auditBlob).not.toContain(linkToken);

    // 3. No log line carries them either.
    const logBlob = logs.lines.join('\n');
    expect(logBlob).not.toContain(CANARY_EMAIL);
    expect(logBlob).not.toContain(code);
    expect(logBlob).not.toContain(linkToken);
    expect(logBlob).not.toContain('token=');
  });

  it('keeps a suppressed administrator address out of the audit and log', async () => {
    const { service, prisma, users, mail } = buildHarness();
    users.findByEmail.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
      isActive: true,
    });

    await service.startEmail(CANARY_ADMIN_EMAIL);

    const auditBlob = JSON.stringify(
      (prisma.auditLog.create.mock.calls as Array<[{ data: unknown }]>).map(
        (call) => call[0].data,
      ),
    );
    // The refusal is recorded, but the address is not part of it.
    expect(auditBlob).toContain('AUTH_PASSWORDLESS_ADMIN_REFUSED');
    expect(auditBlob).toContain('AUTH_EMAIL_SUPPRESSED');
    expect(auditBlob).not.toContain(CANARY_ADMIN_EMAIL);
    expect(logs.lines.join('\n')).not.toContain(CANARY_ADMIN_EMAIL);

    // The decoy still enqueues, so the payload is the only holder of the secret.
    const payload = (mail.enqueue.mock.calls as Array<[Record<string, string>]>)[0][0];
    expect(payload.deliverable).toBe(false);
  });

  it('records a rejected link without echoing the token to the audit or log', async () => {
    const { service, prisma } = buildHarness();
    const presentedToken = 'A'.repeat(43);
    const challengeId = 'canary-challenge-1';
    prisma.authChallenge.findUnique.mockResolvedValue({
      id: challengeId,
      userId: 'user-1',
      email: CANARY_EMAIL,
      linkTokenHash: sha256('a-different-token-entirely'),
      codeHash: 'h',
      browserNonceHash: 'b',
      consumedAt: null,
      supersededAt: null,
      attempts: 0,
      expiresAt: new Date(Date.now() + 600_000),
    });

    await expect(
      service.confirmLink(challengeId, presentedToken),
    ).rejects.toThrow(BadRequestException);

    const auditBlob = JSON.stringify(
      (prisma.auditLog.create.mock.calls as Array<[{ data: unknown }]>).map(
        (call) => call[0].data,
      ),
    );
    expect(auditBlob).toContain('AUTH_CHALLENGE_REJECTED');
    expect(auditBlob).not.toContain(presentedToken);
    expect(auditBlob).not.toContain(CANARY_EMAIL);
    expect(logs.lines.join('\n')).not.toContain(presentedToken);
  });
});

describe('AuthMailProcessor canary redaction', () => {
  const CANARY_CODE = '482915';
  const CANARY_LINK =
    'http://localhost:3000/auth/email/confirm#challenge=canary&token=CANARYLINKTOKENVALUE';

  let logs: ReturnType<typeof captureLogs>;
  beforeEach(() => {
    logs = captureLogs();
  });
  afterEach(() => {
    logs.restore();
  });

  function buildProcessor(overrides: {
    sendAuthSignIn?: jest.Mock;
    deliverable?: boolean;
  }) {
    const payload = {
      challengeId: 'challenge-canary',
      to: CANARY_EMAIL,
      code: CANARY_CODE,
      confirmationLink: CANARY_LINK,
      expiresInMinutes: 10,
      deliverable: overrides.deliverable ?? true,
      userId: 'user-1',
      purpose: 'LOGIN',
    };
    const mail = {
      sendAuthSignIn: overrides.sendAuthSignIn ?? jest.fn().mockResolvedValue(undefined),
    };
    const crypto = { decrypt: jest.fn().mockReturnValue(payload) };
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    const processor = new AuthMailProcessor(
      mail as never,
      crypto as never,
      prisma as unknown as PrismaService,
    );
    return { processor, mail, crypto, prisma };
  }

  it('logs only a safe category when SMTP fails', async () => {
    const { processor, prisma } = buildProcessor({
      sendAuthSignIn: jest.fn().mockRejectedValue(new Error('SMTP 550 raw')),
    });

    await expect(processor.process({ data: {} } as never)).rejects.toThrow();

    const blob = logs.lines.join('\n');
    expect(blob).not.toContain(CANARY_EMAIL);
    expect(blob).not.toContain(CANARY_CODE);
    expect(blob).not.toContain('CANARYLINKTOKENVALUE');
    expect(blob).not.toContain('SMTP 550 raw');
    expect(blob).toContain('Could not send a sign-in email');

    const auditBlob = JSON.stringify(
      (prisma.auditLog.create.mock.calls as Array<[{ data: unknown }]>).map(
        (call) => call[0].data,
      ),
    );
    expect(auditBlob).toContain('AUTH_EMAIL_DELIVERY_FAILED');
    expect(auditBlob).not.toContain(CANARY_EMAIL);
    expect(auditBlob).not.toContain(CANARY_CODE);
    expect(auditBlob).not.toContain('CANARYLINKTOKENVALUE');
  });

  it('sends nothing for a decoy and writes no secret', async () => {
    const { processor, mail, prisma } = buildProcessor({ deliverable: false });

    await processor.process({ data: {} } as never);

    expect(mail.sendAuthSignIn).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(logs.lines.join('\n')).not.toContain(CANARY_CODE);
  });
});
