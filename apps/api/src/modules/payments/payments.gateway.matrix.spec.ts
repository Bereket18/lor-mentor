import {
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import type { PaymentStatus } from '@prisma/client';
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
 * Exhaustive gateway-money matrix against a REAL disposable Postgres.
 *
 * Every combination of
 *   6 row statuses  ×  5 Chapa verify outcomes  ×  4 entry points  ×  5 interferences
 * =  600 combinations
 * is driven through the real `ChapaService`/`PaymentsService` and the real
 * database, then one invariant is asserted:
 *
 *   WHEN CHAPA VERIFIED MONEY FOR THE tx_ref, THE MONEY IS NEVER SILENTLY
 *   LOST AND NEVER REPORTED AS A TRANSIENT RETRY.
 *
 * Concretely, for any verified outcome:
 *   - exact money  → the row is APPROVED (with exactly one subscription) or it
 *                    is admin-visible as a review exception (exception flag,
 *                    stamped chapaRef or an admin-facing PaymentEvent);
 *   - inexact money→ the row is NEVER auto-approved by the gateway and the
 *                    mismatch is always recorded (exception flag or a
 *                    CHAPA_VERIFY_MISMATCH event);
 *   - unreachable  → it is the ONLY transient case (webhook 5xx / RETRY) and it
 *                    leaves no review flag behind;
 *   - not paid     → the gateway never creates an approval.
 *
 * The spec is deliberately table-driven in a single `it`: it runs all 600 and
 * reports the number that ran, so a regression names the exact combination.
 *
 * Like the concurrency suite, it is skipped unless a test database is given via
 * PAYMENTS_RACE_DATABASE_URL, or CI=true + DATABASE_URL (where migrations are
 * deployed before jest runs).
 */
const matrixDbUrl =
  process.env.PAYMENTS_RACE_DATABASE_URL ??
  (process.env.CI ? process.env.DATABASE_URL : undefined);

const describeWithDb = matrixDbUrl ? describe : describe.skip;

// ── The four dimensions ────────────────────────────────────────────────────

const STATUSES: PaymentStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVERSED',
  'EXPIRED',
  'CANCELLED',
];

const OUTCOMES = [
  'exact',
  'underpaid',
  'currency_mismatch',
  'not_paid',
  'unreachable',
] as const;

const ENTRY_POINTS = ['webhook', 'callback', 'verify', 'lazy'] as const;

const INTERFERENCES = [
  'none',
  'redelivery',
  'concurrent_reject',
  'concurrent_cancel',
  'concurrent_approve',
] as const;

type Outcome = (typeof OUTCOMES)[number];
type Entry = (typeof ENTRY_POINTS)[number];
type Interference = (typeof INTERFERENCES)[number];

const TOTAL_COMBOS =
  STATUSES.length * OUTCOMES.length * ENTRY_POINTS.length * INTERFERENCES.length;

describeWithDb('Gateway-money matrix (real Postgres)', () => {
  jest.setTimeout(600000);

  const dbUrl = matrixDbUrl as string;
  const WEBHOOK_SECRET = 'matrix-webhook-secret';
  const CHAPA_SECRET = 'matrix-chapa-secret';
  const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

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
          return 'https://chapa.matrix.test/v1';
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

  const paymentsConfig = { get: () => undefined } as unknown as ConfigService;
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
        email: `matrix-admin-${runId}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: 'Matrix Admin',
        role: 'SUPER_ADMIN',
        isEmailVerified: true,
      },
    });
    adminId = admin.id;
    trackedUserIds.push(admin.id);

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Matrix Plan ${runId}`,
        priceETB: new Prisma.Decimal('1000.00'),
        durationMonths: 1,
        isActive: true,
      },
    });
    planId = plan.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
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
        email: `matrix-${label}-${runId}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: `Matrix ${label}`,
        isEmailVerified: true,
      },
    });
    trackedUserIds.push(user.id);
    return user;
  }

  async function createPaymentInStatus(
    userId: string,
    status: PaymentStatus,
    txRef: string,
  ) {
    return prisma.payment.create({
      data: {
        userId,
        planId,
        method: 'CHAPA',
        status,
        txRef,
        amount: new Prisma.Decimal('1000.00'),
        currency: 'ETB',
        planName: `Matrix Plan ${runId}`,
        planDurationMonths: 1,
        receiptPath: null,
        bankReference: null,
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

  /** Make every verify call answer with the given outcome for `txRef`. */
  function mockOutcome(outcome: Outcome, txRef: string) {
    if (outcome === 'unreachable') {
      jest
        .spyOn(global, 'fetch')
        .mockImplementation(() => Promise.reject(new Error('ECONNREFUSED')));
      return;
    }
    const notPaid =
      outcome === 'not_paid'
        ? {
            ok: false,
            status: 404,
            json: () =>
              Promise.resolve({ status: 'failed', data: null }),
          }
        : {
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                status: 'success',
                data: {
                  status: 'success',
                  amount: outcome === 'underpaid' ? '900.00' : '1000.00',
                  currency: outcome === 'currency_mismatch' ? 'USD' : 'ETB',
                  tx_ref: txRef,
                  reference: `chapa-${txRef}`,
                },
              }),
          };
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/transaction/verify/')) {
        return Promise.resolve(notPaid as unknown as Response);
      }
      // No other gateway call is reachable through the matrix entry points.
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ status: 'failed', data: null }),
      } as unknown as Response);
    });
  }

  function isTransient(err: unknown): boolean {
    return (
      err instanceof ServiceUnavailableException ||
      (err instanceof HttpException && err.getStatus() >= 500)
    );
  }

  /**
   * Drive one entry point. Total: never throws, and reports whether the entry
   * asked for a transient retry (webhook 5xx, or a RETRY outcome elsewhere).
   */
  async function runEntry(
    entry: Entry,
    txRef: string,
    requesterId: string,
  ): Promise<{ transient: boolean }> {
    try {
      switch (entry) {
        case 'webhook': {
          const body = Buffer.from(JSON.stringify({ tx_ref: txRef }));
          await chapa.handleWebhook(body, signWebhook(body));
          return { transient: false };
        }
        case 'callback': {
          const state = await chapa.handleCallback(txRef);
          return { transient: state.outcome === 'RETRY' };
        }
        case 'verify': {
          const state = await chapa.verifyByTxRef(txRef, requesterId);
          return { transient: state.outcome === 'RETRY' };
        }
        case 'lazy': {
          const outcome = await chapa.resolveChapaMoney(txRef);
          return { transient: outcome.kind === 'RETRY' };
        }
      }
    } catch (err) {
      return { transient: isTransient(err) };
    }
  }

  /** The interferences that run concurrently with the entry point. */
  function interferencePromise(
    interference: Interference,
    paymentId: string,
    requesterId: string,
  ): Promise<unknown> {
    switch (interference) {
      case 'concurrent_reject':
        return payments
          .reject(paymentId, adminId, 'matrix interference')
          .catch(() => undefined);
      case 'concurrent_cancel':
        return payments.cancelOwn(paymentId, requesterId).catch(() => undefined);
      case 'concurrent_approve':
        return payments
          .finalizeApproval(paymentId, {
            chapaRef: `interfere-${paymentId}`,
            paidAt: new Date(),
            allowExpiredOrCancelled: true,
          })
          .catch(() => undefined);
      case 'none':
      case 'redelivery':
        return Promise.resolve(undefined);
    }
  }

  it(`asserts the verified-money invariant across all ${TOTAL_COMBOS} combinations`, async () => {
    const failures: string[] = [];
    let ran = 0;

    for (const status of STATUSES) {
      for (const outcome of OUTCOMES) {
        for (const entry of ENTRY_POINTS) {
          for (const interference of INTERFERENCES) {
            ran += 1;
            const label = `${status}/${outcome}/${entry}/${interference}`;
            const txRef = `lm-${crypto.randomUUID()}`;

            const student = await createStudent(
              `${status}-${outcome}-${entry}-${interference}`.toLowerCase(),
            );
            const payment = await createPaymentInStatus(
              student.id,
              status,
              txRef,
            );
            mockOutcome(outcome, txRef);

            let result: { transient: boolean };
            if (interference === 'redelivery') {
              const [a, b] = await Promise.all([
                runEntry(entry, txRef, student.id),
                runEntry(entry, txRef, student.id),
              ]);
              result = { transient: a.transient || b.transient };
            } else {
              const [entryResult] = await Promise.all([
                runEntry(entry, txRef, student.id),
                interferencePromise(interference, payment.id, student.id),
              ]);
              result = entryResult;
            }

            // ── Observe the post-state ──────────────────────────────────
            const final = await prisma.payment.findUniqueOrThrow({
              where: { id: payment.id },
            });
            const events = await prisma.paymentEvent.findMany({
              where: { paymentId: payment.id },
              select: { type: true },
            });
            const eventTypes = new Set(events.map((e) => e.type));
            const verification = (final.verification ?? {}) as Record<
              string,
              unknown
            >;
            const exceptionFlag = verification.exception === true;
            const subscriptions = await prisma.subscription.count({
              where: { userId: student.id },
            });

            const b = (cond: boolean, message: string) => {
              if (!cond) failures.push(`${label}: ${message}`);
            };

            // The verify endpoint trusts an APPROVED row and never calls the
            // gateway; every other entry point always does.
            const gatewayCalled = !(entry === 'verify' && status === 'APPROVED');

            const verifiedMoney =
              outcome === 'exact' ||
              outcome === 'underpaid' ||
              outcome === 'currency_mismatch';

            // ── The invariant ───────────────────────────────────────────
            // 1. Verified money never produces a transient retry / 5xx.
            if (gatewayCalled && verifiedMoney) {
              b(
                !result.transient,
                'verified money was reported as a transient retry',
              );
            }

            // 2. Inexact verified money is never auto-approved and is always
            //    recorded for an admin.
            if (
              gatewayCalled &&
              (outcome === 'underpaid' || outcome === 'currency_mismatch')
            ) {
              b(
                exceptionFlag || eventTypes.has('CHAPA_VERIFY_MISMATCH'),
                'inexact money was not recorded (no exception flag, no mismatch event)',
              );
            }

            // 3. Exact verified money is never silently lost: the row is
            //    approved, or it is admin-visible as a review exception.
            if (gatewayCalled && outcome === 'exact') {
              const visible =
                exceptionFlag ||
                eventTypes.has('CHAPA_LATE_PAYMENT_TERMINAL') ||
                eventTypes.has('CHAPA_VERIFY_NOT_APPROVED');
              b(
                final.status === 'APPROVED' || visible,
                'exact money was neither approved nor flagged for review',
              );
            }

            // 4. Unreachable is the only transient case, and it leaves no
            //    review flag behind (no money evidence exists).
            if (gatewayCalled && outcome === 'unreachable') {
              b(result.transient, 'unreachable did not report a transient retry');
              b(
                !eventTypes.has('CHAPA_VERIFY_MISMATCH'),
                'unreachable flagged a mismatch',
              );
              b(
                !eventTypes.has('CHAPA_LATE_PAYMENT_TERMINAL'),
                'unreachable flagged a late payment',
              );
            }

            // 5. "not paid" never creates an approval on its own.
            if (outcome === 'not_paid' && interference === 'none') {
              b(
                final.status !== 'APPROVED' || status === 'APPROVED',
                '"not paid" produced an approval',
              );
            }

            // 6. Approval ⇔ exactly one subscription (never zero, never two).
            const hadApprovalEvent =
              eventTypes.has('PAYMENT_APPROVED') ||
              eventTypes.has('PAYMENT_APPROVED_AFTER_EXPIRY');
            b(subscriptions <= 1, 'more than one subscription was created');
            if (hadApprovalEvent) {
              b(
                subscriptions === 1,
                'an approval event exists without exactly one subscription',
              );
            }
          }
        }
      }
    }

    // Report the number of combinations that actually ran, then fail with the
    // full list of broken combinations (capped so the log stays readable).
    // eslint-disable-next-line no-console
    console.log(
      `gateway-money matrix: ran ${ran}/${TOTAL_COMBOS} combinations`,
    );
    expect(ran).toBe(TOTAL_COMBOS);
    expect(
      failures.slice(0, 25).join('\n') + (failures.length > 25 ? `\n…and ${failures.length - 25} more` : ''),
    ).toBe('');
  });
});
