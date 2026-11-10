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
 * Chapa redelivers a webhook every ~10 minutes until it sees a 2xx, so the
 * same tx_ref can reach the exception paths repeatedly. Record at most one
 * admin-facing event of a given kind per tx_ref in this window: the event
 * exists to make verified money visible to an admin, and a fresh ledger row
 * per redelivery only adds noise without adding information.
 */
const TX_REF_EVENT_DEDUPE_MS = 10 * 60 * 1000;

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

/** Where a verified gateway result entered the system. */
export type GatewayPaymentSource =
  | 'webhook'
  | 'callback'
  | 'verify'
  | 'lazy-resolution'
  | 'reconciliation';

/**
 * The only authorised result of a Chapa verify call. `UNREACHABLE` is the one
 * transient case: no money evidence exists, so a webhook may ask Chapa to
 * retry. Every other value is a durable answer.
 */
export type GatewayVerifyResult =
  | { kind: 'VERIFIED'; response: ChapaVerifyResponse }
  | { kind: 'UNREACHABLE'; error: string };

/** The payment columns the gateway-money decision needs. */
export interface GatewayPaymentRow {
  id: string;
  status: PaymentStatus;
  txRef: string | null;
  amount: string | number | Prisma.Decimal | null;
  verification: Prisma.JsonValue | null;
  chapaRef: string | null;
  receiptNumber?: string | null;
}

/**
 * Total outcome of `processVerifiedGatewayPayment`. This is the single
 * vocabulary callers may branch on; no caller inspects a raw verify response
 * or calls `finalizeApproval` itself.
 *
 *  - APPROVED             — this call approved a PENDING payment.
 *  - ALREADY_APPROVED     — the row was already approved; nothing changed.
 *  - RECOVERED_LATE       — an exact payment revived an EXPIRED/CANCELLED row.
 *  - EXCEPTION_RECORDED   — verified money is not (and cannot be) approved in
 *                           this pass. The row is flagged for admin review.
 *  - RETRY                — transient only (the verify call itself failed).
 *  - NOT_PAID             — Chapa returned a durable "no money" answer.
 */
export type GatewayPaymentOutcome =
  | {
      kind: 'APPROVED';
      paymentId: string;
      status: 'APPROVED';
      receiptNumber: string | null;
    }
  | {
      kind: 'ALREADY_APPROVED';
      paymentId: string;
      status: 'APPROVED';
      receiptNumber: string | null;
    }
  | {
      kind: 'RECOVERED_LATE';
      paymentId: string;
      status: 'APPROVED';
      receiptNumber: string | null;
      recoveredFromStatus: 'EXPIRED' | 'CANCELLED';
    }
  | {
      kind: 'EXCEPTION_RECORDED';
      paymentId: string;
      status: PaymentStatus;
      reason: 'VERIFICATION_MISMATCH' | 'TERMINAL_STATUS' | 'NOT_APPROVABLE';
    }
  | { kind: 'RETRY'; paymentId: string; reason: 'VERIFY_UNREACHABLE' }
  | { kind: 'NOT_PAID'; paymentId: string; status: PaymentStatus };

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

/**
 * The one sentence shown when verified money cannot be approved in this pass
 * (a terminal row, an amount/currency/mode mismatch, or a lost claim). It must
 * never read as a failure: the college has the money and will handle any
 * refund. The web app renders the same sentence from
 * `paymentUnderReviewMessage()` so the two cannot drift.
 */
export function chapaUnderReviewMessage(reference: string): string {
  return (
    'We have received your payment. It is under review and any refund ' +
    `will be handled by the college. Reference ${reference}.`
  );
}

/** State of one online payment as reported to the browser. */
export interface ChapaPaymentState {
  paymentId: string | null;
  status: PaymentStatus;
  receiptNumber: string | null;
  /**
   * Chapa positively confirmed money for this reference. Once true, the page
   * must never describe the payment as "not charged".
   */
  moneyVerified: boolean;
  /** Verified money is not approved: show the review sentence. */
  underReview: boolean;
  /** True while a confirmed payment cannot be shown as approved yet. */
  confirmationPending: boolean;
  /** Message the UI must show; null when the row speaks for itself. */
  message: string | null;
  /** The gateway outcome, so the UI can make an explicit choice. */
  outcome: GatewayPaymentOutcome['kind'];
  /** Set when an EXPIRED/CANCELLED row was revived by verified money. */
  recoveredFromStatus: 'EXPIRED' | 'CANCELLED' | null;
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
 *  4. every entry point (webhook, callback, verify endpoint, lazy resolution)
 *     calls processVerifiedGatewayPayment(), the one function allowed to act
 *     on Chapa-verified money; it hands off to PaymentsService.finalizeApproval
 *     (idempotent) or records an admin-visible exception.
 *
 * Hardening rules (owner-approved policy):
 *  - the verified amount must equal the snapshotted amount EXACTLY, and the
 *    verify response's tx_ref and currency (ETB) must match; any mismatch on
 *    ANY status (including REJECTED/REVERSED/EXPIRED/CANCELLED) records an
 *    admin-visible exception — never auto-approved;
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
    // Lazy resolution is just another entry point into the single gateway
    // decision function — it never approves or records money itself. The
    // function re-reads the row, so a concurrent admin reject or student cancel
    // is respected.
    const outcome = await this.resolveChapaMoney(payment.txRef);

    if (
      outcome.kind === 'APPROVED' ||
      outcome.kind === 'ALREADY_APPROVED' ||
      outcome.kind === 'RECOVERED_LATE'
    ) {
      return {
        approved: true as const,
        txRef: payment.txRef,
        message:
          'Your previous payment was confirmed by the gateway and is now approved — your subscription is active.',
      };
    }
    if (outcome.kind === 'EXCEPTION_RECORDED') {
      // Verified money we could not approve: report review, never "approved"
      // and never a retry error the student cannot act on.
      return {
        approved: false as const,
        review: true as const,
        txRef: payment.txRef,
        message: chapaUnderReviewMessage(payment.txRef),
      };
    }
    if (outcome.kind === 'RETRY') {
      throw new ServiceUnavailableException(
        'We could not reach the payment gateway to check your previous checkout. It has NOT been expired — please try again in a minute.',
      );
    }

    // `NOT_PAID`: no money evidence. The age/cancel/expiry flow below decides
    // whether to resume the checkout or close it.
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
      // The money moved; run the single verified-gateway path instead.
      const outcome = await this.confirmGatewayPayment(
        payment.txRef,
        'lazy-resolution',
      );
      if (
        outcome.kind === 'APPROVED' ||
        outcome.kind === 'ALREADY_APPROVED' ||
        outcome.kind === 'RECOVERED_LATE'
      ) {
        return {
          approved: true as const,
          txRef: payment.txRef,
          message:
            'Your previous payment was confirmed and approved — your subscription is active.',
        };
      }
      if (outcome.kind === 'EXCEPTION_RECORDED') {
        return {
          approved: false as const,
          review: true as const,
          txRef: payment.txRef,
          message: chapaUnderReviewMessage(payment.txRef),
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
      const outcome = await this.confirmGatewayPayment(
        payment.txRef,
        'callback',
      );
      if (outcome.kind === 'RETRY') {
        throw new ServiceUnavailableException(
          'This checkout was already paid at Chapa, but we could not confirm it yet. It has NOT been cancelled — please try again in a minute.',
        );
      }
      if (outcome.kind === 'EXCEPTION_RECORDED') {
        return {
          message:
            'This checkout was already paid at Chapa. The payment is under review and any refund will be handled by the college — it has NOT been cancelled.',
          review: true,
        };
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
   * Admin reject, gateway-aware.
   *
   * A PENDING Chapa checkout is still a live link at the gateway: rejecting it
   * locally without closing it leaves a checkout the student can complete
   * afterwards — money that arrives after the rejection and has to be found
   * later. So the same cancel endpoint the expiry and student-cancel paths
   * use is called first:
   *  - Chapa confirms the link is dead → the ordinary reject transition runs;
   *  - Chapa reports the checkout as already paid → the reject is REFUSED.
   *    The money is real, so the admin is sent to the verified-payment path
   *    (the gateway verification approves it, or records it as a review
   *    exception) instead of marking it rejected;
   *  - Chapa is unreachable or refuses → nothing changes locally.
   *
   * MANUAL payments are admin-review items with no gateway checkout, so they
   * go straight to the service.
   */
  async rejectByAdmin(paymentId: string, adminId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, method: true, txRef: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') {
      throw new BadRequestException('Payment has already been reviewed');
    }
    if (payment.method !== 'CHAPA' || !payment.txRef) {
      return this.payments.reject(paymentId, adminId, reason);
    }

    const cancel = await this.cancelAtChapa(payment.txRef);
    if (cancel.kind === 'CANCELLED') {
      try {
        return await this.payments.reject(paymentId, adminId, reason);
      } catch (err) {
        // Lost the claim to a concurrent approval: report the real outcome
        // rather than a rejection that never happened.
        if (err instanceof BadRequestException) {
          const fresh = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            select: { status: true },
          });
          if (fresh?.status === 'APPROVED') {
            throw new BadRequestException(
              'Chapa confirmed this payment while the reject was in flight, so it is APPROVED — it has NOT been rejected. It is on the approved list with its receipt.',
            );
          }
        }
        throw err;
      }
    }

    if (cancel.kind === 'ALREADY_PAID') {
      throw new BadRequestException(
        'Chapa reports this checkout as already paid, so it has NOT been rejected. Do not reject it: the gateway verification approves it, and if it cannot be approved it appears in the Exceptions tab for refund review.',
      );
    }

    if (cancel.kind === 'UNREACHABLE') {
      throw new ServiceUnavailableException(
        'We could not reach the payment gateway, so the payment has NOT been rejected. Please try again in a minute.',
      );
    }

    throw new BadRequestException(
      'Chapa could not close this checkout, so the payment has NOT been rejected. Please try again.',
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
    const signature = this.verifySignature(rawBody, signatures);

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
        if (!signature.bodyBound) {
          // The static header is not bound to this body: it cannot authorize
          // a refund/reversal. Record the evidence and change nothing.
          await this.recordUnverifiedLifecycleEvent(txRef, lifecycle, event);
        } else {
          await this.handleLifecycleEvent(txRef, lifecycle, event);
        }
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

    let outcome: GatewayPaymentOutcome;
    try {
      outcome = await this.confirmGatewayPayment(txRef, 'webhook');
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
      // The only RETRY is a transient verify failure. Verified money always
      // returns APPROVED / ALREADY_APPROVED / RECOVERED_LATE or
      // EXCEPTION_RECORDED, so a terminal row never makes Chapa retry.
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
   * Record a lifecycle event that arrived with only the static
   * `chapa-signature` header. That header is a hash of the secret keyed with
   * itself: it proves the sender knows the secret, but it is identical for
   * every request, so it cannot show that THIS refund/reversal body is the one
   * Chapa sent. It is therefore never trusted to change money state — the
   * event is written to the ledger as evidence (no exception flag, no status
   * change) and the webhook still answers 200 so Chapa stops retrying. The
   * admin Exceptions tab counts rows carrying these events, so unverified
   * gateway traffic is visible without being silently discarded.
   */
  private async recordUnverifiedLifecycleEvent(
    txRef: string,
    kind: LifecycleEventKind,
    event: Record<string, unknown>,
  ): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, status: true },
    });
    if (!payment) {
      this.logger.warn(
        `Unverified Chapa ${kind} webhook for unknown tx_ref ${txRef} — ignored`,
      );
      return;
    }

    const reference = lifecycleReference(event);

    const meta = {
      txRef,
      kind,
      event: typeof event.event === 'string' ? event.event : null,
      status: typeof event.status === 'string' ? event.status : null,
      amount:
        typeof event.amount === 'string' || typeof event.amount === 'number'
          ? event.amount
          : null,
      currency: typeof event.currency === 'string' ? event.currency : null,
      reference,
      signatureHeader: 'chapa-signature',
    } as Prisma.InputJsonValue;

    // Redeliveries are deduplicated exactly like trusted lifecycle events, so
    // a retried static-signature webhook cannot flood the ledger. The advisory
    // lock makes the check-then-write atomic: two concurrent redeliveries
    // cannot both observe "no previous row" and both insert one.
    const written = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payment-lifecycle'), hashtext(${`${payment.id}:${PaymentEventType.CHAPA_LIFECYCLE_UNVERIFIED}`}))`;
      const recorded = await tx.paymentEvent.findMany({
        where: {
          paymentId: payment.id,
          type: PaymentEventType.CHAPA_LIFECYCLE_UNVERIFIED,
        },
        select: { id: true, meta: true },
        orderBy: { createdAt: 'desc' },
        take: 25,
      });
      if (
        recorded.some((row) => isReplayedLifecycleEvent(row.meta, reference))
      ) {
        return false;
      }
      await this.states.recordEvent(
        tx,
        payment.id,
        PaymentEventType.CHAPA_LIFECYCLE_UNVERIFIED,
        {
          fromStatus: payment.status,
          toStatus: payment.status,
          reason: `Chapa ${kind} webhook carried only the static signature (no body-bound x-chapa-signature); recorded as unverified evidence, no state changed`,
          meta,
        },
      );
      return true;
    });

    if (!written) {
      this.logger.warn(
        `Duplicate unverified Chapa ${kind} webhook for ${txRef} — already recorded`,
      );
      return;
    }

    this.logger.warn(
      `Unverified Chapa ${kind} webhook recorded for ${txRef} — static signature only, no state changed`,
    );
  }

  /**
   * Record a refund, reversal, or failed/cancelled event on the immutable
   * ledger. Refund and reversal always flag an admin-queue exception and
   * stamp the gateway reference, whatever the payment status: the status is
   * never changed here (a human decides the refund), but the money movement
   * must never be hidden just because the row was not APPROVED.
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

    // Human-readable kind for the log line at the end of this method. The
    // refund/reversal branch below reuses it verbatim inside the transaction.
    const label =
      kind === 'REFUND'
        ? 'refund'
        : kind === 'REVERSED'
          ? 'reversal'
          : 'failed/cancelled';

    // Chapa redelivers a webhook every ~10 minutes until it sees a 2xx (up to
    // 72 h), so the same refund/reversal/failed event can arrive many times —
    // and under either accepted signature header. The ledger is append-only, so
    // a duplicate is recognised *before* anything is written: no second row, no
    // second exception flag, no repeated admin noise. The advisory lock makes
    // the check-then-write atomic across concurrent redeliveries (F5).
    const written = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payment-lifecycle'), hashtext(${`${payment.id}:${type}`}))`;
      const recorded = await tx.paymentEvent.findMany({
        where: { paymentId: payment.id, type },
        select: { id: true, meta: true },
        orderBy: { createdAt: 'desc' },
        take: 25,
      });
      if (
        recorded.some((row) => isReplayedLifecycleEvent(row.meta, reference))
      ) {
        return false;
      }

      if (kind === 'FAILED') {
        // Requirement: a failed/cancelled webhook changes no state beyond the
        // event. The normal verify path still guards actual payment failures.
        await this.states.recordEvent(tx, payment.id, type, {
          fromStatus: payment.status,
          toStatus: payment.status,
          reason:
            'Chapa reported the transaction as failed/cancelled; status unchanged',
          meta,
        });
        return true;
      }

      // A refund/reversal can land on a row in ANY status — a pending checkout
      // can be refunded, and money can be refunded after we expired, cancelled
      // or rejected the row. Keep the status (a human decides the refund), but
      // always persist the evidence: the gateway reference (only when the row
      // has none of its own — the checkout reference is authoritative) and the
      // review exception, which is what the admin Exceptions tab keys on.
      const verifiedRef = payment.chapaRef ? null : reference;

      await this.states.recordEvent(tx, payment.id, type, {
        fromStatus: payment.status,
        toStatus: payment.status,
        reason: `Chapa reported a ${label} on a ${payment.status} payment; admin review required`,
        meta,
      });

      // Merge into the existing verification blob so bank-receipt evidence
      // (when present) and earlier annotations are not lost.
      const existing = asJsonObject(payment.verification);
      await tx.payment.updateMany({
        where: { id: payment.id },
        data: {
          ...(verifiedRef ? { chapaRef: verifiedRef } : {}),
          verification: {
            ...existing,
            decision: 'REVIEW',
            exception: true,
            reviewNote: `Chapa reported a ${label} for this ${payment.status} payment; refund/reversal review required.`,
            chapaException: meta,
          } as Prisma.InputJsonValue,
        },
      });
      return true;
    });

    if (!written) {
      this.logger.warn(
        `Duplicate Chapa ${kind} webhook for ${txRef} (reference ${reference ?? 'absent'}) — already recorded, nothing written`,
      );
      return;
    }

    this.logger.warn(
      `Chapa ${label} recorded for ${payment.status} payment ${payment.id} (tx ${txRef}) — admin exception flagged`,
    );
  }

  async handleCallback(txRef: string): Promise<ChapaPaymentState> {
    if (!txRef.startsWith('lm-')) {
      throw new BadRequestException('Invalid transaction reference');
    }
    const outcome = await this.confirmGatewayPayment(txRef, 'callback');
    return this.paymentState(txRef, outcome);
  }

  /**
   * Called by the browser callback page. Confirms ownership, then verifies and
   * approves if Chapa reports success. Lets the student see an instant result
   * even if the webhook is delayed.
   *
   * F2: REJECTED and REVERSED rows are re-confirmed too. Refusing to ask
   * Chapa about a terminal row is exactly how verified money gets dropped.
   *
   * When Chapa confirmed the money but the row is not approved, the response
   * carries `underReview` (or `confirmationPending` for a transient verify)
   * and the message to show — the page must never present that state as
   * "not charged" or as the stale row status.
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

    // An approved row is already the terminal money state; re-verifying it
    // could never change the student's view, so skip the gateway call.
    const outcome: GatewayPaymentOutcome =
      payment.status === 'APPROVED'
        ? {
            kind: 'ALREADY_APPROVED',
            paymentId: payment.id,
            status: 'APPROVED',
            receiptNumber: payment.receiptNumber,
          }
        : await this.confirmGatewayPayment(txRef, 'verify');

    return this.paymentState(txRef, outcome);
  }

  /**
   * Current state of a payment plus the browser-facing flags. The mapping is
   * total over `GatewayPaymentOutcome`:
   *
   *  - APPROVED / ALREADY_APPROVED / RECOVERED_LATE → success.
   *  - EXCEPTION_RECORDED → `moneyVerified` + `underReview`; the page shows
   *    the exact review sentence and never a failure.
   *  - RETRY → `confirmationPending` (the gateway could not be reached; we do
   *    not know whether money moved, so never claim it did not).
   *  - NOT_PAID → the row's own status, with no money claim.
   */
  private async paymentState(
    txRef: string,
    outcome: GatewayPaymentOutcome,
  ): Promise<ChapaPaymentState> {
    const fresh = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, status: true, receiptNumber: true },
    });

    const base = {
      paymentId: fresh?.id ?? (outcome.paymentId || null),
      status: fresh?.status ?? 'PENDING',
      receiptNumber: fresh?.receiptNumber ?? null,
      recoveredFromStatus:
        outcome.kind === 'RECOVERED_LATE' ? outcome.recoveredFromStatus : null,
      outcome: outcome.kind,
    } as const;

    switch (outcome.kind) {
      case 'APPROVED':
      case 'ALREADY_APPROVED':
      case 'RECOVERED_LATE':
        return {
          ...base,
          moneyVerified: true,
          underReview: false,
          confirmationPending: false,
          message: null,
        };
      case 'EXCEPTION_RECORDED':
        return {
          ...base,
          moneyVerified: true,
          underReview: true,
          confirmationPending: true,
          message: chapaUnderReviewMessage(txRef),
        };
      case 'RETRY':
        return {
          ...base,
          moneyVerified: false,
          underReview: false,
          confirmationPending: true,
          message: CHAPA_CONFIRMATION_PENDING_MESSAGE,
        };
      default:
        return {
          ...base,
          moneyVerified: false,
          underReview: false,
          confirmationPending: false,
          message: null,
        };
    }
  }

  /** Load exactly the columns the gateway-money decision needs. */
  private loadGatewayPayment(txRef: string): Promise<GatewayPaymentRow | null> {
    return this.prisma.payment.findUnique({
      where: { txRef },
      select: {
        id: true,
        status: true,
        txRef: true,
        amount: true,
        verification: true,
        chapaRef: true,
        receiptNumber: true,
      },
    });
  }

  /** Ask Chapa for the authoritative verify response; never throws. */
  private async verifyAtGateway(txRef: string): Promise<GatewayVerifyResult> {
    try {
      return { kind: 'VERIFIED', response: await this.requestVerify(txRef) };
    } catch (err) {
      return {
        kind: 'UNREACHABLE',
        error: err instanceof Error ? err.name : 'Error',
      };
    }
  }

  /**
   * Thin adapter shared by the webhook, browser callback, verify endpoint and
   * lazy resolution: load the row, ask Chapa, then delegate to
   * `processVerifiedGatewayPayment`. It contains no money logic of its own —
   * that function is the only place allowed to approve, revive, or record a
   * verified gateway payment.
   */
  private async confirmGatewayPayment(
    txRef: string,
    source: GatewayPaymentSource,
  ): Promise<GatewayPaymentOutcome> {
    const payment = await this.loadGatewayPayment(txRef);
    if (!payment) {
      // Unknown reference: deterministic, never retried.
      return { kind: 'NOT_PAID', paymentId: '', status: 'PENDING' };
    }
    const verifyResult = await this.verifyAtGateway(txRef);
    // The row was loaded *by* this txRef, so it always carries it; fill it in
    // defensively so the decision function can never see a null reference.
    return this.processVerifiedGatewayPayment(
      { ...payment, txRef: payment.txRef ?? txRef },
      verifyResult,
      source,
    );
  }

  /**
   * Public lazy-resolution entry point: gateway money that arrives for an
   * existing checkout is confirmed through exactly the same single decision
   * function as the webhook, browser callback and verify endpoint.
   * `initialize()` reaches it through `resolvePendingChapa`; exposing it keeps
   * "lazy resolution" a first-class, independently testable seam (the gateway
   * matrix drives every row status through it).
   */
  resolveChapaMoney(txRef: string): Promise<GatewayPaymentOutcome> {
    return this.confirmGatewayPayment(txRef, 'lazy-resolution');
  }

  /**
   * THE single decision point for Chapa-verified money.
   *
   * The webhook, browser callback, verify endpoint, lazy checkout resolution
   * and any future reconciliation job MUST call this method. Nothing else may
   * call `finalizeApproval` for gateway money.
   *
   * Invariant: when Chapa verified an exact payment for the txRef, the result
   * is APPROVED / ALREADY_APPROVED / RECOVERED_LATE (row APPROVED with an
   * active subscription) or EXCEPTION_RECORDED (row admin-visible with
   * `verification.exception = true`). It never returns RETRY for verified
   * money, so a webhook never 5xxes a terminal row and the student is never
   * told they were not charged.
   */
  async processVerifiedGatewayPayment(
    payment: GatewayPaymentRow,
    verifyResult: GatewayVerifyResult,
    source: GatewayPaymentSource,
  ): Promise<GatewayPaymentOutcome> {
    const txRef = payment.txRef;
    if (!txRef) {
      return {
        kind: 'NOT_PAID',
        paymentId: payment.id,
        status: payment.status,
      };
    }

    if (verifyResult.kind === 'UNREACHABLE') {
      // No money evidence exists. This is the only genuinely transient case:
      // leave the row untouched and let the caller ask Chapa to retry.
      await this.states
        .recordEvent(
          this.prisma,
          payment.id,
          PaymentEventType.CHAPA_VERIFY_UNREACHABLE,
          {
            fromStatus: payment.status,
            toStatus: payment.status,
            meta: { source, error: verifyResult.error },
          },
        )
        .catch(() => undefined);
      this.logger.warn(
        `Chapa verify call failed for ${txRef} (${source}): ${verifyResult.error} — payment stays ${payment.status}`,
      );
      return {
        kind: 'RETRY',
        paymentId: payment.id,
        reason: 'VERIFY_UNREACHABLE',
      };
    }

    const { response } = verifyResult;
    const data = response.data ?? undefined;
    const paid = response.status === 'success' && data?.status === 'success';

    if (!paid) {
      if (payment.status === 'APPROVED') {
        // A contradictory verify never downgrades an approved payment.
        return this.alreadyApproved(payment);
      }
      // A single verify response saying failed/cancelled is NOT terminal: the
      // customer may retry inside the retry window. Record the attempt and
      // keep the row as it is; no money was verified.
      const reported = data?.status ?? response.status ?? 'unknown';
      await this.states
        .recordEvent(
          this.prisma,
          payment.id,
          PaymentEventType.CHAPA_ATTEMPT_FAILED,
          {
            fromStatus: payment.status,
            toStatus: payment.status,
            reason: `Chapa verify reported "${reported}"; payment stays ${payment.status} (a single failed attempt is not terminal)`,
            meta: {
              source,
              reportedStatus:
                typeof reported === 'string' ? reported : String(reported),
              chapaRef: data?.reference ?? null,
              mode: typeof data?.mode === 'string' ? data.mode : null,
            },
          },
        )
        .catch(() => undefined);
      this.logger.warn(
        `Chapa verify not successful for ${txRef} (${source}): ${reported} — payment stays ${payment.status}`,
      );
      return {
        kind: 'NOT_PAID',
        paymentId: payment.id,
        status: payment.status,
      };
    }

    const mismatches = this.verificationMismatches(payment, data, txRef);

    // An approved row can never be re-approved or downgraded. An inexact
    // verify is still recorded for the admin: it may be a real anomaly.
    if (payment.status === 'APPROVED') {
      if (mismatches.length > 0) {
        await this.recordVerificationMismatch(
          payment,
          txRef,
          mismatches,
          data,
          source,
        );
        return {
          kind: 'EXCEPTION_RECORDED',
          paymentId: payment.id,
          status: payment.status,
          reason: 'VERIFICATION_MISMATCH',
        };
      }
      return this.alreadyApproved(payment);
    }

    // Inexact verified money is never approved, on ANY status. F1/F4: terminal
    // rows (REJECTED/REVERSED/EXPIRED/CANCELLED) get exactly the same durable,
    // admin-visible treatment as a PENDING row.
    if (mismatches.length > 0) {
      await this.recordVerificationMismatch(
        payment,
        txRef,
        mismatches,
        data,
        source,
      );
      return {
        kind: 'EXCEPTION_RECORDED',
        paymentId: payment.id,
        status: payment.status,
        reason: 'VERIFICATION_MISMATCH',
      };
    }

    // Exact verified money. REJECTED/REVERSED are not revivable: keep the
    // status and make the money visible for refund review.
    if (payment.status === 'REJECTED' || payment.status === 'REVERSED') {
      await this.recordLatePaymentOnTerminalRow(payment, txRef, {
        reference: data?.reference ?? null,
        amount: toDecimal(data?.amount)?.toString() ?? null,
        source,
      });
      return {
        kind: 'EXCEPTION_RECORDED',
        paymentId: payment.id,
        status: payment.status,
        reason: 'TERMINAL_STATUS',
      };
    }

    // PENDING -> APPROVED, or EXPIRED/CANCELLED revived by verified money.
    const closed =
      payment.status === 'EXPIRED' || payment.status === 'CANCELLED';
    let finalized: Awaited<ReturnType<PaymentsService['finalizeApproval']>>;
    try {
      finalized = await this.payments.finalizeApproval(payment.id, {
        chapaRef: data?.reference ?? undefined,
        paidAt: new Date(),
        allowExpiredOrCancelled: true,
      });
    } catch (err) {
      if (err instanceof BadRequestException) {
        // finalizeApproval refuses a terminal row (or a lost claim). Re-read
        // and persist the real state rather than dropping verified money.
        const fresh = await this.reloadGatewayPayment(payment.id);
        if (fresh?.status === 'APPROVED') return this.alreadyApproved(fresh);
        if (
          fresh &&
          (fresh.status === 'REJECTED' || fresh.status === 'REVERSED')
        ) {
          await this.recordLatePaymentOnTerminalRow(fresh, txRef, {
            reference: data?.reference ?? null,
            amount: toDecimal(data?.amount)?.toString() ?? null,
            source,
          });
          return {
            kind: 'EXCEPTION_RECORDED',
            paymentId: payment.id,
            status: fresh.status,
            reason: 'TERMINAL_STATUS',
          };
        }
        await this.recordNotApprovableException(
          fresh ?? payment,
          txRef,
          data,
          source,
        );
        return {
          kind: 'EXCEPTION_RECORDED',
          paymentId: payment.id,
          status: fresh?.status ?? payment.status,
          reason: 'NOT_APPROVABLE',
        };
      }
      // A genuine transient failure (database, etc.): the caller may retry.
      throw err;
    }

    if ('alreadyApproved' in finalized && finalized.alreadyApproved) {
      return this.alreadyApproved(payment);
    }
    if ('approved' in finalized && finalized.approved === false) {
      // Lost the claim to another writer. Re-read and record the real state;
      // never RETRY when the money is verified.
      const fresh = await this.reloadGatewayPayment(payment.id);
      if (fresh?.status === 'APPROVED') return this.alreadyApproved(fresh);
      if (fresh && (fresh.status === 'REJECTED' || fresh.status === 'REVERSED')) {
        await this.recordLatePaymentOnTerminalRow(fresh, txRef, {
          reference: data?.reference ?? null,
          amount: toDecimal(data?.amount)?.toString() ?? null,
          source,
        });
        return {
          kind: 'EXCEPTION_RECORDED',
          paymentId: payment.id,
          status: fresh.status,
          reason: 'TERMINAL_STATUS',
        };
      }
      await this.recordNotApprovableException(
        fresh ?? payment,
        txRef,
        data,
        source,
      );
      return {
        kind: 'EXCEPTION_RECORDED',
        paymentId: payment.id,
        status: fresh?.status ?? finalized.status ?? payment.status,
        reason: 'NOT_APPROVABLE',
      };
    }

    const receiptNumber =
      'receiptNumber' in finalized ? (finalized.receiptNumber ?? null) : null;
    if (closed) {
      return {
        kind: 'RECOVERED_LATE',
        paymentId: payment.id,
        status: 'APPROVED',
        receiptNumber,
        recoveredFromStatus: payment.status as 'EXPIRED' | 'CANCELLED',
      };
    }
    return {
      kind: 'APPROVED',
      paymentId: payment.id,
      status: 'APPROVED',
      receiptNumber,
    };
  }

  /** Reload a payment with exactly the gateway-decision columns. */
  private reloadGatewayPayment(
    paymentId: string,
  ): Promise<GatewayPaymentRow | null> {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        txRef: true,
        amount: true,
        verification: true,
        chapaRef: true,
        receiptNumber: true,
      },
    });
  }

  /** The exactness rules: tx_ref, ETB, settled amount, and mode. */
  private verificationMismatches(
    payment: GatewayPaymentRow,
    data: ChapaVerifyResponse['data'],
    txRef: string,
  ): string[] {
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
    if (!this.modeMatches(data ?? undefined)) mismatches.push('mode');
    return mismatches;
  }

  private alreadyApproved(payment: GatewayPaymentRow): GatewayPaymentOutcome {
    return {
      kind: 'ALREADY_APPROVED',
      paymentId: payment.id,
      status: 'APPROVED',
      receiptNumber: payment.receiptNumber ?? null,
    };
  }

  /**
   * Record an admin-facing event at most once per (payment, type, txRef) in a
   * ten-minute window. The advisory lock makes the check-then-write atomic, so
   * two Chapa redeliveries racing each other cannot both insert a row.
   */
  private async recordDedupedTxRefEvent(
    tx: Prisma.TransactionClient,
    paymentId: string,
    type: string,
    txRef: string,
    opts: {
      actorId?: string | null;
      reason?: string | null;
      fromStatus?: string | null;
      toStatus?: string | null;
      meta?: Prisma.InputJsonValue;
    },
  ): Promise<boolean> {
    const lockKey = `${paymentId}:${type}:${txRef}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payment-txref-event'), hashtext(${lockKey}))`;
    const existing = await tx.paymentEvent.findFirst({
      where: {
        paymentId,
        type,
        createdAt: { gte: new Date(Date.now() - TX_REF_EVENT_DEDUPE_MS) },
        meta: { path: ['txRef'], equals: txRef },
      },
      select: { id: true },
    });
    if (existing) return false;
    await this.states.recordEvent(tx, paymentId, type, opts);
    return true;
  }

  /**
   * Inexact verified money: stamp the gateway reference we do have, merge a
   * review exception into `verification` (status-guarded so a concurrent
   * approval is never overwritten), and record the mismatch event.
   */
  private async recordVerificationMismatch(
    payment: GatewayPaymentRow,
    txRef: string,
    mismatches: string[],
    data: ChapaVerifyResponse['data'],
    source: GatewayPaymentSource,
  ): Promise<void> {
    const reference = data?.reference ?? null;
    const settled = toDecimal(data?.amount);
    const expected = toDecimal(payment.amount);
    const fromStatus = payment.status;
    const exception = {
      txRef,
      chapaRef: reference,
      expected: expected?.toString() ?? null,
      reported: settled?.toString() ?? null,
      currency: typeof data?.currency === 'string' ? data.currency : null,
      mode: typeof data?.mode === 'string' ? data.mode : null,
      fields: mismatches,
      source,
    };

    await this.prisma.$transaction(async (tx) => {
      const first = await this.recordDedupedTxRefEvent(
        tx,
        payment.id,
        PaymentEventType.CHAPA_VERIFY_MISMATCH,
        txRef,
        {
          fromStatus,
          toStatus: fromStatus,
          reason:
            'Chapa verified money that did not exactly match this payment; kept visible for manual review',
          meta: exception as Prisma.InputJsonValue,
        },
      );
      // Already recorded within the window: the event and this annotation
      // committed together, so a redelivery has nothing new to add.
      if (!first) return;

      // Status-guarded JSON merge: if another caller approved the row in the
      // race window, this matches 0 rows and the approval stands untouched.
      const existing = asJsonObject(payment.verification);
      await tx.payment.updateMany({
        where: { id: payment.id, status: fromStatus },
        data: {
          ...(payment.chapaRef || !reference ? {} : { chapaRef: reference }),
          verification: {
            ...existing,
            decision: 'REVIEW',
            exception: true,
            reviewNote:
              'Chapa verification mismatch (amount/currency/tx_ref/mode); manual review required.',
            mismatchFields: mismatches,
            chapaException: exception,
          } as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.warn(
      `Chapa verify mismatch for ${txRef} on ${fromStatus} (${source}): ${mismatches.join(',')} — manual review required`,
    );
  }

  /**
   * Verified exact money that could not be approved in this pass (a lost
   * claim, or a closed row that refused revival). The money is real, so it is
   * flagged for admin review and no retry is requested.
   */
  private async recordNotApprovableException(
    payment: GatewayPaymentRow,
    txRef: string,
    data: ChapaVerifyResponse['data'],
    source: GatewayPaymentSource,
  ): Promise<void> {
    const reference = data?.reference ?? null;
    const settled = toDecimal(data?.amount);
    const fromStatus = payment.status;
    const exception = {
      txRef,
      chapaRef: reference,
      amount: settled?.toString() ?? null,
      reason: 'payment not approved in this pass',
      source,
    };

    await this.prisma.$transaction(async (tx) => {
      const first = await this.recordDedupedTxRefEvent(
        tx,
        payment.id,
        PaymentEventType.CHAPA_VERIFY_NOT_APPROVED,
        txRef,
        {
          fromStatus,
          toStatus: fromStatus,
          reason: `Chapa verified an exact payment for ${txRef} but it could not be approved in this pass; manual review required`,
          meta: exception as Prisma.InputJsonValue,
        },
      );
      if (!first) return;

      const existing = asJsonObject(payment.verification);
      await tx.payment.updateMany({
        where: { id: payment.id, status: fromStatus },
        data: {
          ...(payment.chapaRef || !reference ? {} : { chapaRef: reference }),
          verification: {
            ...existing,
            decision: 'REVIEW',
            exception: true,
            reviewNote:
              'Chapa verified this payment but it could not be approved in this pass; it needs manual review.',
            chapaException: exception,
          } as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.error(
      `Chapa verified an exact payment for ${txRef} on ${fromStatus} (${source}) but it could not be approved; flagged for admin review`,
    );
  }

  /**
   * Verified money on a fully terminal row (REJECTED / REVERSED).
   *
   * Those statuses are not revivable, so the status is deliberately kept —
   * but the money is real, so the evidence is persisted before the webhook is
   * acknowledged: the gateway reference is stamped, the review exception is
   * flagged (the signal the admin Exceptions tab keys on) and the immutable
   * ledger gets CHAPA_LATE_PAYMENT_TERMINAL.
   */
  private async recordLatePaymentOnTerminalRow(
    row: GatewayPaymentRow,
    txRef: string,
    money: {
      reference: string | null;
      amount: string | null;
      source: GatewayPaymentSource;
    },
  ): Promise<void> {
    const from = row.status;
    const exception = {
      txRef,
      chapaRef: money.reference,
      amount: money.amount,
      currency: 'ETB',
      source: money.source,
    };

    await this.prisma.$transaction(async (tx) => {
      const first = await this.recordDedupedTxRefEvent(
        tx,
        row.id,
        PaymentEventType.CHAPA_LATE_PAYMENT_TERMINAL,
        txRef,
        {
          fromStatus: from,
          toStatus: from,
          reason: `Chapa verified an exact payment after the payment was ${from}; terminal status kept for refund review`,
          meta: exception as Prisma.InputJsonValue,
        },
      );
      if (!first) return;

      // Status-guarded merge: never annotate a row that another caller moved
      // (for example a concurrent approval) since we read it.
      const existing = asJsonObject(row.verification);
      await tx.payment.updateMany({
        where: { id: row.id, status: from },
        data: {
          ...(row.chapaRef || !money.reference
            ? {}
            : { chapaRef: money.reference }),
          verification: {
            ...existing,
            decision: 'REVIEW',
            exception: true,
            reviewNote: `Chapa verified an exact payment for this ${from} payment; refund review required (it cannot be approved).`,
            chapaException: exception,
          } as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.error(
      `Late Chapa payment on ${from} payment ${row.id} (tx ${txRef}) — manual refund review required`,
    );
  }
  /**
   * Verify the documented Chapa signature over the exact raw request body.
   *
   * Chapa documents two headers:
   *  - `chapa-signature`: HMAC-SHA256 of the webhook secret, keyed with itself;
   *  - `x-chapa-signature`: HMAC-SHA256 of the event payload, keyed with the
   *    webhook secret.
   * Either accepted header lets the request through, but only the body-bound
   * `x-chapa-signature` can authorize a lifecycle (refund/reversal/failed)
   * event: the static header is identical for every request, so it proves the
   * sender knows the secret but not that this body is the one Chapa sent.
   *
   * For the success path the server-side verify call is the real control — no
   * payment is ever approved from the signed body alone — so the static header
   * stays accepted there. The returned `bodyBound` flag tells the caller which
   * proof it has.
   */
  private verifySignature(
    rawBody: Buffer,
    signatures: ChapaWebhookSignatures,
  ): { bodyBound: boolean } {
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
    return { bodyBound: payloadValid };
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
