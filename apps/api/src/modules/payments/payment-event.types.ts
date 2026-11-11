/**
 * PaymentEvent `type` vocabulary. The ledger is append-only, so existing
 * values are never renamed — new event kinds are added here additively.
 */
export const PaymentEventType = {
  PAYMENT_APPROVED: 'PAYMENT_APPROVED',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED',
  PAYMENT_REVERSED: 'PAYMENT_REVERSED',
  /** Abandoned Chapa checkout lazily expired at the next initialize attempt. */
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  /** Student cancelled their own PENDING online checkout. */
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  /**
   * A verified Chapa payment arrived after our row had already been closed as
   * EXPIRED or CANCELLED. The transition is EXPIRED/CANCELLED -> APPROVED and
   * the event `reason` names the previous status.
   */
  PAYMENT_APPROVED_AFTER_EXPIRY: 'PAYMENT_APPROVED_AFTER_EXPIRY',
  /**
   * Chapa verified an exact payment for a REVERSED or REJECTED row. Those are
   * fully terminal, so the status is kept and this event records the late
   * money for manual (refund) review.
   */
  CHAPA_LATE_PAYMENT_TERMINAL: 'CHAPA_LATE_PAYMENT_TERMINAL',
  CHAPA_INIT_FAILED: 'CHAPA_INIT_FAILED',
  CHAPA_PAYMENT_FAILED: 'CHAPA_PAYMENT_FAILED',
  /**
   * A verify call reported the attempt as failed/cancelled. This is NOT
   * terminal: the payment stays PENDING and may still succeed inside the retry
   * window. It ends by expiry after a confirmed Chapa cancel.
   */
  CHAPA_ATTEMPT_FAILED: 'CHAPA_ATTEMPT_FAILED',
  CHAPA_VERIFY_UNREACHABLE: 'CHAPA_VERIFY_UNREACHABLE',
  CHAPA_VERIFY_MISMATCH: 'CHAPA_VERIFY_MISMATCH',
  /** Chapa refused/was unreachable when we tried to cancel a stale checkout. */
  CHAPA_CANCEL_FAILED: 'CHAPA_CANCEL_FAILED',
  /**
   * Chapa reported a refund (refunding/refunded). The payment status is kept;
   * an APPROVED payment is flagged in the admin queue for refund review.
   */
  CHAPA_REFUND_RECEIVED: 'CHAPA_REFUND_RECEIVED',
  /**
   * Chapa reported a reversal. The payment status is kept (never auto-reversed
   * or auto-cancelled) and an APPROVED payment is flagged for admin review.
   */
  CHAPA_REVERSAL_RECEIVED: 'CHAPA_REVERSAL_RECEIVED',
  /**
   * Chapa reported a failed/cancelled transaction. Recorded for the ledger
   * only: no payment/subscription state changes.
   */
  CHAPA_FAILED_OR_CANCELLED: 'CHAPA_FAILED_OR_CANCELLED',
  /**
   * A refund/reversal/failed event arrived with only the static
   * `chapa-signature` header and no body-bound `x-chapa-signature`. The
   * signature proves the sender knows the secret but is not bound to this
   * body, so the event is recorded as evidence only: no exception flag, no
   * state change. The admin Exceptions tab counts these rows so unverified
   * gateway traffic is visible.
   */
  CHAPA_LIFECYCLE_UNVERIFIED: 'CHAPA_LIFECYCLE_UNVERIFIED',
  /**
   * Chapa verified an exact payment but the row could not be approved in the
   * same pass (the claim was lost to a concurrent close). The money is real,
   * so the row is flagged for admin review and the browser is told the
   * confirmation is still pending instead of being shown a success or a stale
   * status.
   */
  CHAPA_VERIFY_NOT_APPROVED: 'CHAPA_VERIFY_NOT_APPROVED',
  /**
   * The PDF receipt could not be written after the payment was approved (disk,
   * permissions, a render error). The approval is unaffected: the receipt is
   * regenerated on the first download, so this is never permanent.
   */
  RECEIPT_GENERATION_FAILED: 'RECEIPT_GENERATION_FAILED',
  /**
   * A receipt PDF was (re)built after the approval — on the first download
   * because the file was missing, or when an admin asked for a regeneration.
   */
  RECEIPT_REGENERATED: 'RECEIPT_REGENERATED',
} as const;

export type PaymentEventTypeValue =
  (typeof PaymentEventType)[keyof typeof PaymentEventType];
