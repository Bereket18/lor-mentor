/**
 * Chapa's permanent receipt URL for a verified transaction.
 *
 * Chapa's own receipt screen lives inside the hosted checkout and is replaced
 * as soon as Chapa redirects the browser back to our `return_url`. The student
 * can reopen the same receipt at this URL, using Chapa's `reference` (stored as
 * `Payment.chapaRef`), not our `tx_ref`.
 */
const CHAPA_RECEIPT_BASE_URL = "https://chapa.link/payment-receipt";

export function chapaReceiptUrl(
  reference: string | null | undefined,
): string | null {
  const trimmed = reference?.trim();
  if (!trimmed) return null;
  return `${CHAPA_RECEIPT_BASE_URL}/${encodeURIComponent(trimmed)}`;
}
