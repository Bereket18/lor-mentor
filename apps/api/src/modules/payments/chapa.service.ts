import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { PaymentStateMachine } from './payment-state-machine';
import { PaymentEventType } from './payment-event.types';
import { amountsEqual, formatETB, toDecimal } from './money';

interface ChapaInitResponse {
  status: string;
  message?: string | Record<string, unknown>;
  data?: { checkout_url?: string };
}

/**
 * Chapa verify response (per developer.chapa.co/integrations/responses):
 * data carries currency, amount, charge (Chapa's fee), status, reference,
 * tx_ref. `amount` is the settled transaction amount — it stays equal to the
 * initialized amount even when the customer bears the fee (the fee shows up
 * separately as `charge`), so `amount` is the correct field to compare
 * against our snapshot. 404 means "payment not paid yet / unknown tx_ref".
 */
interface ChapaVerifyResponse {
  status: string;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    tx_ref?: string;
    amount?: string | number;
    currency?: string;
    charge?: string | number;
  } | null;
}

interface ChapaWebhookSignatures {
  chapaSignature?: string;
  payloadSignature?: string;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}

/**
 * Chapa online-payment gateway integration.
 *
 * Lifecycle:
 *  1. initialize()  — create a PENDING payment, ask Chapa for a checkout URL.
 *  2. student pays on Chapa's hosted page (telebirr / CBE / bank / card).
 *  3. Chapa calls our webhook AND redirects the browser to our callback page.
 *  4. handleWebhook() / verifyByTxRef() confirm with Chapa's verify endpoint
 *     and hand off to PaymentsService.finalizeApproval (idempotent).
 *
 * Hardening rules (owner-approved policy):
 *  - the verified amount must equal the snapshotted amount EXACTLY, and the
 *    verify response's tx_ref and currency (ETB) must match; any mismatch
 *    keeps the payment PENDING, writes a PaymentEvent and leaves it visible
 *    in the admin queue as an exception — never auto-approved;
 *  - every Chapa call has a timeout; a failed/timed-out verify leaves the
 *    payment PENDING (the browser callback or a later webhook retries);
 *  - every status write goes through PaymentStateMachine (guarded update +
 *    immutable event in one transaction).
 */
@Injectable()
export class ChapaService {
  private readonly logger = new Logger(ChapaService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  /**
   * A PENDING Chapa checkout younger than this is still "open": initialize()
   * resumes it instead of expiring it. Older abandoned checkouts are expired
   * lazily (PENDING → EXPIRED) so the one-PENDING-per-user index can never
   * lock a student out of paying.
   */
  static readonly ABANDON_AFTER_MS = 30 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly states: PaymentStateMachine,
  ) {
    this.baseUrl =
      this.config.get<string>('CHAPA_BASE_URL') ?? 'https://api.chapa.co/v1';
    this.timeoutMs = Number(
      this.config.get<string>('CHAPA_TIMEOUT_MS') ?? '15000',
    );
  }

  private secretKey(): string {
    const key = this.config.get<string>('CHAPA_SECRET_KEY');
    if (!key) {
      this.logger.error('CHAPA_SECRET_KEY is not configured');
      throw new ServiceUnavailableException(
        'Online payment is not available right now',
      );
    }
    return key;
  }

  /** fetch with a hard timeout so a hung gateway never hangs a request. */
  private fetchWithTimeout(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
  }

  /** Build a checkout session for a plan and return the hosted-page URL. */
  async initialize(
    user: {
      id: string;
      email: string;
      fullName: string;
      phoneNumber?: string | null;
    },
    planId: string,
  ) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found or inactive');
    }

    // Don't let a user pay again while a subscription is still active.
    await this.payments.assertNoActiveSubscription(user.id);

    // Lazy resolution: at most one PENDING payment per user (partial unique
    // index), so before creating a new checkout, resolve any existing PENDING
    // row. An abandoned Chapa checkout must never lock the student out.
    const existing = await this.prisma.payment.findFirst({
      where: { userId: user.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        method: true,
        status: true,
        txRef: true,
        planId: true,
        checkoutUrl: true,
        amount: true,
        createdAt: true,
      },
    });
    if (existing) {
      const resolved = await this.resolvePendingPayment(existing, planId);
      if (resolved) return resolved;
    }

    // Chapa permanently reserves tx_ref values, including references from a
    // failed or abandoned checkout, so every initialization uses a fresh
    // unguessable reference. At most one PENDING payment per user is allowed
    // (partial unique index) — a second concurrent checkout fails on insert.
    const txRef = `lm-${crypto.randomUUID()}`;
    let payment: { id: string };
    try {
      payment = await this.prisma.payment.create({
        data: {
          userId: user.id,
          planId,
          method: 'CHAPA',
          amount: plan.priceETB,
          currency: 'ETB',
          txRef,
          planName: plan.name,
          planDurationMonths: plan.durationMonths,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestException(
          'You already have a payment in progress. If it is a bank receipt it is awaiting admin review; if it is an online checkout, complete it, cancel it, or wait for it to expire (30 minutes) before starting a new one.',
        );
      }
      throw err;
    }

    const apiBase = this.publicApiBase();
    const webBase = this.publicWebBase();
    const [firstName, ...rest] = user.fullName.trim().split(/\s+/);

    const body = {
      amount: formatETB(plan.priceETB),
      currency: 'ETB',
      email: user.email,
      first_name: firstName || 'Student',
      last_name: rest.join(' ') || 'Lorcan',
      phone_number: user.phoneNumber ?? undefined,
      tx_ref: txRef,
      callback_url: `${apiBase}/api/v1/payments/chapa/callback`,
      return_url: `${webBase}/pricing/payment/callback?tx=${txRef}`,
      customization: {
        title: 'Lor Mentor',
        // Shown on the hosted Chapa checkout page. The plan name already
        // contains the word "subscription", so don't append it again.
        // Chapa only allows letters/numbers/hyphens/underscores/spaces/dots
        // in this field (a "/" is rejected), so plan/amount uses a hyphen:
        // "6-month subscription - 500".
        description: `${plan.name.trim()} - ${Number(plan.priceETB)}`.slice(0, 50),
      },
    };

    let res: Response;
    let json: ChapaInitResponse;
    try {
      res = await this.fetchWithTimeout(
        `${this.baseUrl}/transaction/initialize`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.secretKey()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      json = (await res.json()) as ChapaInitResponse;
    } catch (error) {
      await this.rejectInitialization(
        payment.id,
        'Chapa initialization could not be reached',
      );
      this.logger.error(
        `Chapa initialize request failed for ${txRef}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Online payment could not be started. Please try again.',
      );
    }

    if (!res.ok || json.status !== 'success' || !json.data?.checkout_url) {
      // Chapa returns `message` as a string for most errors, but sends a
      // field-keyed object for validation failures (e.g. an email domain
      // without MX records). Stringify those so stored rejection reasons,
      // logs, and the client never see "[object Object]".
      const rawMessage =
        json.message ?? res.statusText ?? 'Unknown Chapa error';
      const reason =
        typeof rawMessage === 'string'
          ? rawMessage
          : Object.entries(rawMessage)
              .map(
                ([field, detail]) =>
                  `${field}: ${
                    Array.isArray(detail) ? detail.join(', ') : String(detail)
                  }`,
              )
              .join('; ') || 'Unknown Chapa error';
      await this.rejectInitialization(
        payment.id,
        `Chapa initialization failed: ${reason}`,
      );
      this.logger.error(`Chapa initialize failed for ${txRef}: ${reason}`);
      // Never echo the gateway's raw error to the student — it can contain
      // key/account details. The detailed reason stays on the payment row
      // (admin queue) and in the server log.
      throw new BadRequestException(
        'Online payment could not be started right now. Please try again in a few minutes, or pay by bank transfer.',
      );
    }

    // Remember the hosted page URL so a still-open checkout can be resumed by
    // lazy resolution instead of duplicated (best-effort: never fail the
    // checkout because the annotation write failed).
    const checkoutUrl = json.data.checkout_url;
    await this.prisma.payment
      .update({ where: { id: payment.id }, data: { checkoutUrl } })
      .catch((err) =>
        this.logger.warn(
          `Could not store checkoutUrl for ${txRef}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return { checkoutUrl, txRef };
  }

  /**
   * Resolve an existing PENDING payment before starting a new checkout.
   * Returns a response object when the caller should NOT create a new
   * checkout (resumed URL / approval / informative error thrown), or null
   * when the row was expired and a fresh checkout may proceed.
   */
  private async resolvePendingPayment(
    payment: {
      id: string;
      method: string;
      status: string;
      txRef: string | null;
      planId: string;
      checkoutUrl: string | null;
      amount: string | number | Prisma.Decimal | null;
      createdAt: Date;
    },
    planId: string,
  ) {
    if (payment.method !== 'CHAPA' || !payment.txRef) {
      // A PENDING bank receipt is an admin-review item — never silently
      // blocked: name the payment, its method and status, and say what to do.
      throw new BadRequestException(
        `You already have a ${payment.method} bank-receipt payment (id ${payment.id}, status ${payment.status}) awaiting admin review. ` +
          'You will be notified when it is approved or rejected; you cannot start another payment until then.',
      );
    }
    return this.resolvePendingChapa({ ...payment, txRef: payment.txRef }, planId);
  }

  /**
   * Ask Chapa about the existing checkout's txRef (same timeout as every other
   * gateway call) and act on the answer:
   *  - paid and exact  → finalize through the normal approve path (webhook was
   *    lost, but the money moved — never start a duplicate checkout);
   *  - unpaid/failed/unknown and older than 30 min → PENDING → EXPIRED via the
   *    state machine (PAYMENT_EXPIRED, reason recorded), then continue with a
   *    new checkout;
   *  - unpaid and younger than 30 min → resume the stored checkout URL for the
   *    same plan, or a clear message with the remaining wait;
   *  - Chapa unreachable → never expire on a guess; clear retry message.
   */
  private async resolvePendingChapa(
    payment: {
      id: string;
      txRef: string;
      planId: string;
      checkoutUrl: string | null;
      amount: string | number | Prisma.Decimal | null;
      createdAt: Date;
    },
    planId: string,
  ) {
    let json: ChapaVerifyResponse;
    try {
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/transaction/verify/${encodeURIComponent(payment.txRef)}`,
        { headers: { Authorization: `Bearer ${this.secretKey()}` } },
      );
      json = (await res.json()) as ChapaVerifyResponse;
    } catch (err) {
      await this.states
        .recordEvent(this.prisma, payment.id, PaymentEventType.CHAPA_VERIFY_UNREACHABLE, {
          fromStatus: 'PENDING',
          toStatus: 'PENDING',
          meta: {
            context: 'initialize-retry',
            error: err instanceof Error ? err.name : 'Error',
          },
        })
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        'We could not reach the payment gateway to check your previous checkout. It has NOT been expired — please try again in a minute.',
      );
    }

    const data = json.data ?? undefined;
    const paid = json.status === 'success' && data?.status === 'success';
    const settled = toDecimal(data?.amount);
    const expected = toDecimal(payment.amount);
    const exact =
      paid &&
      data?.tx_ref === payment.txRef &&
      typeof data?.currency === 'string' &&
      data.currency.toUpperCase() === 'ETB' &&
      Boolean(settled && expected && amountsEqual(settled, expected));

    if (exact) {
      await this.payments.finalizeApproval(payment.id, {
        chapaRef: data?.reference ?? undefined,
        paidAt: new Date(),
        // Verified gateway confirmation of an exact payment may revive a
        // checkout a concurrent request just closed as EXPIRED/CANCELLED.
        allowExpiredOrCancelled: true,
      });
      return {
        approved: true as const,
        txRef: payment.txRef,
        message:
          'Your previous payment was confirmed by the gateway and is now approved — your subscription is active.',
      };
    }

    const ageMs = Date.now() - new Date(payment.createdAt).getTime();
    if (ageMs <= ChapaService.ABANDON_AFTER_MS) {
      const remainingMin = Math.max(
        1,
        Math.ceil((ChapaService.ABANDON_AFTER_MS - ageMs) / 60000),
      );
      if (payment.planId === planId && payment.checkoutUrl) {
        return {
          checkoutUrl: payment.checkoutUrl,
          txRef: payment.txRef,
          resumed: true as const,
        };
      }
      throw new BadRequestException(
        `Your previous online checkout is still open — complete it within about ${remainingMin} min, or try again after it expires.`,
      );
    }

    const reason = `Abandoned checkout expired after ${Math.floor(ageMs / 60000)} min; Chapa reported "${data?.status ?? json.status ?? 'unknown'}" for ${payment.txRef}`;
    const expired = await this.prisma.$transaction((tx) =>
      this.states.transition(tx, payment.id, {
        from: ['PENDING'],
        to: 'EXPIRED',
        type: PaymentEventType.PAYMENT_EXPIRED,
        reason,
        data: { reviewedAt: new Date() },
      }),
    );
    if (!expired) {
      // Lost the race: another request resolved this row concurrently. If it
      // was approved, say so; otherwise ask for a retry.
      const fresh = await this.prisma.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      if (fresh?.status === 'APPROVED') {
        return {
          approved: true as const,
          txRef: payment.txRef,
          message:
            'Your previous payment was confirmed and approved — your subscription is active.',
        };
      }
      throw new BadRequestException(
        'Your previous payment was just resolved by another request. Please try again.',
      );
    }
    this.logger.warn(`Expired abandoned Chapa checkout ${payment.txRef}: ${reason}`);
    return null; // fall through: create a fresh checkout
  }

  /** PENDING → REJECTED via the state machine (guarded + event, one tx). */
  private async rejectInitialization(paymentId: string, reason: string) {
    await this.prisma.$transaction((tx) =>
      this.states.transition(tx, paymentId, {
        from: ['PENDING'],
        to: 'REJECTED',
        type: PaymentEventType.CHAPA_INIT_FAILED,
        reason,
        data: { rejectionReason: reason, reviewedAt: new Date() },
      }),
    );
  }

  /**
   * Webhook receiver. Chapa signs the raw request body with HMAC-SHA256 using
   * the webhook secret; we verify it before trusting anything, then confirm the
   * transaction through the verify endpoint (defence in depth).
   */
  async handleWebhook(
    rawBody: Buffer,
    signatures: ChapaWebhookSignatures,
  ): Promise<{ received: true }> {
    this.verifySignature(rawBody, signatures);

    let parsedEvent: unknown;
    try {
      parsedEvent = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (
      !parsedEvent ||
      typeof parsedEvent !== 'object' ||
      Array.isArray(parsedEvent)
    ) {
      throw new BadRequestException('Invalid webhook payload');
    }

    const txRef = (parsedEvent as { tx_ref?: unknown }).tx_ref;
    if (txRef !== undefined && typeof txRef !== 'string') {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (!txRef) {
      // Nothing actionable, but acknowledge so Chapa stops retrying.
      return { received: true };
    }

    await this.confirmAndApprove(txRef).catch((err) => {
      this.logger.error(`Webhook approval failed for ${txRef}: ${String(err)}`);
    });

    return { received: true };
  }

  async handleCallback(txRef: string): Promise<{ received: true }> {
    if (!txRef.startsWith('lm-')) {
      throw new BadRequestException('Invalid transaction reference');
    }
    await this.confirmAndApprove(txRef);
    return { received: true };
  }

  /**
   * Called by the browser callback page. Confirms ownership, then verifies and
   * approves if Chapa reports success. Lets the student see an instant result
   * even if the webhook is delayed.
   */
  async verifyByTxRef(txRef: string, requesterId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, userId: true, status: true, receiptNumber: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== requesterId) {
      throw new NotFoundException('Payment not found');
    }

    if (
      payment.status === 'PENDING' ||
      payment.status === 'EXPIRED' ||
      payment.status === 'CANCELLED'
    ) {
      await this.confirmAndApprove(txRef);
    }

    const fresh = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, status: true, receiptNumber: true },
    });

    return {
      paymentId: fresh?.id,
      status: fresh?.status ?? 'PENDING',
      receiptNumber: fresh?.receiptNumber ?? null,
    };
  }

  /** Verify a tx with Chapa and, if it succeeded, finalize the approval. */
  private async confirmAndApprove(txRef: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, status: true, amount: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'APPROVED') return; // idempotent

    let json: ChapaVerifyResponse;
    try {
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/transaction/verify/${encodeURIComponent(txRef)}`,
        { headers: { Authorization: `Bearer ${this.secretKey()}` } },
      );
      json = (await res.json()) as ChapaVerifyResponse;
    } catch (err) {
      // Network error or timeout: leave PENDING, record the event, never throw
      // into the webhook path (Chapa will retry; the browser callback can too).
      await this.states
        .recordEvent(this.prisma, payment.id, PaymentEventType.CHAPA_VERIFY_UNREACHABLE, {
          fromStatus: payment.status,
          toStatus: payment.status,
          meta: { error: err instanceof Error ? err.name : 'Error' },
        })
        .catch(() => undefined);
      this.logger.warn(
        `Chapa verify call failed for ${txRef}: ${err instanceof Error ? err.name : String(err)} — payment stays PENDING`,
      );
      return;
    }

    const data = json.data ?? undefined;
    const ok = json.status === 'success' && data?.status === 'success';
    if (!ok) {
      const chapaStatus = data?.status?.toLowerCase();
      const terminalFailure =
        json.status === 'success' &&
        Boolean(
          chapaStatus &&
          (chapaStatus.includes('failed') ||
            chapaStatus.includes('cancelled') ||
            chapaStatus.includes('canceled')),
        );

      if (terminalFailure) {
        // Guarded PENDING → REJECTED: if another caller already approved the
        // payment, this matches 0 rows and changes nothing (fixes the
        // approve-vs-failure race).
        await this.prisma.$transaction((tx) =>
          this.states.transition(tx, payment.id, {
            from: ['PENDING'],
            to: 'REJECTED',
            type: PaymentEventType.CHAPA_PAYMENT_FAILED,
            reason: `Chapa reported ${data?.status}`,
            data: {
              rejectionReason: `Chapa reported ${data?.status}`,
              chapaRef: data?.reference ?? undefined,
              reviewedAt: new Date(),
            },
          }),
        );
      }

      this.logger.warn(
        `Chapa verify not successful for ${txRef}: ${data?.status ?? json.message ?? 'unknown status'}`,
      );
      return;
    }

    // Exactness: the settled transaction must match our snapshot exactly.
    // Chapa's verify response reports `amount` (settled amount) separately
    // from `charge` (Chapa's fee — present when the customer bears the fee,
    // but NOT part of the amount we initialized), so `amount` is compared,
    // never `charge`. Any mismatch keeps the payment PENDING as an admin
    // exception — Chapa under/overpayment is never auto-approved and never
    // messaged to the customer with amounts.
    const mismatches: string[] = [];
    if (data?.tx_ref !== txRef) mismatches.push('tx_ref');
    if (
      typeof data?.currency !== 'string' ||
      data.currency.toUpperCase() !== 'ETB'
    ) {
      mismatches.push('currency');
    }
    const settled = toDecimal(data?.amount);
    const expected = toDecimal(payment.amount);
    if (!settled || !expected || !amountsEqual(settled, expected)) {
      mismatches.push('amount');
    }

    if (mismatches.length > 0) {
      const ref = data?.reference ?? txRef;
      await this.prisma.$transaction(async (tx) => {
        // Guarded: only annotate a payment that is still PENDING. If another
        // caller approved it in the race window, leave the approval intact.
        const marked = await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: {
            chapaRef: ref,
            verification: {
              reviewNote:
                'Chapa verification mismatch (amount/currency/tx_ref); manual review required.',
              decision: 'REVIEW',
              source: 'chapa',
              reference: ref,
              mismatchFields: mismatches,
              exception: true,
            } as Prisma.InputJsonValue,
          },
        });
        // An already-approved payment needs no exception; any other status
        // (EXPIRED/CANCELLED/REJECTED/REVERSED) keeps its status but records
        // the mismatch so a paid-but-inexact late transaction is not lost.
        if (marked.count > 0) {
          await this.states.recordEvent(
            tx,
            payment.id,
            PaymentEventType.CHAPA_VERIFY_MISMATCH,
            {
              fromStatus: 'PENDING',
              toStatus: 'PENDING',
              meta: {
                fields: mismatches,
                expected: expected?.toString() ?? null,
                reported: settled?.toString() ?? null,
                currency:
                  typeof data?.currency === 'string' ? data.currency : null,
              },
            },
          );
        } else if (payment.status !== 'APPROVED') {
          await this.states.recordEvent(
            tx,
            payment.id,
            PaymentEventType.CHAPA_VERIFY_MISMATCH,
            {
              fromStatus: payment.status,
              toStatus: payment.status,
              meta: {
                fields: mismatches,
                expected: expected?.toString() ?? null,
                reported: settled?.toString() ?? null,
                currency:
                  typeof data?.currency === 'string' ? data.currency : null,
              },
            },
          );
        }
      });
      this.logger.warn(
        `Chapa verify mismatch for ${txRef}: ${mismatches.join(',')} — payment stays ${payment.status} for manual review`,
      );
      return;
    }

    // REJECTED and REVERSED are fully terminal: a late exact payment must not
    // reopen them, but it must never be silently dropped either. Record the
    // money on the immutable ledger so an admin can refund/reconcile.
    if (payment.status === 'REVERSED' || payment.status === 'REJECTED') {
      await this.states.recordEvent(
        this.prisma,
        payment.id,
        PaymentEventType.CHAPA_LATE_PAYMENT_TERMINAL,
        {
          fromStatus: payment.status,
          toStatus: payment.status,
          reason: `Chapa verified an exact payment after the payment was ${payment.status}; terminal status kept for refund review`,
          meta: {
            txRef,
            chapaRef: data?.reference ?? null,
            amount: settled?.toString() ?? null,
            currency: 'ETB',
          },
        },
      );
      this.logger.error(
        `Late Chapa payment on ${payment.status} payment ${payment.id} (tx ${txRef}) — manual refund review required`,
      );
      return;
    }

    await this.payments.finalizeApproval(payment.id, {
      chapaRef: data?.reference ?? undefined,
      paidAt: new Date(),
      // Only the verified gateway path may revive EXPIRED/CANCELLED.
      allowExpiredOrCancelled: true,
    });
  }

  private verifySignature(rawBody: Buffer, signatures: ChapaWebhookSignatures) {
    const secret = this.config.get<string>('CHAPA_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('CHAPA_WEBHOOK_SECRET is not configured');
      throw new ServiceUnavailableException('Webhook not configured');
    }
    if (!signatures.chapaSignature && !signatures.payloadSignature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const expectedChapaSignature = crypto
      .createHmac('sha256', secret)
      .update(secret)
      .digest('hex');
    const expectedPayloadSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const chapaValid = this.signatureMatches(
      expectedChapaSignature,
      signatures.chapaSignature,
    );
    const payloadValid = this.signatureMatches(
      expectedPayloadSignature,
      signatures.payloadSignature,
    );
    if (!chapaValid && !payloadValid) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  private signatureMatches(expected: string, actual?: string): boolean {
    if (!actual) return false;
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return (
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private publicApiBase(): string {
    return (
      this.config.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${this.config.get<string>('PORT') ?? '4000'}`
    );
  }

  private publicWebBase(): string {
    return (
      this.config.get<string>('WEB_PUBLIC_URL') ??
      this.config.get<string>('CORS_ORIGIN') ??
      'http://localhost:3000'
    );
  }
}
