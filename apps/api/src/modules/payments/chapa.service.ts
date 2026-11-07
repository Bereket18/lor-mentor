import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { PaymentStateMachine } from './payment-state-machine';
import { PaymentEventType } from './payment-event.types';
import { amountsEqual, formatETB, toDecimal } from './money';

/**
 * Prisma returns JSON columns as `JsonValue`. Narrow a payment's
 * `verification` column to a mergeable record so annotating it (review
 * exception, mismatch fields, …) never discards evidence written earlier.
 */
function asJsonObject(
  value: Prisma.JsonValue | null | undefined,
): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

/**
 * Chapa's own id for a lifecycle event. Recognised under the documented
 * `reference` field and, when the payload omits it, under `id`/`event_id`.
 */
function lifecycleReference(event: Record<string, unknown>): string | null {
  for (const key of ['reference', 'id', 'event_id']) {
    const value = event[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

/** The reference an already-recorded lifecycle event carried, if any. */
function recordedLifecycleReference(
  meta: Prisma.JsonValue | null,
): string | null {
  const reference = asJsonObject(meta).reference;
  return typeof reference === 'string' && reference ? reference : null;
}

/**
 * A redelivered lifecycle event must add nothing to the append-only ledger:
 * same payment, same kind of event, same gateway reference. When either side
 * carries no reference at all (Chapa redelivers the body verbatim) it is a
 * replay of the most recent event of that kind, not a second occurrence.
 */
function isReplayedLifecycleEvent(
  meta: Prisma.JsonValue | null,
  reference: string | null,
): boolean {
  const recorded = recordedLifecycleReference(meta);
  if (reference === null || recorded === null) return true;
  return recorded === reference;
}

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
    /**
     * `test` or `live`. Documented in the verify response examples; the field
     * is checked only when present, because older/sandbox responses may omit
     * it and we must not invent a value.
     */
    mode?: string;
  } | null;
}

/**
 * PUT /v1/transaction/cancel/<tx_ref>. Success carries `data`; failure is
 * `{ "message": "...", "status": "failed", "data": null }`. The docs do not
 * document an "already paid" response, so any failure is confirmed with a
 * verify call before deciding.
 */
interface ChapaCancelResponse {
  status?: string;
  message?: string | Record<string, unknown>;
  data?: unknown;
}

/** Result of reconciling one webhook/payment confirmation. */
type ConfirmOutcome =
  | { kind: 'APPROVED' }
  /** Deterministically ignorable: 200 so Chapa stops retrying. */
  | { kind: 'IGNORED'; reason: string }
  /**
   * Transient: the webhook must return 5xx so Chapa retries.
   *
   * `moneyVerified` marks the case where Chapa *did* confirm an exact payment
   * and only our own claim failed — the student has paid, so the row is flagged
   * for admin review and the browser is told to wait rather than being shown a
   * success or a stale status. An unreachable/timeout verify never sets it.
   */
  | {
      kind: 'RETRY';
      reason: string;
      moneyVerified?: boolean;
      /** Status the row had when the verification succeeded. */
      currentStatus?: PaymentStatus;
    };

type CancelOutcome =
  | { kind: 'CANCELLED' }
  | { kind: 'ALREADY_PAID' }
  | { kind: 'UNREACHABLE'; error: string }
  | { kind: 'REFUSED'; reason: string };

type LifecycleEventKind = 'REFUND' | 'REVERSED' | 'FAILED';

/**
 * What the browser is told when Chapa confirmed the money but our row is not
 * approved yet. Shown instead of a success screen or a stale status, because
 * the worst outcome here is the student paying a second time.
 */
export const CHAPA_CONFIRMATION_PENDING_MESSAGE =
  'We have your payment, but the confirmation is still being processed. Please wait and do not pay again — your access activates automatically, and the receipt appears on your profile within a few minutes.';

/** State of one online payment as reported to the browser. */
export interface ChapaPaymentState {
  paymentId: string | null;
  status: PaymentStatus;
  receiptNumber: string | null;
  /** True while a confirmed payment cannot be shown as approved yet. */
  confirmationPending: boolean;
  /** Message the UI must show; null unless `confirmationPending`. */
  message: string | null;
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
  private readonly retryWindowMinutes: number;
  private readonly retryWindowMs: number;

  /**
   * A PENDING Chapa checkout younger than this is still "open": initialize()
   * resumes it instead of expiring it. This must match the checkout/retry
   * timeout configured in the Chapa dashboard (`CHAPA_RETRY_WINDOW_MINUTES`,
   * default 60). Older abandoned checkouts are closed only after Chapa
   * confirms the checkout link is dead (PUT /transaction/cancel), so a payment
   * is never abandoned on our clock alone.
   */
  static readonly DEFAULT_RETRY_WINDOW_MINUTES = 60;

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
    const configuredWindow = Number(
      this.config.get<string>('CHAPA_RETRY_WINDOW_MINUTES') ??
        String(ChapaService.DEFAULT_RETRY_WINDOW_MINUTES),
    );
    this.retryWindowMinutes =
      Number.isFinite(configuredWindow) && configuredWindow > 0
        ? Math.floor(configuredWindow)
        : ChapaService.DEFAULT_RETRY_WINDOW_MINUTES;
    this.retryWindowMs = this.retryWindowMinutes * 60_000;
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

  /**
   * GET /v1/transaction/verify/<tx_ref>. Throws on a network error/timeout so
   * callers can distinguish "gateway unreachable" (retry) from a documented
   * "not paid yet" response.
   */
  private async requestVerify(txRef: string): Promise<ChapaVerifyResponse> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(txRef)}`,
      { headers: { Authorization: `Bearer ${this.secretKey()}` } },
    );
    return (await res.json()) as ChapaVerifyResponse;
  }

  /**
   * The verified transaction's mode must match the environment: `live` in
   * production, `test` elsewhere. The field is documented but not guaranteed
   * on every response, so the check is conditional: absent mode never blocks
   * an otherwise exact payment.
   */
  private modeMatches(data: { mode?: string } | undefined): boolean {
    if (typeof data?.mode !== 'string' || !data.mode.trim()) return true;
    const environment =
      this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    const expected = environment === 'production' ? 'live' : 'test';
    return data.mode.trim().toLowerCase() === expected;
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
          `You already have a payment in progress. If it is a bank receipt it is awaiting admin review; if it is an online checkout, complete it, cancel it, or wait for it to expire (${this.retryWindowMinutes} minutes) before starting a new one.`,
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
   *  - unpaid/failed/unknown, older than the retry window → cancel the Chapa
   *    checkout first. Only a confirmed dead link is expired locally
   *    (PENDING → EXPIRED via the state machine, PAYMENT_EXPIRED), then a new
   *    checkout may proceed;
   *  - unpaid and younger than the retry window → resume the stored checkout
   *    URL for the same plan, or a clear message with the remaining wait;
   *  - Chapa unreachable or cancel refused → never expire on a guess; clear
   *    retry message and the row is left untouched.
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
      json = await this.requestVerify(payment.txRef);
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
      this.modeMatches(data) &&
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
    if (ageMs <= this.retryWindowMs) {
      const remainingMin = Math.max(
        1,
        Math.ceil((this.retryWindowMs - ageMs) / 60000),
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

    // Past the retry window. A payment is never abandoned on our clock alone:
    // close it at Chapa first and only expire our row once the link is dead.
    const cancel = await this.cancelAtChapa(payment.txRef);
    if (cancel.kind === 'ALREADY_PAID') {
      // The money moved; run the normal verification/approval path instead.
      const outcome = await this.confirmAndApprove(payment.txRef);
      if (outcome.kind === 'APPROVED') {
        return {
          approved: true as const,
          txRef: payment.txRef,
          message:
            'Your previous payment was confirmed and approved — your subscription is active.',
        };
      }
      throw new ServiceUnavailableException(
        'Your previous checkout was already paid at Chapa but still needs confirmation. It has NOT been expired — please try again in a minute or check your payment history.',
      );
    }
    if (cancel.kind === 'UNREACHABLE' || cancel.kind === 'REFUSED') {
      await this.states
        .recordEvent(
          this.prisma,
          payment.id,
          PaymentEventType.CHAPA_CANCEL_FAILED,
          {
            fromStatus: 'PENDING',
            toStatus: 'PENDING',
            reason:
              cancel.kind === 'UNREACHABLE'
                ? 'Chapa cancel call was unreachable; checkout left open'
                : `Chapa refused to cancel the checkout: ${cancel.reason}`,
            meta: { context: 'initialize-retry' },
          },
        )
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        'We could not cancel your previous checkout at the payment gateway. It has NOT been expired — please try again in a minute.',
      );
    }

    const reason = `Abandoned checkout expired after ${Math.floor(ageMs / 60000)} min; Chapa confirmed the checkout link is dead for ${payment.txRef}`;
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
   * Close a checkout at Chapa with PUT /v1/transaction/cancel/<tx_ref>.
   *
   * The cancel response is the only authority for "the link is dead":
   *  - documented success → CANCELLED;
   *  - documented failure ("Payment link already expired") → treated as
   *    CANCELLED only after a verify confirms no money moved;
   *  - any other failure → verify. A paid transaction means the money moved,
   *    so the caller must run the normal approval path instead (ALREADY_PAID);
   *  - network error/timeout on either call → UNREACHABLE (change nothing).
   */
  private async cancelAtChapa(txRef: string): Promise<CancelOutcome> {
    let res: Response;
    let json: ChapaCancelResponse;
    try {
      res = await this.fetchWithTimeout(
        `${this.baseUrl}/transaction/cancel/${encodeURIComponent(txRef)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${this.secretKey()}` },
        },
      );
      json = (await res.json()) as ChapaCancelResponse;
    } catch (err) {
      return {
        kind: 'UNREACHABLE',
        error: err instanceof Error ? err.name : 'Error',
      };
    }

    if (res.ok && json.status === 'success') {
      return { kind: 'CANCELLED' };
    }

    const message =
      typeof json.message === 'string' ? json.message : 'cancel failed';

    // A failed cancel is ambiguous (the docs do not define an "already paid"
    // response), so verify before changing anything.
    let verify: ChapaVerifyResponse;
    try {
      verify = await this.requestVerify(txRef);
    } catch (err) {
      return {
        kind: 'UNREACHABLE',
        error: err instanceof Error ? err.name : 'Error',
      };
    }

    const paid =
      verify.status === 'success' && verify.data?.status === 'success';
    if (paid) return { kind: 'ALREADY_PAID' };

    if (/already\s+expired/i.test(message)) {
      // The link is already dead and no money moved — the desired outcome.
      return { kind: 'CANCELLED' };
    }
    return { kind: 'REFUSED', reason: message };
  }

  /**
   * Student-initiated cancel of their own PENDING Chapa checkout. The gateway
   * is asked first; our row changes only after Chapa confirms the link is dead
   * (or the normal approval path runs when the checkout was already paid).
   */
  async cancelByStudent(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        userId: true,
        status: true,
        method: true,
        txRef: true,
      },
    });
    if (!payment || payment.userId !== userId) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status !== 'PENDING') {
      throw new BadRequestException('Only a pending payment can be cancelled');
    }
    if (payment.method !== 'CHAPA' || !payment.txRef) {
      // Bank-receipt payments are admin-review items; the service owns that
      // message and refuses the cancel.
      return this.payments.cancelOwn(paymentId, userId);
    }

    const cancel = await this.cancelAtChapa(payment.txRef);
    if (cancel.kind === 'CANCELLED') {
      try {
        return await this.payments.cancelOwn(paymentId, userId);
      } catch (err) {
        // Lost the race to a webhook approval. Report the real outcome rather
        // than overwriting it; anything else is a genuine error.
        if (err instanceof BadRequestException) {
          const fresh = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            select: { status: true },
          });
          if (fresh?.status === 'APPROVED') {
            return {
              message:
                'Your payment was already completed and approved — your subscription is active.',
            };
          }
        }
        throw err;
      }
    }

    if (cancel.kind === 'ALREADY_PAID') {
      const outcome = await this.confirmAndApprove(payment.txRef);
      if (outcome.kind === 'RETRY') {
        throw new ServiceUnavailableException(
          'This checkout was already paid at Chapa, but we could not confirm it yet. It has NOT been cancelled — please try again in a minute.',
        );
      }
      return {
        message:
          'This checkout was already paid at Chapa; your payment is being confirmed. Check your payment history in a moment.',
      };
    }

    if (cancel.kind === 'UNREACHABLE') {
      throw new ServiceUnavailableException(
        'We could not reach the payment gateway, so the checkout has NOT been cancelled. Please try again in a minute.',
      );
    }

    throw new BadRequestException(
      'Chapa could not cancel this checkout. It has NOT been cancelled — please try again, or complete it.',
    );
  }

  /**
   * Webhook receiver. Chapa signs the raw request body with HMAC-SHA256 using
   * the webhook secret; we verify it before trusting anything, then confirm the
   * transaction through the verify endpoint (defence in depth — the signed body
   * alone is never enough to activate a payment).
   *
   * Status codes are deliberate: Chapa retries every 10 minutes, up to 10
   * attempts over 72 hours, and stops at any 2xx.
   *  - 200: durably handled (approved) or deterministically ignorable
   *    (unknown reference, not paid yet, mismatch/terminal state, lifecycle
   *    event recorded);
   *  - 400: bad signature or malformed payload (never retryable);
   *  - 5xx: transient failure — verify timeout/unreachable or a database error
   *    — so Chapa retries without us losing the event.
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

    const event = parsedEvent as Record<string, unknown>;
    const txRef = event.tx_ref;
    if (txRef !== undefined && typeof txRef !== 'string') {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (!txRef) {
      // Nothing actionable, but acknowledge so Chapa stops retrying.
      return { received: true };
    }

    const lifecycle = this.classifyLifecycleEvent(event);
    if (lifecycle) {
      try {
        await this.handleLifecycleEvent(txRef, lifecycle, event);
      } catch (err) {
        // A DB write failed: the event is not durably recorded, so ask Chapa
        // to retry instead of acknowledging it.
        this.logger.error(
          `Chapa ${lifecycle} webhook failed for ${txRef}: ${String(err)}`,
        );
        throw new ServiceUnavailableException(
          'Webhook could not be recorded; Chapa should retry',
        );
      }
      return { received: true };
    }

    let outcome: ConfirmOutcome;
    try {
      outcome = await this.confirmAndApprove(txRef);
    } catch (err) {
      // Domain failures are deterministic (unknown reference or a race that
      // another caller already resolved) and must not make Chapa retry
      // forever. Anything else is transient: 5xx.
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        this.logger.warn(
          `Chapa webhook for ${txRef} ignored: ${err.message}`,
        );
        return { received: true };
      }
      this.logger.error(`Webhook approval failed for ${txRef}: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Webhook processing failed; Chapa should retry',
      );
    }

    if (outcome.kind === 'RETRY') {
      this.logger.warn(
        `Chapa webhook for ${txRef} not handled (${outcome.reason}); requesting a retry`,
      );
      throw new ServiceUnavailableException(
        'Chapa verification is temporarily unavailable; Chapa should retry',
      );
    }

    return { received: true };
  }

  /**
   * Classify a webhook by its documented `event` name, falling back to the
   * documented `status` value. Anything else (including `charge.success`) is
   * handled by the normal verify/approve path.
   */
  private classifyLifecycleEvent(
    event: Record<string, unknown>,
  ): LifecycleEventKind | null {
    const name =
      typeof event.event === 'string' ? event.event.toLowerCase() : '';
    const status =
      typeof event.status === 'string' ? event.status.toLowerCase() : '';
    if (name === 'charge.refunded' || status === 'refunded' || status === 'refunding') {
      return 'REFUND';
    }
    if (name === 'charge.reversed' || status === 'reversed') {
      return 'REVERSED';
    }
    if (
      name === 'charge.failed' ||
      status === 'failed' ||
      status === 'cancelled' ||
      status === 'canceled'
    ) {
      return 'FAILED';
    }
    return null;
  }

  /**
   * Record a refund, reversal, or failed/cancelled event on the immutable
   * ledger. Refund/reversal additionally flags an admin-queue exception when
   * the payment is APPROVED; the subscription is never auto-cancelled and the
   * payment status is never changed here (a human decides the refund).
   */
  private async handleLifecycleEvent(
    txRef: string,
    kind: LifecycleEventKind,
    event: Record<string, unknown>,
  ): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, status: true, verification: true, chapaRef: true },
    });
    if (!payment) {
      this.logger.warn(
        `Chapa ${kind} webhook for unknown tx_ref ${txRef} — ignored`,
      );
      return;
    }

    const reference = lifecycleReference(event);

    const meta = {
      txRef,
      event: typeof event.event === 'string' ? event.event : null,
      status: typeof event.status === 'string' ? event.status : null,
      amount:
        typeof event.amount === 'string' || typeof event.amount === 'number'
          ? event.amount
          : null,
      currency:
        typeof event.currency === 'string' ? event.currency : null,
      mode: typeof event.mode === 'string' ? event.mode : null,
      reference,
    } as Prisma.InputJsonValue;

    const type =
      kind === 'REFUND'
        ? PaymentEventType.CHAPA_REFUND_RECEIVED
        : kind === 'REVERSED'
          ? PaymentEventType.CHAPA_REVERSAL_RECEIVED
          : PaymentEventType.CHAPA_FAILED_OR_CANCELLED;

    // Chapa redelivers a webhook every ~10 minutes until it sees a 2xx (up to
    // 72 h), so the same refund/reversal/failed event can arrive many times —
    // and under either accepted signature header. The ledger is append-only, so
    // a duplicate is recognised *before* anything is written: no second row, no
    // second exception flag, no repeated admin noise.
    const recorded = await this.prisma.paymentEvent.findMany({
      where: { paymentId: payment.id, type },
      select: { id: true, meta: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    if (recorded.some((row) => isReplayedLifecycleEvent(row.meta, reference))) {
      this.logger.warn(
        `Duplicate Chapa ${kind} webhook for ${txRef} (reference ${reference ?? 'absent'}) — already recorded, nothing written`,
      );
      return;
    }

    if (kind === 'FAILED') {
      // Requirement: a failed/cancelled webhook changes no state beyond the
      // event. The normal verify path still guards actual payment failures.
      await this.states.recordEvent(
        this.prisma,
        payment.id,
        type,
        {
          fromStatus: payment.status,
          toStatus: payment.status,
          reason:
            'Chapa reported the transaction as failed/cancelled; status unchanged',
          meta,
        },
      );
      return;
    }

    const label = kind === 'REFUND' ? 'refund' : 'reversal';
    const flagException = payment.status === 'APPROVED';

    await this.prisma.$transaction(async (tx) => {
      await this.states.recordEvent(tx, payment.id, type, {
        fromStatus: payment.status,
        toStatus: payment.status,
        reason: flagException
          ? `Chapa reported a ${label} on an APPROVED payment; admin review required`
          : `Chapa reported a ${label}; no state change`,
        meta,
      });

      if (!flagException) return;

      // Merge into the existing verification blob so bank-receipt evidence
      // (when present) and earlier annotations are not lost.
      const existing = asJsonObject(payment.verification);
      await tx.payment.updateMany({
        where: { id: payment.id },
        data: {
          verification: {
            ...existing,
            decision: 'REVIEW',
            exception: true,
            reviewNote: `Chapa reported a ${label} for this approved payment; refund/reversal review required.`,
            chapaException: meta,
          } as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.warn(
      `Chapa ${label} recorded for ${payment.status} payment ${payment.id} (tx ${txRef})${flagException ? ' — admin exception flagged' : ''}`,
    );
  }

  async handleCallback(txRef: string): Promise<ChapaPaymentState> {
    if (!txRef.startsWith('lm-')) {
      throw new BadRequestException('Invalid transaction reference');
    }
    const outcome = await this.confirmAndApprove(txRef);
    return this.paymentState(txRef, outcome);
  }

  /**
   * Called by the browser callback page. Confirms ownership, then verifies and
   * approves if Chapa reports success. Lets the student see an instant result
   * even if the webhook is delayed.
   *
   * When Chapa confirmed the money but the row is not approved yet, the
   * response carries `confirmationPending` and the message to show — the page
   * must never present that state as "paid" or as the stale row status.
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

    let outcome: ConfirmOutcome = { kind: 'IGNORED', reason: 'nothing to confirm' };
    if (
      payment.status === 'PENDING' ||
      payment.status === 'EXPIRED' ||
      payment.status === 'CANCELLED'
    ) {
      outcome = await this.confirmAndApprove(txRef);
    }

    return this.paymentState(txRef, outcome);
  }

  /**
   * Current state of a payment plus the browser-facing confirmation flag. A
   * `RETRY` outcome means "we could not finish the confirmation right now":
   * the student must be told to wait, not shown a success or a stale status.
   */
  private async paymentState(
    txRef: string,
    outcome: ConfirmOutcome,
  ): Promise<ChapaPaymentState> {
    const fresh = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, status: true, receiptNumber: true },
    });

    if (outcome.kind === 'RETRY') {
      return {
        paymentId: fresh?.id ?? null,
        status: fresh?.status ?? 'PENDING',
        receiptNumber: fresh?.receiptNumber ?? null,
        confirmationPending: true,
        message: CHAPA_CONFIRMATION_PENDING_MESSAGE,
      };
    }

    return {
      paymentId: fresh?.id ?? null,
      status: fresh?.status ?? 'PENDING',
      receiptNumber: fresh?.receiptNumber ?? null,
      confirmationPending: false,
      message: null,
    };
  }

  /** Verify a tx with Chapa and, if it succeeded, finalize the approval. */
  private async confirmAndApprove(txRef: string): Promise<ConfirmOutcome> {
    const payment = await this.prisma.payment.findUnique({
      where: { txRef },
      select: {
        id: true,
        status: true,
        amount: true,
        // Needed to merge (never overwrite) the exception annotation below.
        verification: true,
      },
    });
    if (!payment) return { kind: 'IGNORED', reason: 'unknown tx_ref' };
    if (payment.status === 'APPROVED') return { kind: 'APPROVED' }; // idempotent

    let json: ChapaVerifyResponse;
    try {
      json = await this.requestVerify(txRef);
    } catch (err) {
      // Network error or timeout: leave the row untouched, record the event,
      // and tell the webhook caller to ask Chapa for a retry (5xx). The
      // browser callback/verify endpoint simply reports the current status.
      await this.states
        .recordEvent(this.prisma, payment.id, PaymentEventType.CHAPA_VERIFY_UNREACHABLE, {
          fromStatus: payment.status,
          toStatus: payment.status,
          meta: { error: err instanceof Error ? err.name : 'Error' },
        })
        .catch(() => undefined);
      this.logger.warn(
        `Chapa verify call failed for ${txRef}: ${err instanceof Error ? err.name : String(err)} — payment stays ${payment.status}`,
      );
      return { kind: 'RETRY', reason: 'verify unreachable' };
    }

    const data = json.data ?? undefined;
    const ok = json.status === 'success' && data?.status === 'success';
    if (!ok) {
      // A single verify response saying failed/cancelled is NOT terminal: the
      // customer may retry inside the retry window, and Chapa's docs do not
      // define what verify returns between attempts. Record the attempt and
      // keep the payment PENDING; lazy resolution closes it only after the
      // window via a confirmed Chapa cancel (PENDING → EXPIRED).
      const reported = data?.status ?? json.status ?? 'unknown';
      await this.states.recordEvent(
        this.prisma,
        payment.id,
        PaymentEventType.CHAPA_ATTEMPT_FAILED,
        {
          fromStatus: payment.status,
          toStatus: payment.status,
          reason: `Chapa verify reported "${reported}"; payment stays ${payment.status} (a single failed attempt is not terminal)`,
          meta: {
            reportedStatus:
              typeof reported === 'string' ? reported : String(reported),
            chapaRef: data?.reference ?? null,
            mode: typeof data?.mode === 'string' ? data.mode : null,
          },
        },
      );
      this.logger.warn(
        `Chapa verify not successful for ${txRef}: ${reported} — payment stays ${payment.status}`,
      );
      return { kind: 'IGNORED', reason: 'attempt not successful' };
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
    // Conditional on the field being present: a live payment verified while
    // the server is in test mode (or vice versa) is never auto-approved.
    if (!this.modeMatches(data)) mismatches.push('mode');

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
                'Chapa verification mismatch (amount/currency/tx_ref/mode); manual review required.',
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
                mode: typeof data?.mode === 'string' ? data.mode : null,
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
                mode: typeof data?.mode === 'string' ? data.mode : null,
              },
            },
          );
        }
      });
      this.logger.warn(
        `Chapa verify mismatch for ${txRef}: ${mismatches.join(',')} — payment stays ${payment.status} for manual review`,
      );
      return { kind: 'IGNORED', reason: 'verification mismatch' };
    }

    // REJECTED and REVERSED are fully terminal: a late exact payment must not
    // reopen them, but it must never be silently dropped either. Stamp the
    // gateway reference we do have, flag the review exception, and record the
    // money on the immutable ledger so an admin can refund/reconcile it. The
    // flag matters: without it (and without a chapaRef) an admin row for a
    // CHAPA/REJECTED payment is filtered out of the queue entirely.
    if (payment.status === 'REVERSED' || payment.status === 'REJECTED') {
      const verifiedRef = data?.reference ?? null;
      await this.prisma.$transaction(async (tx) => {
        await this.states.recordEvent(
          tx,
          payment.id,
          PaymentEventType.CHAPA_LATE_PAYMENT_TERMINAL,
          {
            fromStatus: payment.status,
            toStatus: payment.status,
            reason: `Chapa verified an exact payment after the payment was ${payment.status}; terminal status kept for refund review`,
            meta: {
              txRef,
              chapaRef: verifiedRef,
              amount: settled?.toString() ?? null,
              currency: 'ETB',
            },
          },
        );

        // Merge into the existing verification blob so bank-receipt evidence
        // and earlier annotations are not lost.
        const existing = asJsonObject(payment.verification);
        await tx.payment.updateMany({
          where: { id: payment.id },
          data: {
            ...(verifiedRef ? { chapaRef: verifiedRef } : {}),
            verification: {
              ...existing,
              decision: 'REVIEW',
              exception: true,
              reviewNote: `Chapa verified an exact payment for this ${payment.status} payment; refund review required (it cannot be approved).`,
              chapaException: {
                txRef,
                chapaRef: verifiedRef,
                amount: settled?.toString() ?? null,
                currency: 'ETB',
              },
            } as Prisma.InputJsonValue,
          },
        });
      });
      this.logger.error(
        `Late Chapa payment on ${payment.status} payment ${payment.id} (tx ${txRef}) — manual refund review required`,
      );
      return { kind: 'IGNORED', reason: 'terminal status' };
    }

    const finalized = await this.payments.finalizeApproval(payment.id, {
      chapaRef: data?.reference ?? undefined,
      paidAt: new Date(),
      // Only the verified gateway path may revive EXPIRED/CANCELLED.
      allowExpiredOrCancelled: true,
    });
    if (finalized && 'approved' in finalized && finalized.approved === false) {
      // finalizeApproval could not claim the row and no other caller approved
      // it (a concurrent cancel closed it, or it moved to a non-approvable
      // state). Nothing was activated, so do not report success: ask the
      // caller — a webhook turns this into 5xx — to retry, and a later attempt
      // re-verifies and revives the closed row. The money is real, so the row
      // is flagged and an event is written for the admin, and the browser is
      // told the confirmation is still pending (never "success").
      this.logger.error(
        `Chapa verified an exact payment for ${txRef} but the row is ${finalized.status ?? 'no longer approvable'}; not approved`,
      );
      await this.prisma.$transaction(async (tx) => {
        await this.states.recordEvent(
          tx,
          payment.id,
          PaymentEventType.CHAPA_VERIFY_NOT_APPROVED,
          {
            fromStatus: payment.status,
            toStatus: payment.status,
            reason: `Chapa verified an exact payment for ${txRef} but it could not be approved in this pass (${String(finalized.status ?? 'not approvable')}); waiting for a redelivery`,
            meta: {
              txRef,
              chapaRef: data?.reference ?? null,
              reportedStatus: String(finalized.status ?? ''),
            },
          },
        );
        // Guarded: if a concurrent caller approved the row in the meantime, do
        // not leave a stale review flag on a healthy payment.
        const flagged = await tx.payment.updateMany({
          where: { id: payment.id, status: { not: 'APPROVED' } },
          data: {
            verification: {
              ...asJsonObject(payment.verification),
              decision: 'REVIEW',
              exception: true,
              reviewNote:
                'Chapa verified this payment but it is not approved yet; it completes on the next redelivery.',
              chapaException: {
                txRef,
                chapaRef: data?.reference ?? null,
                reason: 'payment not approved in this pass',
              },
            } as Prisma.InputJsonValue,
          },
        });
        if (flagged.count === 0) {
          // The row was approved after all: the event above is enough.
          this.logger.warn(
            `Chapa payment ${payment.id} was approved concurrently; no exception flagged`,
          );
        }
      });
      return {
        kind: 'RETRY',
        reason: 'payment not approved',
        moneyVerified: true,
        currentStatus: payment.status,
      };
    }
    return { kind: 'APPROVED' };
  }

  /**
   * Verify the documented Chapa signature over the exact raw request body.
   *
   * Chapa documents two headers and either is sufficient:
   *  - `chapa-signature`: HMAC-SHA256 of the webhook secret, keyed with itself;
   *  - `x-chapa-signature`: HMAC-SHA256 of the event payload, keyed with the
   *    webhook secret.
   * We accept both and compare in constant time. This only proves the request
   * came from someone holding the secret; the **server-side verify call is the
   * real control** — no payment is ever approved from the signed body alone.
   */
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
