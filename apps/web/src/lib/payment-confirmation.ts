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
