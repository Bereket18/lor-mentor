/** The length of an emailed verification code. Six digits, matching the API. */
export const VERIFICATION_CODE_LENGTH = 6;

/** Seconds the "Send a new code" button stays disabled after a send. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Wrong guesses the API allows against one code before it is burned.
 *
 * Mirrors `MAX_VERIFY_ATTEMPTS` in the API's verification policy. The server
 * remains the authority — this copy is only used to tell the user *why* the
 * correct code they are holding has stopped working, which the API's single
 * generic failure message cannot say without leaking whether an account exists.
 * If the two ever disagree the server still enforces its own number; only the
 * wording would be off.
 */
export const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Reduce whatever the user typed, pasted or autofilled into a code.
 *
 * Everything that is not a digit is dropped and the result is cut to six
 * characters. That is what makes pasting work: a code copied out of an inbox
 * very often arrives as " 428193 ", "428 193" or with a trailing newline, and
 * any of those would otherwise fail validation for a reason the user cannot
 * see. The input is `type="text"` with `inputMode="numeric"` rather than
 * `type="number"`, so the browser cannot drop a leading zero or expose spinner
 * controls, and the value stays a string throughout — "000042" is a real code.
 *
 * Truncating rather than rejecting a longer string is deliberate: a paste of a
 * longer token yields its first six digits, which then simply fails to match.
 * Rejecting it here would give the same outcome with an error the user cannot
 * act on.
 */
export function sanitizeVerificationCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, VERIFICATION_CODE_LENGTH);
}

/** True when the value is a complete code the API would accept. */
export function isCompleteVerificationCode(value: string): boolean {
  return new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`).test(value);
}

/**
 * Seconds remaining on the resend cooldown, given when the last code was sent.
 *
 * Returns 0 when the cooldown has elapsed. `undefined` means nothing has been
 * sent in this session, so there is nothing to wait for.
 *
 * The result is capped at the full cooldown so a clock that moves backwards
 * (NTP correcting, a timezone change, a user changing their system clock) can
 * only ever restore the normal wait, not extend it.
 */
export function resendCooldownRemaining(
  sentAt: number | undefined,
  now: number,
): number {
  if (sentAt === undefined) return 0;

  const elapsed = Math.floor((now - sentAt) / 1000);
  const remaining = RESEND_COOLDOWN_SECONDS - elapsed;

  if (remaining <= 0) return 0;
  return Math.min(remaining, RESEND_COOLDOWN_SECONDS);
}
