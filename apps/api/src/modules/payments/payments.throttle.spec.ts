import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppThrottlerGuard } from '../../common/guards/app-throttler.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ChapaService } from './chapa.service';

// This suite starts a Nest app and makes real HTTP requests. The default 5s
// timeout is too tight when Jest runs the full API suite on a loaded worker.
jest.setTimeout(30_000);

const JWT_SECRET = 'test-access-secret';
const jwt = new JwtService();

/** A valid access_token cookie for the given user, as the browser would send. */
async function cookieFor(userId: string): Promise<string> {
  const token = await jwt.signAsync({ sub: userId }, { secret: JWT_SECRET });
  return `access_token=${token}`;
}

/**
 * The global limiter mirrors app.module.ts (120/min), and the tracker is the
 * authenticated user from the signed cookie (or the IP otherwise). The route
 * guards under test are the per-user 10/min guard and the per-tx_ref 6/min
 * guard on the public callback.
 */
async function createApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
    controllers: [PaymentsController],
    providers: [
      JwtAuthGuard,
      RolesGuard,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            key === 'JWT_ACCESS_SECRET' ? JWT_SECRET : undefined,
        },
      },
      {
        provide: PaymentsService,
        useValue: {
          regenerateReceipt: jest.fn(),
          // Any existing file keeps the response a clean 200 while the guard
          // is what this test is about.
          getReceiptDocumentPath: jest.fn().mockResolvedValue(__filename),
          getBankAccounts: jest.fn().mockReturnValue([]),
        },
      },
      {
        provide: ChapaService,
        useValue: {
          initialize: jest
            .fn()
            .mockResolvedValue({ checkoutUrl: 'https://checkout', txRef: 'lm-1' }),
          handleCallback: jest.fn().mockResolvedValue({
            paymentId: 'pay-1',
            status: 'APPROVED',
            receiptNumber: 'LM-2026-1',
            confirmationPending: false,
            message: null,
          }),
          verifyByTxRef: jest.fn().mockResolvedValue({
            paymentId: 'pay-1',
            status: 'APPROVED',
            receiptNumber: 'LM-2026-1',
            confirmationPending: false,
            message: null,
          }),
        },
      },
      // The limiter is applied globally in the real app (app.module.ts).
      { provide: APP_GUARD, useClass: AppThrottlerGuard },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: {
        switchToHttp: () => {
          getRequest: () => {
            headers: Record<string, string | undefined>;
            user?: { id: string; role: string };
          };
        };
      }) => {
        const req = context.switchToHttp().getRequest();
        // The real auth guard resolves the user from the token; the tests only
        // need the id to reach the per-user tracker.
        req.user = {
          id: req.headers['x-test-user'] ?? 'student-1',
          role: 'STUDENT',
        };
        return true;
      },
    })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  // The global guard reads the signed access_token cookie before any auth
  // guard runs, so the parser must be registered like it is in main.ts.
  app.use(cookieParser());
  await app.init();
  return app;
}

describe('PaymentsController Chapa browser endpoints', () => {
  it('limits one tx_ref to 6 requests per minute', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await request(server)
          .get('/payments/chapa/callback')
          .query({ tx_ref: 'lm-payment-1' })
          .expect(200);
      }

      // The same reference cannot be replayed to burn the Chapa quota.
      await request(server)
        .get('/payments/chapa/callback')
        .query({ tx_ref: 'lm-payment-1' })
        .expect(429);

      // A different checkout is a different bucket.
      await request(server)
        .get('/payments/chapa/callback')
        .query({ tx_ref: 'lm-payment-2' })
        .expect(200);
    } finally {
      await app.close();
    }
  });

  it('limits the Chapa verify endpoint to 10 requests per user per minute', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();
      const cookie = await cookieFor('student-1');

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(server)
          .get('/payments/chapa/verify/lm-payment-1')
          .set('Cookie', cookie)
          .set('x-test-user', 'student-1')
          .expect(200);
      }

      await request(server)
        .get('/payments/chapa/verify/lm-payment-1')
        .set('Cookie', cookie)
        .set('x-test-user', 'student-1')
        .expect(429);
    } finally {
      await app.close();
    }
  });
});

describe('PaymentsController per-user throttling', () => {
  it('gives two users on the same IP separate buckets', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();
      const userA = await cookieFor('user-a');
      const userB = await cookieFor('user-b');

      // Ten checkouts each: with an IP-keyed limiter the second user would be
      // rejected as soon as the shared bucket reached ten.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(server)
          .post('/payments/chapa/initialize')
          .set('Cookie', userA)
          .set('x-test-user', 'user-a')
          .send({ planId: 'plan-1' })
          .expect(201);
      }
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(server)
          .post('/payments/chapa/initialize')
          .set('Cookie', userB)
          .set('x-test-user', 'user-b')
          .send({ planId: 'plan-1' })
          .expect(201);
      }
    } finally {
      await app.close();
    }
  });

  it('blocks the 11th request from the same user', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();
      const cookie = await cookieFor('user-a');

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(server)
          .post('/payments/chapa/initialize')
          .set('Cookie', cookie)
          .set('x-test-user', 'user-a')
          .send({ planId: 'plan-1' })
          .expect(201);
      }

      await request(server)
        .post('/payments/chapa/initialize')
        .set('Cookie', cookie)
        .set('x-test-user', 'user-a')
        .send({ planId: 'plan-1' })
        .expect(429);
    } finally {
      await app.close();
    }
  });

  it('throttles the authenticated receipt download per user', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();
      const cookie = await cookieFor('user-a');

      // The mock serves an existing file, so the guard is the only thing that
      // can turn a request away.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(server)
          .get('/payments/pay-1/document')
          .set('Cookie', cookie)
          .set('x-test-user', 'user-a')
          .expect(200);
      }

      await request(server)
        .get('/payments/pay-1/document')
        .set('Cookie', cookie)
        .set('x-test-user', 'user-a')
        .expect(429);
    } finally {
      await app.close();
    }
  });
});

describe('Global limiter tracker', () => {
  it('keys authenticated requests per user, not per IP', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();
      const userA = await cookieFor('user-a');
      const userB = await cookieFor('user-b');

      // /payments/bank-accounts is public and has no route-level throttle, so
      // this exercises the global 120/min bucket directly.
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await request(server)
          .get('/payments/bank-accounts')
          .set('Cookie', userA)
          .expect(200);
      }

      await request(server)
        .get('/payments/bank-accounts')
        .set('Cookie', userA)
        .expect(429);

      // A second account on the same IP still has its own full window.
      await request(server)
        .get('/payments/bank-accounts')
        .set('Cookie', userB)
        .expect(200);
    } finally {
      await app.close();
    }
  });

  it('still caps an unauthenticated flood from one IP', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();

      for (let attempt = 0; attempt < 120; attempt += 1) {
        await request(server).get('/payments/bank-accounts').expect(200);
      }

      await request(server).get('/payments/bank-accounts').expect(429);
    } finally {
      await app.close();
    }
  });
});
