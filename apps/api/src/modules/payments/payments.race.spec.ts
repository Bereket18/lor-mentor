import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChekiService } from './cheki.service';
import { ChapaService } from './chapa.service';
import { PaymentStateMachine } from './payment-state-machine';
import { PaymentsService } from './payments.service';
import type { ReceiptService } from './receipt.service';
import type { ReceiptVerifierService } from './receipt-verifier.service';

/**
 * Concurrency tests against a REAL Postgres database.
 *
 * These deliberately do not run against a developer's database: they are
 * skipped unless a test database is configured explicitly via
 * PAYMENTS_RACE_DATABASE_URL, or CI=true + DATABASE_URL (the ephemeral
 * Postgres service used by the api:test job, where migrations are deployed
 * before jest runs).
 */
const raceDbUrl =
  process.env.PAYMENTS_RACE_DATABASE_URL ??
  (process.env.CI ? process.env.DATABASE_URL : undefined);

const describeWithDb = raceDbUrl ? describe : describe.skip;

describeWithDb('Payments concurrency (real Postgres)', () => {
  jest.setTimeout(120000);

  const dbUrl = raceDbUrl as string;
  const WEBHOOK_SECRET = 'race-webhook-secret';
  const CHAPA_SECRET = 'race-chapa-secret';
  const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Own the pool so the spec can close it (PrismaService hides its pool;
  // leaving it open makes Jest report a dangling handle).
  const pool = new Pool({ connectionString: dbUrl });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  const prisma = client as unknown as PrismaService;

  const chapaConfig = {
    get: (key: string) => {
      switch (key) {
        case 'CHAPA_SECRET_KEY':
          return CHAPA_SECRET;
        case 'CHAPA_WEBHOOK_SECRET':
          return WEBHOOK_SECRET;
        case 'CHAPA_BASE_URL':
          return 'https://chapa.race.test/v1';
        case 'CHAPA_TIMEOUT_MS':
          return '5000';
        case 'API_PUBLIC_URL':
          return 'http://localhost:4000';
        case 'WEB_PUBLIC_URL':
          return 'http://localhost:3000';
        default:
          return undefined;
      }
    },
  } as unknown as ConfigService;

  const receipts = {
    buildReceiptNumber: jest.fn(
      (paymentId: string, at: Date) =>
        `LM-${at.getUTCFullYear()}-${paymentId.slice(-6)}`,
    ),
    generate: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReceiptService;

  const paymentsConfig = {
    get: () => undefined,
  } as unknown as ConfigService;

  const verifier = { enabled: false } as unknown as ReceiptVerifierService;
  const cheki = { enabled: false } as unknown as ChekiService;

  const states = new PaymentStateMachine(prisma);
  const payments = new PaymentsService(
    prisma,
    receipts,
    paymentsConfig,
    verifier,
    cheki,
    states,
  );

  const chapa = new ChapaService(chapaConfig, prisma, payments, states);

  let adminId: string;
  let planId: string;
  const trackedUserIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `race-admin-${runId}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: 'Race Admin',
        role: 'SUPER_ADMIN',
        isEmailVerified: true,
      },
    });
    adminId = admin.id;
    trackedUserIds.push(admin.id);

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Race Plan ${runId}`,
        priceETB: new Prisma.Decimal('1000.00'),
        durationMonths: 1,
        isActive: true,
      },
    });
    planId = plan.id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Remove every row this spec created, in FK-safe order.
    const paymentsOfUsers = await prisma.payment.findMany({
      where: { userId: { in: trackedUserIds } },
      select: { id: true },
    });
    const paymentIds = paymentsOfUsers.map((p) => p.id);

    await prisma.paymentEvent.deleteMany({
      where: { paymentId: { in: paymentIds } },
    });
    await prisma.payment.deleteMany({
      where: { userId: { in: trackedUserIds } },
    });
    await prisma.subscription.deleteMany({
      where: { userId: { in: trackedUserIds } },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: trackedUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: trackedUserIds } },
          { entityId: { in: paymentIds } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: trackedUserIds } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });

    await prisma.$disconnect();
    await pool.end();
  });

  async function createStudent(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `race-${label}-${runId}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: `Race ${label}`,
        isEmailVerified: true,
      },
    });
    trackedUserIds.push(user.id);
    return user;
  }

  async function createPayment(
    userId: string,
    overrides: Partial<Prisma.PaymentUncheckedCreateInput> = {},
  ) {
    return prisma.payment.create({
      data: {
        userId,
        planId,
        method: 'MANUAL',
        amount: new Prisma.Decimal('1000.00'),
        currency: 'ETB',
        planName: `Race Plan ${runId}`,
        planDurationMonths: 1,
        receiptPath: 'receipt.png',
        bankReference: `TX-${crypto.randomUUID()}`,
        ...overrides,
      },
    });
  }

  function signWebhook(body: Buffer): { payloadSignature: string } {
    return {
      payloadSignature: crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(body)
        .digest('hex'),
    };
  }

  function mockSuccessfulVerify(txRef: string, amount = '1000.00') {
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: {
              status: 'success',
              amount,
              currency: 'ETB',
              tx_ref: txRef,
              reference: `chapa-${txRef}`,
            },
          }),
      } as Response),
    );
  }

  it('approve vs reject: exactly one transition wins and the ledger matches the row', async () => {
    const student = await createStudent('approve-reject');
    const payment = await createPayment(student.id);

    const results = await Promise.allSettled([
      payments.approve(payment.id, adminId),
      payments.reject(payment.id, adminId, 'lost the race'),
    ]);

    // Neither call may corrupt the row; a loser is allowed to throw or to
    // report that the payment was already reviewed.
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(BadRequestException);
      }
    }

    const final = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(['APPROVED', 'REJECTED']).toContain(final.status);

    const events = await prisma.paymentEvent.findMany({
      where: {
        paymentId: payment.id,
        type: { in: ['PAYMENT_APPROVED', 'PAYMENT_REJECTED'] },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].toStatus).toBe(final.status);
    expect(events[0].fromStatus).toBe('PENDING');

    const subscription = await prisma.subscription.findUnique({
      where: { userId: student.id },
    });
    if (final.status === 'APPROVED') {
      expect(subscription).not.toBeNull();
      expect(subscription?.status).toBe('ACTIVE');
    } else {
      expect(subscription).toBeNull();
    }
  });

  it('webhook vs callback: both paths confirm once, one approval and one subscription', async () => {
    const student = await createStudent('webhook-callback');
    const txRef = `lm-${crypto.randomUUID()}`;
    const payment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef,
      receiptPath: null,
      bankReference: null,
    });
    mockSuccessfulVerify(txRef);

    const body = Buffer.from(JSON.stringify({ tx_ref: txRef }));
    const results = await Promise.allSettled([
      chapa.handleWebhook(body, signWebhook(body)),
      chapa.handleCallback(txRef),
    ]);

    // Both must resolve: a duplicated webhook/callback is never an error.
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const final = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(final.status).toBe('APPROVED');
    expect(final.subscriptionId).not.toBeNull();

    const approvedEvents = await prisma.paymentEvent.count({
      where: { paymentId: payment.id, type: 'PAYMENT_APPROVED' },
    });
    expect(approvedEvents).toBe(1);

    const subscriptions = await prisma.subscription.count({
      where: { userId: student.id },
    });
    expect(subscriptions).toBe(1);

    const notifications = await prisma.notification.count({
      where: { userId: student.id, type: 'PAYMENT_APPROVED' },
    });
    expect(notifications).toBe(1);
  });

  it('double webhook: the second delivery is a no-op', async () => {
    const student = await createStudent('double-webhook');
    const txRef = `lm-${crypto.randomUUID()}`;
    const payment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef,
      receiptPath: null,
      bankReference: null,
    });
    mockSuccessfulVerify(txRef);

    const body = Buffer.from(JSON.stringify({ tx_ref: txRef }));
    const results = await Promise.allSettled([
      chapa.handleWebhook(body, signWebhook(body)),
      chapa.handleWebhook(body, signWebhook(body)),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: payment.id, type: 'PAYMENT_APPROVED' },
      }),
    ).toBe(1);
    expect(
      await prisma.subscription.count({ where: { userId: student.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: student.id, type: 'PAYMENT_APPROVED' },
      }),
    ).toBe(1);
  });

  it('two simultaneous checkouts: the partial unique index allows only one PENDING payment', async () => {
    const student = await createStudent('double-checkout');
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { checkout_url: 'https://checkout.chapa.test/session' },
          }),
      } as Response),
    );

    const user = {
      id: student.id,
      email: student.email,
      fullName: student.fullName,
    };
    const results = await Promise.allSettled([
      chapa.initialize(user, planId),
      chapa.initialize(user, planId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      BadRequestException,
    );

    const pending = await prisma.payment.count({
      where: { userId: student.id, status: 'PENDING' },
    });
    expect(pending).toBe(1);
    const total = await prisma.payment.count({
      where: { userId: student.id },
    });
    expect(total).toBe(1);
  });

  it('two paid payments for one user: approvals extend one subscription instead of racing it', async () => {
    const student = await createStudent('two-paid');
    const paidAt = new Date(Date.UTC(2026, 0, 31, 10, 0, 0));

    // Legacy/edge shape: two PENDING rows for the same user can only exist if
    // they were created before the partial unique index. Reproduce that shape
    // by dropping the index for the duration of this test.
    await prisma.$executeRawUnsafe(
      'DROP INDEX IF EXISTS "Payment_one_pending_per_user_idx"',
    );
    try {
      const first = await createPayment(student.id);
      const second = await createPayment(student.id);

      const results = await Promise.allSettled([
        payments.finalizeApproval(first.id, { reviewedBy: adminId, paidAt }),
        payments.finalizeApproval(second.id, { reviewedBy: adminId, paidAt }),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      const finalFirst = await prisma.payment.findUniqueOrThrow({
        where: { id: first.id },
      });
      const finalSecond = await prisma.payment.findUniqueOrThrow({
        where: { id: second.id },
      });
      expect(finalFirst.status).toBe('APPROVED');
      expect(finalSecond.status).toBe('APPROVED');

      const subscriptions = await prisma.subscription.findMany({
        where: { userId: student.id },
      });
      expect(subscriptions).toHaveLength(1);

      // Jan 31 + 1 month = Feb 28 (clamped), then +1 month = Mar 28.
      expect(subscriptions[0].startDate?.toISOString()).toBe(
        '2026-01-31T10:00:00.000Z',
      );
      expect(subscriptions[0].endDate?.toISOString()).toBe(
        '2026-03-28T10:00:00.000Z',
      );

      const approvedEvents = await prisma.paymentEvent.count({
        where: {
          paymentId: { in: [first.id, second.id] },
          type: 'PAYMENT_APPROVED',
        },
      });
      expect(approvedEvents).toBe(2);
    } finally {
      await prisma.paymentEvent.deleteMany({
        where: { payment: { userId: student.id } },
      });
      await prisma.payment.deleteMany({ where: { userId: student.id } });
      await prisma.subscription.deleteMany({ where: { userId: student.id } });
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "Payment_one_pending_per_user_idx" ON "Payment"("userId") WHERE "status" = \'PENDING\'',
      );
    }
  });
});
