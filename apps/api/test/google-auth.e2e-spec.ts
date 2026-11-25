import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerStorageService } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthCsrfGuard } from '../src/common/guards/auth-csrf.guard';
import { isDisposableDatabaseUrl } from '../src/common/utils/disposable-database';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthMailService } from '../src/modules/auth/auth-mail.service';
import { AuthMethodsConfig } from '../src/modules/auth/auth-methods.config';
import { AuthRateLimitService } from '../src/modules/auth/auth-rate-limit.service';
import { AuthService } from '../src/modules/auth/auth.service';
import {
  GoogleIdentityError,
  buildGoogleAuthorizationUrl,
} from '../src/modules/auth/google-oidc.client';
import type { GoogleVerifiedIdentity } from '../src/modules/auth/google-oidc.client';
import { PROOF_FAILED_MESSAGE } from '../src/modules/auth/auth-policy';
import { GoogleAuthService } from '../src/modules/auth/google-auth.service';
import { GoogleOidcClient } from '../src/modules/auth/google-oidc.client';
import { PasswordlessAuthService } from '../src/modules/auth/passwordless.service';
import { PasswordlessController } from '../src/modules/auth/passwordless.controller';
import { UsersService } from '../src/modules/users/users.service';

/**
 * REAL-HTTP Google sign-in matrix (Phase 3).
 *
 * Boots the passwordless controller, the CSRF guard and the real Prisma client
 * against a **disposable Postgres**. Google itself is replaced at the client
 * boundary: `google-auth-library` pins Google's token and JWKS endpoints, so a
 * local HTTP mock cannot stand in for it, and the suite instead supplies the
 * verified identity that the real client would return. Everything after that
 * point — the browser-bound transaction, single use, cookie handling, identity
 * resolution, safe-fail, the profile grant and the DB effects — is real.
 *
 * Run:
 *   $env:DATABASE_URL = "postgresql://qa@127.0.0.1:55433/lor_google_e2e?schema=public"
 *   cd apps/api && npx jest --config ./test/jest-e2e.json google-auth
 *
 * It skips itself unless DATABASE_URL names a database that looks disposable.
 */
jest.setTimeout(120_000);

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const DISPOSABLE_DB = isDisposableDatabaseUrl(DATABASE_URL);

if (!DATABASE_URL || !DISPOSABLE_DB) {
  describe.skip('Google sign-in matrix (set DATABASE_URL to a disposable database)', () => {
    it('skipped', () => undefined);
  });
} else {
  const ORIGIN = 'http://localhost:3000';
  const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

  // Environment this suite overrides. Jest can reuse a worker for several e2e
  // files, so every value is restored in `afterAll`.
  const ENV_KEYS = [
    'NODE_ENV',
    'DATABASE_URL',
    'AUTH_GOOGLE_ENABLED',
    'AUTH_EMAIL_LINK_ENABLED',
    'AUTH_TRANSIENT_ENCRYPTION_KEY',
    'AUTH_CODE_PEPPER',
    'AUTH_RATE_KEY_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'WEB_PUBLIC_URL',
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  describe('Google sign-in matrix (real HTTP, disposable Postgres)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    /** The identity the fake verifier returns for the next callback. */
    let nextIdentity: GoogleVerifiedIdentity | null = null;
    /** Set to make the code exchange itself fail. */
    let exchangeFails = false;
    /** The last authorization request the service built. */
    let lastAuthorization: {
      state: string;
      nonce: string;
      codeChallenge: string;
    } | null = null;

    const issuedSessions: Array<{ userId: string; method: string }> = [];

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const emails = {
      newcomer: `google-new-${suffix}@example.test`,
      linked: `google-linked-${suffix}@example.test`,
      conflict: `google-conflict-${suffix}@example.test`,
      admin: `google-admin-${suffix}@example.test`,
    };
    const userIds: string[] = [];
    let adminId = '';
    let departmentId = '';
    let academicYearId = '';

    const oidc = {
      authorizationUrl: jest.fn(
        (input: { state: string; nonce: string; codeChallenge: string }) => {
          lastAuthorization = input;
          return buildGoogleAuthorizationUrl({
            clientId: CLIENT_ID,
            redirectUri: `${ORIGIN}/auth/google/callback`,
            ...input,
          });
        },
      ),
      exchangeCode: jest.fn(async () => {
        if (exchangeFails) {
          throw new GoogleIdentityError('code exchange failed');
        }
        return 'id-token';
      }),
      verifyIdToken: jest.fn(async () => {
        if (!nextIdentity) {
          throw new GoogleIdentityError('id token rejected');
        }
        return nextIdentity;
      }),
    };

    const limits = {
      enforceRequest: jest.fn().mockResolvedValue(undefined),
      enforceGrant: jest.fn().mockResolvedValue(undefined),
      consumeAddressCode: jest
        .fn()
        .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
      consumeAddressDelivery: jest
        .fn()
        .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    };

    beforeAll(async () => {
      for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL = DATABASE_URL;
      process.env.AUTH_GOOGLE_ENABLED = 'true';
      process.env.AUTH_EMAIL_LINK_ENABLED = 'false';
      process.env.AUTH_TRANSIENT_ENCRYPTION_KEY = 'k'.repeat(48);
      process.env.AUTH_CODE_PEPPER = 'p'.repeat(48);
      process.env.AUTH_RATE_KEY_SECRET = 'r'.repeat(48);
      process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.WEB_PUBLIC_URL = ORIGIN;

      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
          ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
        ],
        controllers: [PasswordlessController],
        providers: [
          PrismaService,
          PasswordlessAuthService,
          GoogleAuthService,
          AuthMethodsConfig,
          AuthCsrfGuard,
          { provide: GoogleOidcClient, useValue: oidc },
          {
            provide: AuthRateLimitService,
            useValue: limits,
          },
          {
            provide: AuthMailService,
            useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
          },
          {
            provide: UsersService,
            useValue: {
              findByEmail: jest.fn().mockResolvedValue(null),
              findById: jest.fn().mockResolvedValue(null),
            },
          },
          {
            provide: AuthService,
            useValue: {
              issueSession: jest.fn(
                async (userId: string, method: string) => {
                  issuedSessions.push({ userId, method });
                  return {
                    accessToken: `access-${userId}`,
                    refreshToken: `refresh-${userId}`,
                  };
                },
              ),
              revokePresentedRefreshToken: jest
                .fn()
                .mockResolvedValue(false),
            },
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication({ rawBody: true });
      prisma = app.get(PrismaService);
      app.use(cookieParser());
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();

      const department = await prisma.department.create({
        data: { name: `Google e2e dept ${suffix}` },
        select: { id: true },
      });
      departmentId = department.id;
      const year = await prisma.academicYear.create({
        data: { departmentId, label: `Year ${suffix}` },
        select: { id: true },
      });
      academicYearId = year.id;

      const linked = await prisma.user.create({
        data: {
          email: emails.linked,
          passwordHash: 'not-a-real-hash',
          fullName: 'Linked Student',
          role: 'STUDENT',
          isActive: true,
          isEmailVerified: true,
          passwordLoginEnabled: false,
          profileCompletedAt: new Date(),
          authIdentities: {
            create: {
              provider: 'GOOGLE',
              subject: `subject-linked-${suffix}`,
            },
          },
        },
        select: { id: true },
      });
      userIds.push(linked.id);

      const conflict = await prisma.user.create({
        data: {
          email: emails.conflict,
          passwordHash: 'not-a-real-hash',
          fullName: 'Conflict Student',
          role: 'STUDENT',
          isActive: true,
          isEmailVerified: true,
        },
        select: { id: true },
      });
      userIds.push(conflict.id);

      const admin = await prisma.user.create({
        data: {
          email: emails.admin,
          passwordHash: 'not-a-real-hash',
          fullName: 'Google Admin',
          role: 'ADMIN',
          isActive: true,
          isEmailVerified: true,
          authIdentities: {
            create: {
              provider: 'GOOGLE',
              subject: `subject-admin-${suffix}`,
            },
          },
        },
        select: { id: true },
      });
      userIds.push(admin.id);
      adminId = admin.id;
    });

    afterAll(async () => {
      for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
      if (!prisma) return;
      await prisma.enrollmentGrant.deleteMany({
        where: { email: { in: Object.values(emails) } },
      });
      // Completing a profile can raise a welcome notification owned by the new
      // user; clear it before the user row or the FK blocks the delete.
      await prisma.notification.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.user.deleteMany({
        where: { email: { in: Object.values(emails) } },
      });
      await prisma.authOAuthTransaction.deleteMany({});
      await prisma.academicYear.deleteMany({
        where: { departmentId },
      });
      await prisma.department.deleteMany({ where: { id: departmentId } });
      await app.close();
      try {
        app.get(ThrottlerStorageService).onApplicationShutdown?.();
      } catch {
        // Nothing to clear if the storage never left the graph.
      }
    });

    /** A fresh browser: its own cookie jar, as a real second device. */
    function browser() {
      return request.agent(app.getHttpServer());
    }

    /** Fetch a CSRF token the way the web app does. */
    async function csrf(
      agent: ReturnType<typeof browser>,
    ): Promise<string> {
      const res = await agent
        .get('/api/v1/auth/csrf')
        .set('Origin', ORIGIN)
        .expect(200);
      return (res.body as { csrfToken: string }).csrfToken;
    }

    /** Start a flow and return the state plus the browser that owns it. */
    async function start(
      agent = browser(),
    ): Promise<{ state: string; agent: ReturnType<typeof browser> }> {
      const res = await agent
        .get('/api/v1/auth/google/start')
        .redirects(0)
        .set('Origin', ORIGIN)
        .expect(302);
      const location = res.headers.location as string;
      const state = new URL(location).searchParams.get('state') ?? '';
      expect(state.length).toBeGreaterThanOrEqual(40);
      return { state, agent };
    }

    /** POST the callback as that browser would, with its CSRF token. */
    async function callback(
      agent: ReturnType<typeof browser>,
      state: string,
      code = 'fake-code',
    ) {
      const token = await csrf(agent);
      return agent
        .post('/api/v1/auth/google/callback')
        .set('Origin', ORIGIN)
        .set('x-auth-csrf', token)
        .send({ code, state });
    }

    it('starts a flow with a PKCE request and a browser-bound transaction', async () => {
      nextIdentity = null;
      const res = await browser()
        .get('/api/v1/auth/google/start?returnTo=/courses')
        .redirects(0)
        .set('Origin', ORIGIN)
        .expect(302);

      const location = new URL(res.headers.location as string);
      expect(location.origin + location.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(location.searchParams.get('response_type')).toBe('code');
      expect(location.searchParams.get('client_id')).toBe(CLIENT_ID);
      expect(location.searchParams.get('redirect_uri')).toBe(
        `${ORIGIN}/auth/google/callback`,
      );
      expect(location.searchParams.get('scope')).toBe('openid email profile');
      expect(location.searchParams.get('code_challenge_method')).toBe('S256');
      expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(location.searchParams.get('state')).toBe(lastAuthorization?.state);
      expect(location.searchParams.get('nonce')).toBe(lastAuthorization?.nonce);

      const cookies = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cookies).toContain('auth_go_=');
      expect(cookies.toLowerCase()).toContain('httponly');

      const row = await prisma.authOAuthTransaction.findUnique({
        where: { id: lastAuthorization!.state },
      });
      expect(row?.returnPath).toBe('/courses');
      expect(row?.consumedAt).toBeNull();
      // Only ciphertext and a hash reach the database.
      expect(JSON.stringify(row)).not.toContain(lastAuthorization!.nonce);
    });

    it('sends a newcomer through the profile step and links the Google subject', async () => {
      nextIdentity = {
        subject: `subject-new-${suffix}`,
        email: emails.newcomer,
      };
      const { state, agent } = await start();

      const res = await callback(agent, state);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        next: 'complete_profile',
        redirectTo: '/complete-profile',
      });
      expect(JSON.stringify(res.body)).not.toContain('subject-new');

      // No account exists yet: the grant is the only artifact.
      expect(
        await prisma.user.findUnique({ where: { email: emails.newcomer } }),
      ).toBeNull();
      const grant = await prisma.enrollmentGrant.findFirst({
        where: { email: emails.newcomer },
      });
      expect(grant?.method).toBe('GOOGLE');
      expect(grant?.googleSubject).toBe(`subject-new-${suffix}`);

      const status = await agent
        .get('/api/v1/auth/profile-completion')
        .set('Origin', ORIGIN)
        .expect(200);
      expect(status.body).toMatchObject({
        email: emails.newcomer,
        existingAccount: false,
      });

      const token = await csrf(agent);
      const completed = await agent
        .post('/api/v1/auth/profile-completion')
        .set('Origin', ORIGIN)
        .set('x-auth-csrf', token)
        .send({
          fullName: 'New Google Student',
          phoneNumber: '0911000000',
          departmentId,
          academicYearId,
        })
        .expect(200);

      expect(completed.body).toMatchObject({
        next: 'signed_in',
        redirectTo: '/dashboard',
        user: { email: emails.newcomer, role: 'STUDENT' },
      });
      expect(JSON.stringify(completed.body)).not.toMatch(/access-|refresh-/);
      const cookies = (
        completed.headers['set-cookie'] as unknown as string[]
      ).join(';');
      expect(cookies).toContain('access_token=');
      expect(cookies).toContain('refresh_token=');

      const created = await prisma.user.findUnique({
        where: { email: emails.newcomer },
        include: { authIdentities: true },
      });
      expect(created?.passwordLoginEnabled).toBe(false);
      expect(created?.isEmailVerified).toBe(true);
      expect(created?.authIdentities).toHaveLength(1);
      expect(created?.authIdentities[0]).toMatchObject({
        provider: 'GOOGLE',
        subject: `subject-new-${suffix}`,
      });
      if (created) userIds.push(created.id);
      expect(issuedSessions.some((s) => s.userId === created?.id)).toBe(true);
    });

    it('signs in a linked account and issues a GOOGLE session', async () => {
      nextIdentity = {
        subject: `subject-linked-${suffix}`,
        email: emails.linked,
      };
      const { state, agent } = await start();

      const res = await callback(agent, state);
      expect(res.status).toBe(200);

      expect(res.body).toMatchObject({
        next: 'signed_in',
        redirectTo: '/dashboard',
        user: { email: emails.linked },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/access-|refresh-/);
      const session = issuedSessions.find(
        (entry) => entry.userId === userIds[0],
      );
      expect(session?.method).toBe('GOOGLE');
    });

    it('refuses a callback replayed with the same state', async () => {
      nextIdentity = {
        subject: `subject-new-${suffix}`,
        email: emails.newcomer,
      };
      const { state, agent } = await start();
      const first = await callback(agent, state);
      expect(first.status).toBe(200);

      const replay = await callback(agent, state);
      expect(replay.status).toBe(400);
      expect(replay.body).toMatchObject({ message: PROOF_FAILED_MESSAGE });
    });

    it('refuses a callback from a different browser', async () => {
      nextIdentity = {
        subject: `subject-new-${suffix}`,
        email: emails.newcomer,
      };
      const { state } = await start();
      const other = browser();

      const res = await callback(other, state);
      expect(res.status).toBe(400);

      // The misbound attempt did not consume the row.
      const row = await prisma.authOAuthTransaction.findFirst({
        where: { id: state },
      });
      expect(row?.consumedAt).toBeNull();
    });

    it('fails safely when a local account already owns the verified email', async () => {
      nextIdentity = {
        subject: `subject-conflict-${suffix}`,
        email: emails.conflict,
      };
      const { state, agent } = await start();

      const res = await callback(agent, state);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: PROOF_FAILED_MESSAGE });
      const users = await prisma.user.findMany({
        where: { email: emails.conflict },
      });
      expect(users).toHaveLength(1);
      expect(
        await prisma.authIdentity.findFirst({
          where: { subject: `subject-conflict-${suffix}` },
        }),
      ).toBeNull();
      expect(
        await prisma.enrollmentGrant.findFirst({
          where: { email: emails.conflict },
        }),
      ).toBeNull();
      expect(
        await prisma.auditLog.findFirst({
          where: {
            action: 'AUTH_GOOGLE_EMAIL_CONFLICT',
            actorId: users[0].id,
          },
        }),
      ).not.toBeNull();
    });

    it('refuses an administrator with a linked Google identity', async () => {
      nextIdentity = {
        subject: `subject-admin-${suffix}`,
        email: emails.admin,
      };
      const { state, agent } = await start();

      const res = await callback(agent, state);
      expect(res.status).toBe(400);
      expect(
        await prisma.auditLog.findFirst({
          where: {
            action: 'AUTH_PASSWORDLESS_ADMIN_REFUSED',
            actorId: adminId,
          },
        }),
      ).not.toBeNull();
    });

    it('returns the uniform failure when the code exchange is rejected', async () => {
      nextIdentity = {
        subject: `subject-new-${suffix}`,
        email: emails.newcomer,
      };
      exchangeFails = true;
      const { state, agent } = await start();

      const res = await callback(agent, state);
      exchangeFails = false;
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: PROOF_FAILED_MESSAGE });
    });

    it('refuses a callback with no binding cookie', async () => {
      const { state } = await start();
      const stripped = browser();
      const token = await csrf(stripped);

      const res = await stripped
        .post('/api/v1/auth/google/callback')
        .set('Origin', ORIGIN)
        .set('x-auth-csrf', token)
        .send({ code: 'fake-code', state });

      expect(res.status).toBe(400);
    });
  });
}