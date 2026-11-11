/**
 * Definitive end state for a Chapa payment whose money is confirmed but whose
 * approval has not landed yet.
 *
 * Once the browser has finished polling, this is the only thing the student is
 * shown. The wording is deliberately fixed: it must never read as a failure
 * (the money was taken), it must say what happens next, and it must always name
 * the payment reference support will ask for.
 */
export const CONFIRMATION_END_STATE_MINUTES = 30;

export function confirmationEndStateMessage(reference: string): string {
  return (
    "We are still confirming your payment. You will receive a notification " +
    "when your subscription is active. If nothing changes in " +
    `${CONFIRMATION_END_STATE_MINUTES} minutes, contact support and quote ` +
    `reference ${reference}.`
  );
}

/**
 * The one sentence shown when the gateway confirmed money but the payment
 * cannot be approved automatically (a terminal row, an amount/currency/tx_ref
 * mismatch, or a lost claim). The wording is fixed by the owner:
 *
 *   We have received your payment. It is under review and any refund will be
 *   handled by the college. Reference <payment reference>.
 *
 * It must never read as a failure — the money was taken — and it must always
 * name the reference support will ask for. The API renders the identical
 * sentence server-side (`chapaUnderReviewMessage`) so the two cannot drift.
 */
export function paymentUnderReviewMessage(reference: string): string {
  return (
    "We have received your payment. It is under review and any refund " +
    `will be handled by the college. Reference ${reference}.`
  );
}
