import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/**
 * Short-code policy for email verification.
 *
 * A 6-digit code has only 10^6 possible values, so the code itself is the
 * weakest part of the scheme. Everything here exists to stop that weakness from
 * mattering: a short lifetime, a small attempt budget, single-use consumption,
 * and limits on how many codes an account can be issued.
 *
 * These are deliberately in one place so the policy is auditable without
 * reading the service, and so the specs assert against the same numbers the
 * service enforces rather than against copies of them.
 */

/** How long an emailed code stays valid. */
export const CODE_TTL_MS = 15 * 60 * 1000;

/** The same lifetime, for the email copy ("expires in 15 minutes"). */
export const CODE_TTL_MINUTES = CODE_TTL_MS / 60_000;

/** Wrong guesses allowed against a single issued code before it is burned. */
export const MAX_VERIFY_ATTEMPTS = 5;

/** Minimum gap between issuing two codes for the same account. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Ceiling on codes issued per account per rolling hour.
 *
 * This is separate from the cooldown on purpose. The cooldown stops a user
 * hammering "resend"; this stops sustained abuse of the mail path (a slow
 * flood that respects the cooldown but never stops) and bounds how often an
 * attacker can invalidate someone else's in-flight code. The per-IP throttler
 * cannot do either job because it is in-memory and per-instance.
 */
export const MAX_CODES_PER_HOUR = 5;

/** bcrypt cost for code hashes. See the note on `hashVerificationCode`. */
export const CODE_HASH_ROUNDS = 10;

/**
 * Generate a verification code: exactly six digits, as a string.
 *
 * `crypto.randomInt` is used rather than `Math.random` because this value is a
 * security token; `Math.random` is seeded predictably and its output can be
 * reconstructed from a few samples.
 *
 * The result is a string, never a number. `randomInt(0, 1_000_000)` can return
 * 42, and `String(42)` is "42" — two digits, which would fail validation and
 * shrink the keyspace. `padStart` restores the leading zeroes so "000042" is a
 * real, accepted code and every one of the 10^6 values is equally likely.
 *
 * The upper bound is exclusive, so the range is exactly 0..999999 — no modulo
 * bias, which `randomInt` guarantees by rejection sampling.
 */
export function generateVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Hash a code for storage.
 *
 * bcrypt rather than a plain digest: over a 10^6 keyspace a fast hash is
 * effectively a plaintext store, because an attacker who reads the database
 * can enumerate every possible code in well under a second. bcrypt makes that
 * enumeration cost real time per candidate, and the stored salt stops one
 * precomputed table being reused across users.
 *
 * Cost 10 (~60 ms) rather than the 12 used for passwords: this hash is verified
 * on a public endpoint, so its cost is also an attacker's lever for burning
 * server CPU. Cost 10 still puts a full enumeration of one user's code at
 * roughly 16 core-hours. Raising it buys offline margin at a linear cost in
 * CPU per verification attempt.
 *
 * The caller is responsible for never persisting or logging the plaintext.
 */
export function hashVerificationCode(code: string): Promise<string> {
  return bcrypt.hash(code, CODE_HASH_ROUNDS);
}

/**
 * A real bcrypt hash of a value that is not a valid code, used to spend the
 * same CPU time as a genuine comparison on paths where there is nothing to
 * compare against.
 *
 * Without this, `POST /auth/verify-email` answers an unknown address almost
 * instantly but takes ~60 ms for a known unverified account, which is a
 * measurable oracle for "does this account exist and is it unverified".
 *
 * Computed once at module load rather than hardcoded, so it cannot drift out of
 * sync with `CODE_HASH_ROUNDS` and silently stop costing the right amount of
 * time. It is a hash of a fixed string, so it is not a secret.
 */
const TIMING_EQUALIZER_HASH = bcrypt.hashSync(
  'not-a-real-verification-code',
  CODE_HASH_ROUNDS,
);

/**
 * Burn roughly one `bcrypt.compare` worth of time, discarding the result.
 *
 * Await this on every rejection path that did not itself perform a comparison,
 * so the response time does not reveal whether the account exists.
 */
export async function equalizeVerificationTiming(
  submittedCode: string,
): Promise<void> {
  await bcrypt.compare(submittedCode, TIMING_EQUALIZER_HASH).catch(() => false);
}

/**
 * Compare a submitted code against a stored hash, in constant time.
 *
 * Returns false rather than throwing when there is no hash to compare against:
 * `bcrypt.compare(value, null)` rejects, and an unguarded call would turn "this
 * account has no pending code" into a 500 instead of the ordinary rejection.
 */
export async function verifyCodeHash(
  submittedCode: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) {
    await equalizeVerificationTiming(submittedCode);
    return false;
  }
  return bcrypt.compare(submittedCode, storedHash).catch(() => false);
}

/** True when the submission is exactly six digits. */
export function isWellFormedCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}
