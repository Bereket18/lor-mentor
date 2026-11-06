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
  CHAPA_VERIFY_UNREACHABLE: 'CHAPA_VERIFY_UNREACHABLE',
  CHAPA_VERIFY_MISMATCH: 'CHAPA_VERIFY_MISMATCH',
} as const;

export type PaymentEventTypeValue =
  (typeof PaymentEventType)[keyof typeof PaymentEventType];
