import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ChapaService } from './chapa.service';

// This suite starts a Nest app and makes real HTTP requests. The default 5s
// timeout is too tight when Jest runs the full API suite on a loaded worker.
jest.setTimeout(20_000);

/**
 * Both Chapa browser endpoints are public and each one re-verifies the
 * transaction with Chapa, so an unauthenticated client could otherwise burn the
 * gateway quota (and our DB) by replaying them. The global limiter is 120/min,
 * which is far too loose for that: the routes carry their own 10/min bucket,
 * exactly like the other gateway entry points.
 */
async function createApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    // The global limiter mirrors app.module.ts. A missing route-level limit must
    // fail these tests, so it must stay well above 10/minute.
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
    controllers: [PaymentsController],
    providers: [
      JwtAuthGuard,
      RolesGuard,
      {
        provide: PaymentsService,
        useValue: {
          regenerateReceipt: jest.fn(),
          getReceiptDocumentPath: jest.fn(),
        },
      },
      {
        provide: ChapaService,
        useValue: {
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
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: {
        switchToHttp: () => {
          getRequest: () => { user?: { id: string; role: string } };
        };
      }) => {
        const req = context.switchToHttp().getRequest();
        req.user = { id: 'student-1', role: 'STUDENT' };
        return true;
      },
    })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('PaymentsController Chapa browser endpoints', () => {
  it('limits the Chapa callback to 10 requests per minute', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();

      // Chapa's own redirect plus the student's own retries must stay usable.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(server)
          .get('/payments/chapa/callback')
          .query({ tx_ref: 'lm-payment-1' })
          .expect(200);
      }

      await request(server)
        .get('/payments/chapa/callback')
        .query({ tx_ref: 'lm-payment-1' })
        .expect(429);
    } finally {
      await app.close();
    }
  });

  it('limits the Chapa verify endpoint to 10 requests per minute', async () => {
    const app = await createApp();
    try {
      const server = app.getHttpServer();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(server)
          .get('/payments/chapa/verify/lm-payment-1')
          .expect(200);
      }

      await request(server)
        .get('/payments/chapa/verify/lm-payment-1')
        .expect(429);
    } finally {
      await app.close();
    }
  });
});
