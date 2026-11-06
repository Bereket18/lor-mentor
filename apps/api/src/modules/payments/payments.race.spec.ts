import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChekiService } from './cheki.service';
import { ChapaService } from './chapa.service';
import { addMonthsUtc } from './date-math';
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

  /**
   * URL-aware Chapa mock. The initialize endpoint returns a hosted checkout
   * page; the verify endpoint answers with whatever `verify` returns for the
   * txRef being asked about — so lazy resolution and the webhook/callback
   * paths never read each other's payloads. Any other endpoint 404s.
   */
  function mockGateway(opts: {
    verify?: (txRef: string) => unknown;
    verifyOk?: boolean;
    initializeUrl?: string;
    initializeFails?: boolean;
  }) {
    const initializeUrl =
      opts.initializeUrl ?? 'https://checkout.chapa.test/session';
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/transaction/verify/')) {
        const txRef = decodeURIComponent(
          u.split('/transaction/verify/')[1] ?? '',
        );
        return Promise.resolve({
          ok: opts.verifyOk ?? false,
          status: opts.verifyOk ? 200 : 404,
          json: () =>
            Promise.resolve(
              opts.verify
                ? opts.verify(txRef)
                : {
                    status: 'failed',
                    message: 'Payment not paid yet',
                    data: null,
                  },
            ),
        } as Response);
      }
      if (u.includes('/transaction/initialize')) {
        if (opts.initializeFails) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () =>
              Promise.resolve({ status: 'failed', message: 'initialize failed' }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'success',
              data: { checkout_url: initializeUrl },
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({ status: 'failed', message: 'not found', data: null }),
      } as Response);
    });
  }

  /** Backdate a payment so it looks abandoned (> 30 minutes old). */
  async function makeAbandoned(paymentId: string) {
    const createdAt = new Date(Date.now() - 31 * 60 * 1000);
    await prisma.payment.update({
      where: { id: paymentId },
      data: { createdAt },
    });
    return createdAt;
  }

  function webhookBody(txRef: string) {
    return Buffer.from(JSON.stringify({ tx_ref: txRef }));
  }

  /** Close a PENDING row through the real state machine (event included). */
  async function closePayment(
    paymentId: string,
    to: 'EXPIRED' | 'CANCELLED',
  ) {
    const won = await states.transition(prisma, paymentId, {
      from: ['PENDING'],
      to,
      type: to === 'EXPIRED' ? 'PAYMENT_EXPIRED' : 'PAYMENT_CANCELLED',
      reason: 'closed by the race test',
    });
    expect(won).toBe(true);
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

  it('two simultaneous checkouts: never more than one PENDING payment row exists', async () => {
    const student = await createStudent('double-checkout');
    // Verify says "not paid yet"; only initialize returns a checkout page.
    mockGateway({ initializeUrl: 'https://checkout.chapa.test/session' });

    const user = {
      id: student.id,
      email: student.email,
      fullName: student.fullName,
    };
    const results = await Promise.allSettled([
      chapa.initialize(user, planId),
      chapa.initialize(user, planId),
    ]);

    // Depending on the interleaving the loser either hits the partial unique
    // index on insert, gets told the open checkout is still live, or is
    // handed the same (resumed) checkout URL — but it must never create a
    // second PENDING row.
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(BadRequestException);
      }
    }
    expect(
      results.filter((r) => r.status === 'fulfilled').length,
    ).toBeGreaterThanOrEqual(1);

    const pending = await prisma.payment.count({
      where: { userId: student.id, status: 'PENDING' },
    });
    expect(pending).toBe(1);
    const total = await prisma.payment.count({
      where: { userId: student.id },
    });
    expect(total).toBe(1);
  });

  it('abandoned checkout then retry: old row goes EXPIRED via PAYMENT_EXPIRED, a fresh checkout is created', async () => {
    const student = await createStudent('abandoned-retry');
    const user = {
      id: student.id,
      email: student.email,
      fullName: student.fullName,
    };

    mockGateway({ initializeUrl: 'https://checkout.chapa.test/first' });
    const first = await chapa.initialize(user, planId);
    const firstRow = await prisma.payment.findFirstOrThrow({
      where: { userId: student.id },
    });
    expect(firstRow.txRef).toBe(first.txRef);
    await makeAbandoned(firstRow.id);

    // Retry: Chapa says the old txRef was never paid; a new checkout opens.
    mockGateway({
      verify: () => ({
        status: 'failed',
        message: 'Payment not paid yet',
        data: null,
      }),
      initializeUrl: 'https://checkout.chapa.test/second',
    });
    const second = await chapa.initialize(user, planId);

    expect(second.checkoutUrl).toBe('https://checkout.chapa.test/second');
    expect(second.txRef).not.toBe(first.txRef);

    const oldRow = await prisma.payment.findUniqueOrThrow({
      where: { id: firstRow.id },
    });
    expect(oldRow.status).toBe('EXPIRED');

    const expiredEvents = await prisma.paymentEvent.findMany({
      where: { paymentId: firstRow.id, type: 'PAYMENT_EXPIRED' },
    });
    expect(expiredEvents).toHaveLength(1);
    expect(expiredEvents[0].fromStatus).toBe('PENDING');
    expect(expiredEvents[0].toStatus).toBe('EXPIRED');
    expect(expiredEvents[0].reason).toContain(first.txRef);

    const pending = await prisma.payment.count({
      where: { userId: student.id, status: 'PENDING' },
    });
    expect(pending).toBe(1);
    const total = await prisma.payment.count({ where: { userId: student.id } });
    expect(total).toBe(2);
  });

  it('paid-but-webhook-lost then retry: approves the existing payment, never a duplicate checkout', async () => {
    const student = await createStudent('webhook-lost-retry');
    const user = {
      id: student.id,
      email: student.email,
      fullName: student.fullName,
    };

    mockGateway({ initializeUrl: 'https://checkout.chapa.test/first' });
    const first = await chapa.initialize(user, planId);
    const firstRow = await prisma.payment.findFirstOrThrow({
      where: { userId: student.id },
    });
    await makeAbandoned(firstRow.id);

    // The webhook was lost, but Chapa knows the transaction was paid in full.
    mockGateway({
      verify: (txRef) => ({
        status: 'success',
        data: {
          status: 'success',
          amount: '1000.00',
          currency: 'ETB',
          tx_ref: txRef,
          reference: `chapa-${txRef}`,
        },
      }),
      verifyOk: true,
      initializeUrl: 'https://checkout.chapa.test/should-not-be-used',
    });
    const retry = await chapa.initialize(user, planId);

    expect(retry).toMatchObject({ approved: true, txRef: first.txRef });

    const final = await prisma.payment.findUniqueOrThrow({
      where: { id: firstRow.id },
    });
    expect(final.status).toBe('APPROVED');
    expect(final.subscriptionId).not.toBeNull();

    // No second payment row, no new checkout, exactly one approval event.
    const total = await prisma.payment.count({ where: { userId: student.id } });
    expect(total).toBe(1);
    const approvedEvents = await prisma.paymentEvent.count({
      where: { paymentId: firstRow.id, type: 'PAYMENT_APPROVED' },
    });
    expect(approvedEvents).toBe(1);
    const subscription = await prisma.subscription.findUnique({
      where: { userId: student.id },
    });
    expect(subscription?.status).toBe('ACTIVE');
  });

  it('Chapa down during retry: no expiry, clear retry error, row untouched', async () => {
    const student = await createStudent('gateway-down-retry');
    const user = {
      id: student.id,
      email: student.email,
      fullName: student.fullName,
    };

    mockGateway({ initializeUrl: 'https://checkout.chapa.test/first' });
    const first = await chapa.initialize(user, planId);
    const firstRow = await prisma.payment.findFirstOrThrow({
      where: { userId: student.id },
    });
    await makeAbandoned(firstRow.id);

    // Gateway unreachable on the retry.
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('connect ECONNREFUSED 196.188.120.3:443'));

    await expect(chapa.initialize(user, planId)).rejects.toThrow(
      /could not reach the payment gateway/i,
    );

    const row = await prisma.payment.findUniqueOrThrow({
      where: { id: firstRow.id },
    });
    expect(row.status).toBe('PENDING'); // never expired on a guess
    const expiredEvents = await prisma.paymentEvent.count({
      where: { paymentId: firstRow.id, type: 'PAYMENT_EXPIRED' },
    });
    expect(expiredEvents).toBe(0);
    const unreachableEvents = await prisma.paymentEvent.count({
      where: { paymentId: firstRow.id, type: 'CHAPA_VERIFY_UNREACHABLE' },
    });
    expect(unreachableEvents).toBe(1);
    const total = await prisma.payment.count({ where: { userId: student.id } });
    expect(total).toBe(1);
  });

  it('two simultaneous retries after abandonment: exactly one expires the old row and one new PENDING exists', async () => {
    const student = await createStudent('double-retry');
    const user = {
      id: student.id,
      email: student.email,
      fullName: student.fullName,
    };

    mockGateway({ initializeUrl: 'https://checkout.chapa.test/first' });
    await chapa.initialize(user, planId);
    const firstRow = await prisma.payment.findFirstOrThrow({
      where: { userId: student.id },
    });
    await makeAbandoned(firstRow.id);

    mockGateway({
      verify: () => ({
        status: 'failed',
        message: 'Payment not paid yet',
        data: null,
      }),
      initializeUrl: 'https://checkout.chapa.test/retry',
    });

    const results = await Promise.allSettled([
      chapa.initialize(user, planId),
      chapa.initialize(user, planId),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(BadRequestException);
      }
    }

    const oldRow = await prisma.payment.findUniqueOrThrow({
      where: { id: firstRow.id },
    });
    expect(oldRow.status).toBe('EXPIRED');
    const expiredEvents = await prisma.paymentEvent.count({
      where: { paymentId: firstRow.id, type: 'PAYMENT_EXPIRED' },
    });
    expect(expiredEvents).toBe(1); // exactly one transition won the race

    const pending = await prisma.payment.count({
      where: { userId: student.id, status: 'PENDING' },
    });
    expect(pending).toBe(1);
    const total = await prisma.payment.count({ where: { userId: student.id } });
    expect(total).toBe(2); // the old row plus exactly one new checkout
  });

  it('student cancel vs concurrent approve: the state machine lets exactly one win', async () => {
    const student = await createStudent('cancel-vs-approve');
    const payment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef: `lm-${crypto.randomUUID()}`,
      receiptPath: null,
      bankReference: null,
    });

    const results = await Promise.allSettled([
      payments.cancelOwn(payment.id, student.id),
      payments.approve(payment.id, adminId),
    ]);

    const final = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(['CANCELLED', 'APPROVED']).toContain(final.status);

    const transitionEvents = await prisma.paymentEvent.findMany({
      where: {
        paymentId: payment.id,
        type: { in: ['PAYMENT_CANCELLED', 'PAYMENT_APPROVED'] },
      },
    });
    expect(transitionEvents).toHaveLength(1);
    expect(transitionEvents[0].toStatus).toBe(final.status);

    // The loser must have failed cleanly, not corrupted anything.
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(BadRequestException);
      }
    }
    if (final.status === 'APPROVED') {
      expect(
        await prisma.subscription.count({ where: { userId: student.id } }),
      ).toBe(1);
    }
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

  it('EXPIRED then paid on the old checkout: revives once with the late-approval event', async () => {
    const student = await createStudent('expired-then-paid');
    const txRef = `lm-${crypto.randomUUID()}`;
    const payment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef,
      receiptPath: null,
      bankReference: null,
    });
    await closePayment(payment.id, 'EXPIRED');
    mockSuccessfulVerify(txRef);

    const body = webhookBody(txRef);
    await expect(
      chapa.handleWebhook(body, signWebhook(body)),
    ).resolves.toEqual({ received: true });

    const final = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(final.status).toBe('APPROVED');
    expect(final.recoveredFromStatus).toBe('EXPIRED');
    expect(final.subscriptionId).not.toBeNull();
    expect(final.receiptNumber).not.toBeNull();

    const lateEvents = await prisma.paymentEvent.findMany({
      where: {
        paymentId: payment.id,
        type: 'PAYMENT_APPROVED_AFTER_EXPIRY',
      },
    });
    expect(lateEvents).toHaveLength(1);
    expect(lateEvents[0].fromStatus).toBe('EXPIRED');
    expect(lateEvents[0].toStatus).toBe('APPROVED');
    expect(lateEvents[0].reason).toContain('EXPIRED');

    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: payment.id, type: 'PAYMENT_APPROVED' },
      }),
    ).toBe(0);
    expect(
      await prisma.subscription.count({ where: { userId: student.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: student.id, type: 'PAYMENT_APPROVED' },
      }),
    ).toBe(1);
  });

  it('CANCELLED then paid: revives once with the late-approval event', async () => {
    const student = await createStudent('cancelled-then-paid');
    const txRef = `lm-${crypto.randomUUID()}`;
    const payment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef,
      receiptPath: null,
      bankReference: null,
    });
    await closePayment(payment.id, 'CANCELLED');
    mockSuccessfulVerify(txRef);

    await chapa.handleCallback(txRef);

    const final = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(final.status).toBe('APPROVED');
    expect(final.recoveredFromStatus).toBe('CANCELLED');

    const lateEvents = await prisma.paymentEvent.findMany({
      where: {
        paymentId: payment.id,
        type: 'PAYMENT_APPROVED_AFTER_EXPIRY',
      },
    });
    expect(lateEvents).toHaveLength(1);
    expect(lateEvents[0].fromStatus).toBe('CANCELLED');
    expect(lateEvents[0].reason).toContain('CANCELLED');

    expect(
      await prisma.subscription.count({ where: { userId: student.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: student.id, type: 'PAYMENT_APPROVED' },
      }),
    ).toBe(1);
  });

  it('REVERSED then late webhook: stays REVERSED and logs the late exact payment', async () => {
    const student = await createStudent('reversed-then-paid');
    const txRef = `lm-${crypto.randomUUID()}`;
    const payment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef,
      receiptPath: null,
      bankReference: null,
    });

    // Approve normally, then reverse it (removes access, keeps the ledger).
    await payments.finalizeApproval(payment.id, { chapaRef: `chapa-${txRef}` });
    await payments.reverse(payment.id, adminId, 'race test reversal');
    mockSuccessfulVerify(txRef);

    const body = webhookBody(txRef);
    await expect(
      chapa.handleWebhook(body, signWebhook(body)),
    ).resolves.toEqual({ received: true });

    const final = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(final.status).toBe('REVERSED');
    expect(final.recoveredFromStatus).toBeNull();

    const lateEvents = await prisma.paymentEvent.findMany({
      where: {
        paymentId: payment.id,
        type: 'CHAPA_LATE_PAYMENT_TERMINAL',
      },
    });
    expect(lateEvents).toHaveLength(1);
    expect(lateEvents[0].fromStatus).toBe('REVERSED');
    expect(lateEvents[0].toStatus).toBe('REVERSED');
    expect(lateEvents[0].reason).toContain('REVERSED');

    // No reactivation and no second approval.
    expect(
      await prisma.paymentEvent.count({
        where: {
          paymentId: payment.id,
          type: 'PAYMENT_APPROVED_AFTER_EXPIRY',
        },
      }),
    ).toBe(0);
    expect(
      await prisma.subscription.count({ where: { userId: student.id } }),
    ).toBe(1);
    expect(
      await prisma.subscription.findUniqueOrThrow({
        where: { userId: student.id },
      }),
    ).toMatchObject({ status: 'CANCELLED' });
  });

  it('late webhook while a newer PENDING checkout exists: approves the old one exactly once', async () => {
    const student = await createStudent('late-with-newer');
    const oldTxRef = `lm-${crypto.randomUUID()}`;
    const newTxRef = `lm-${crypto.randomUUID()}`;

    const oldPayment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef: oldTxRef,
      receiptPath: null,
      bankReference: null,
    });
    await closePayment(oldPayment.id, 'EXPIRED');
    const newPayment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef: newTxRef,
      receiptPath: null,
      bankReference: null,
    });
    mockSuccessfulVerify(oldTxRef);

    const body = webhookBody(oldTxRef);
    await chapa.handleWebhook(body, signWebhook(body));

    const oldFinal = await prisma.payment.findUniqueOrThrow({
      where: { id: oldPayment.id },
    });
    const newFinal = await prisma.payment.findUniqueOrThrow({
      where: { id: newPayment.id },
    });
    expect(oldFinal.status).toBe('APPROVED');
    expect(oldFinal.recoveredFromStatus).toBe('EXPIRED');
    expect(newFinal.status).toBe('PENDING');
    expect(newFinal.subscriptionId).toBeNull();

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { userId: student.id },
    });
    expect(subscription.status).toBe('ACTIVE');
    // Exactly the one month that was paid for the old checkout was added.
    expect(subscription.endDate?.toISOString()).toBe(
      addMonthsUtc(subscription.startDate as Date, 1).toISOString(),
    );

    expect(
      await prisma.paymentEvent.count({
        where: {
          paymentId: oldPayment.id,
          type: 'PAYMENT_APPROVED_AFTER_EXPIRY',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: newPayment.id, type: 'PAYMENT_APPROVED' },
      }),
    ).toBe(0);
  });

  it('late webhook delivered twice: one approval, one activation, one notification', async () => {
    const student = await createStudent('late-double');
    const txRef = `lm-${crypto.randomUUID()}`;
    const payment = await createPayment(student.id, {
      method: 'CHAPA',
      txRef,
      receiptPath: null,
      bankReference: null,
    });
    await closePayment(payment.id, 'CANCELLED');
    mockSuccessfulVerify(txRef);

    const body = webhookBody(txRef);
    const results = await Promise.allSettled([
      chapa.handleWebhook(body, signWebhook(body)),
      chapa.handleWebhook(body, signWebhook(body)),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const final = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(final.status).toBe('APPROVED');

    expect(
      await prisma.paymentEvent.count({
        where: {
          paymentId: payment.id,
          type: 'PAYMENT_APPROVED_AFTER_EXPIRY',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: payment.id, type: 'PAYMENT_APPROVED' },
      }),
    ).toBe(0);
    expect(
      await prisma.subscription.count({ where: { userId: student.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: student.id, type: 'PAYMENT_APPROVED' },
      }),
    ).toBe(1);
  });
});
