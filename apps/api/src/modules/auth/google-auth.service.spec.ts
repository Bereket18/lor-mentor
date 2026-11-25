import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthMethodsConfig } from './auth-methods.config';
import type { PasswordlessAuthService } from './passwordless.service';
import { openString, sealString } from './auth-envelope';
import { GoogleIdentityError, type GoogleOidcClient } from './google-oidc.client';
import { GoogleAuthService, OAUTH_TRANSACTION_TTL_MS } from './google-auth.service';
import { PROOF_FAILED_MESSAGE, randomToken, sha256 } from './auth-policy';

const KEY = 'k'.repeat(48);
const OAUTH_AAD = Buffer.from('lor-mentor-oauth-tx:v1', 'utf8');

/** The 32-byte key derived from KEY, matching the service. */
function derivedKey(): Buffer {
  return crypto.createHash('sha256').update(KEY, 'utf8').digest();
}

function buildHarness(options: { googleEnabled?: boolean; key?: string } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    authOAuthTransaction: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return args.data;
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const oidc = {
    authorizationUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1'),
    exchangeCode: jest.fn().mockResolvedValue('id-token'),
    verifyIdToken: jest.fn().mockResolvedValue({
      subject: 'google-subject-123',
      email: 'student@example.com',
    }),
  };
  const passwordless = {
    completeGoogleSignIn: jest.fn().mockResolvedValue({
      next: 'signed_in',
      redirectTo: '/dashboard',
      session: { accessToken: 'access', refreshToken: 'refresh' },
      user: {
        id: 'user-1',
        email: 'student@example.com',
        fullName: 'Test Student',
        role: 'STUDENT',
      },
    }),
  };
  const methods = {
    googleEnabled: options.googleEnabled ?? true,
  } as unknown as AuthMethodsConfig;
  const config = {
    get: jest.fn((name: string) =>
      name === 'AUTH_TRANSIENT_ENCRYPTION_KEY' ? options.key ?? KEY : undefined,
    ),
  } as unknown as ConfigService;

  const service = new GoogleAuthService(
    prisma as unknown as PrismaService,
    oidc as unknown as GoogleOidcClient,
    passwordless as unknown as PasswordlessAuthService,
    methods,
    config,
  );
  return { service, prisma, oidc, passwordless, methods, created };
}

/** Build a stored transaction row the way `start` would have written it. */
function storedTransaction(browserNonce: string, overrides: Record<string, unknown> = {}) {
  const key = derivedKey();
  const codeVerifier = randomToken(32);
  const nonce = randomToken(32);
  return {
    id: randomToken(32),
    browserNonceHash: sha256(browserNonce),
    encryptedVerifier: sealString(key, OAUTH_AAD, codeVerifier),
    encryptedNonce: sealString(key, OAUTH_AAD, nonce),
    returnPath: '/courses',
    consumedAt: null,
    expiresAt: new Date(Date.now() + OAUTH_TRANSACTION_TTL_MS),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('GoogleAuthService.start', () => {
  it('creates a browser-bound, single-use transaction and returns the redirect', async () => {
    const { service, prisma, oidc, created } = buildHarness();

    const result = await service.start('/courses');

    expect(result.authorizationUrl).toContain('accounts.google.com');
    const row = created[0];
    expect(typeof row.id).toBe('string');
    expect((row.id as string).length).toBeGreaterThanOrEqual(40);
    expect(row.returnPath).toBe('/courses');
    expect(row.expiresAt).toBeInstanceOf(Date);
    const ttl = (row.expiresAt as Date).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(OAUTH_TRANSACTION_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(OAUTH_TRANSACTION_TTL_MS);

    // Plaintext secrets never reach the row.
    expect(row.encryptedVerifier).toEqual(expect.any(String));
    expect(row.encryptedNonce).toEqual(expect.any(String));
    expect(JSON.stringify(row)).not.toContain(result.browserNonce);
    expect(row.browserNonceHash).toBe(sha256(result.browserNonce));

    // The authorization request carries the same state and nonce that were
    // sealed into the row, plus a PKCE S256 challenge.
    const nonce = openString(derivedKey(), OAUTH_AAD, row.encryptedNonce as string);
    const verifier = openString(derivedKey(), OAUTH_AAD, row.encryptedVerifier as string);
    expect(oidc.authorizationUrl).toHaveBeenCalledWith({
      state: row.id,
      nonce,
      codeChallenge: expect.any(String),
    });
    expect(verifier).not.toBe(nonce);
  });

  it('replaces an off-allowlist return path with the default', async () => {
    const { service, created } = buildHarness();

    await service.start('https://evil.example/steal');

    expect(created[0].returnPath).toBe('/dashboard');
  });

  it('refuses to start while the Google flag is off', async () => {
    const { service, prisma } = buildHarness({ googleEnabled: false });

    await expect(service.start(undefined)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.authOAuthTransaction.create).not.toHaveBeenCalled();
  });

  it('fails closed when the sealing key is missing', async () => {
    const { service, prisma } = buildHarness({ key: '' });

    await expect(service.start(undefined)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.authOAuthTransaction.create).not.toHaveBeenCalled();
  });
});

describe('GoogleAuthService.complete', () => {
  function callbackHarness(rowOverrides: Record<string, unknown> = {}) {
    const browserNonce = randomToken(32);
    const row = storedTransaction(browserNonce, rowOverrides);
    const harness = buildHarness();
    harness.prisma.authOAuthTransaction.findFirst.mockResolvedValue(row);
    harness.prisma.authOAuthTransaction.findUnique.mockResolvedValue({
      ...row,
      consumedAt: new Date(),
    });
    return { ...harness, row, browserNonce };
  }

  it('redeems the code and hands the verified identity to the account layer', async () => {
    const { service, prisma, oidc, passwordless, row, browserNonce } =
      callbackHarness();

    const result = await service.complete({
      code: 'auth-code',
      state: row.id,
      browserNonce,
    });

    expect(result.next).toBe('signed_in');
    const verifier = openString(
      derivedKey(),
      OAUTH_AAD,
      row.encryptedVerifier,
    );
    const nonce = openString(derivedKey(), OAUTH_AAD, row.encryptedNonce);
    expect(oidc.exchangeCode).toHaveBeenCalledWith({
      code: 'auth-code',
      codeVerifier: verifier,
    });
    expect(oidc.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token',
      expectedNonce: nonce,
    });
    expect(passwordless.completeGoogleSignIn).toHaveBeenCalledWith({
      email: 'student@example.com',
      subject: 'google-subject-123',
      returnPath: '/courses',
    });
    // The single-use claim is conditional on unconsumed, unexpired state.
    const claim = prisma.authOAuthTransaction.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: row.id, consumedAt: null });
    expect(claim.where.expiresAt).toEqual({ gt: expect.any(Date) });
  });

  it('rejects an unknown state without touching Google', async () => {
    const { service, oidc } = buildHarness();

    await expect(
      service.complete({
        code: 'auth-code',
        state: randomToken(32),
        browserNonce: randomToken(32),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a malformed state without querying the database', async () => {
    const { service, prisma } = buildHarness();

    await expect(
      service.complete({ code: 'auth-code', state: 'short', browserNonce: 'x' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.authOAuthTransaction.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an expired transaction', async () => {
    const { service, prisma } = callbackHarness({
      expiresAt: new Date(Date.now() - 1_000),
    });
    // The expiry predicate is applied by the database; model it directly.
    prisma.authOAuthTransaction.findFirst.mockResolvedValue(null);

    await expect(
      service.complete({ code: 'auth-code', state: 'state-value-long-enough', browserNonce: randomToken(32) }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a transaction consumed by a concurrent request', async () => {
    const { service, prisma, oidc, row, browserNonce } = callbackHarness();
    prisma.authOAuthTransaction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.complete({ code: 'auth-code', state: row.id, browserNonce }),
    ).rejects.toThrow(BadRequestException);
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a callback in a different browser and leaves the transaction alone', async () => {
    const { service, prisma, oidc, row } = callbackHarness();

    await expect(
      service.complete({
        code: 'auth-code',
        state: row.id,
        browserNonce: randomToken(32),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.authOAuthTransaction.updateMany).not.toHaveBeenCalled();
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a callback with no binding cookie', async () => {
    const { service, prisma, row } = callbackHarness();

    await expect(
      service.complete({ code: 'auth-code', state: row.id, browserNonce: undefined }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.authOAuthTransaction.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a code exchange the library refuses', async () => {
    const { service, oidc, passwordless, row, browserNonce } = callbackHarness();
    oidc.exchangeCode.mockRejectedValue(new GoogleIdentityError('code exchange failed'));

    await expect(
      service.complete({ code: 'auth-code', state: row.id, browserNonce }),
    ).rejects.toThrow(BadRequestException);
    expect(passwordless.completeGoogleSignIn).not.toHaveBeenCalled();
  });

  it.each([
    ['nonce mismatch', 'id token nonce mismatch'],
    ['unverified email', 'id token email is not verified'],
    ['future issued-at', 'id token issued-at is in the future'],
  ])('rejects a token failing %s with the uniform message', async (_label, message) => {
    const { service, oidc, passwordless, row, browserNonce } = callbackHarness();
    oidc.verifyIdToken.mockRejectedValue(new GoogleIdentityError(message));

    let error: unknown;
    try {
      await service.complete({ code: 'auth-code', state: row.id, browserNonce });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(PROOF_FAILED_MESSAGE);
    expect(passwordless.completeGoogleSignIn).not.toHaveBeenCalled();
  });

  it('refuses a callback while the Google flag is off', async () => {
    const { service, prisma } = buildHarness({ googleEnabled: false });

    await expect(
      service.complete({
        code: 'auth-code',
        state: randomToken(32),
        browserNonce: randomToken(32),
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.authOAuthTransaction.findFirst).not.toHaveBeenCalled();
  });

  it('passes a null return path through when the transaction had none', async () => {
    const { service, passwordless, row, browserNonce } = callbackHarness({
      returnPath: null,
    });

    await service.complete({ code: 'auth-code', state: row.id, browserNonce });

    expect(passwordless.completeGoogleSignIn).toHaveBeenCalledWith({
      email: 'student@example.com',
      subject: 'google-subject-123',
      returnPath: null,
    });
  });
});