import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/**
 * Policy and pure helpers for passwordless sign-in.
 *
 * Everything that decides "how long", "how many" or "what shape" lives here so
 * the service and the specs read the same numbers, and so a reviewer can audit
 * the limits without reading request handling.
 */

/** Fixed lifetime of an emailed challenge. */
export const CHALLENGE_TTL_MS = 15 * 60 * 1000;

/** Lifetime of the profile-completion grant issued to a verified newcomer. */
export const ENROLLMENT_TTL_MS = 10 * 60 * 1000;

/** Submitted comparisons allowed against one challenge before it is burned. */
export const MAX_CHALLENGE_ATTEMPTS = 5;

/** Minimum gap between issuing two challenges for the same address. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** Rolling-window issuance caps per address. */
export const MAX_CHALLENGES_PER_HOUR = 5;
export const MAX_CHALLENGES_PER_DAY = 10;

// ── Cross-instance request budgets (see design section 7) ─────────
// These are enforced in Redis, atomically, on top of the durable database
// counters above. Values are part of the reviewed policy: change them here,
// not at a call site.

export const WINDOW_MINUTE_MS = 60 * 1000;
export const WINDOW_TEN_MINUTES_MS = 10 * 60 * 1000;
export const WINDOW_HOUR_MS = 60 * 60 * 1000;
export const WINDOW_DAY_MS = 24 * 60 * 60 * 1000;

/** Email start/resend: 10 requests/IP/minute and 50/hour. */
export const START_IP_PER_MINUTE = 10;
export const START_IP_PER_HOUR = 50;

/** Code verification: 30/IP and 10/browser per 10 minutes; 20/address/hour. */
export const CODE_IP_PER_TEN_MINUTES = 30;
export const CODE_BROWSER_PER_TEN_MINUTES = 10;
export const ADDRESS_CODE_PER_HOUR = 20;

/** Link confirmation: 30/IP and 10/browser per 10 minutes. */
export const CONFIRM_IP_PER_TEN_MINUTES = 30;
export const CONFIRM_BROWSER_PER_TEN_MINUTES = 10;

/** Profile completion: 30/IP per 10 minutes and 5 per grant/10 minutes. */
export const PROFILE_IP_PER_TEN_MINUTES = 30;
export const PROFILE_GRANT_PER_TEN_MINUTES = 5;

/** CSRF bootstrap and other public reads: 60/IP/minute. */
export const PUBLIC_READ_IP_PER_MINUTE = 60;

/**
 * How long a browser accounting id lives. Long enough that a returning user
 * keeps one bucket, short enough to bound the cookie. It carries no authority.
 */
export const BROWSER_ID_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** bcrypt cost for challenge code hashes (matches VerificationCode policy). */
export const CODE_HASH_ROUNDS = 10;

/**
 * Cookie names. Distinct per purpose so one cannot be presented as another.
 * The `__Host-` prefix is applied by `authCookieName()` in production.
 */
export { CHALLENGE_BASE, ENROLLMENT_BASE, CSRF_BASE } from '../../common/auth-cookie-names';

/** Local paths a sign-in may return to. Exact match only, never a prefix. */
export const POST_LOGIN_PATH_ALLOWLIST: readonly string[] = [
  '/dashboard',
  '/courses',
  '/support',
  '/support/tickets',
  '/profile',
  '/teacher',
];

export const DEFAULT_STUDENT_HOME = '/dashboard';
export const DEFAULT_TEACHER_HOME = '/teacher';

/** The single outward message for every failed proof. */
export const PROOF_FAILED_MESSAGE =
  "We couldn't complete sign-in. Request a new email and try again.";

/** The single outward message for initiation and resend. */
export const GENERIC_ISSUED_MESSAGE =
  "If this address can use email sign-in, you'll receive a link and a six-digit code. You can also create your student account this way.";

/** 202 body shape: identical for known, unknown, admin and suppressed mail. */
export interface ChallengeStartResult {
  message: string;
  challengeId: string;
  retryAfterSeconds: number;
}

// ── Random material ───────────────────────────────────────────────

/** 256 random bits, base64url — suitable for a database key or URL secret. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex digest. Used for high-entropy secrets only, never a 6-digit code. */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Hash a six-digit code bound to its challenge id under a dedicated pepper.
 *
 * The HMAC makes an offline enumeration of the 10^6 code space require the
 * pepper as well as the database; bcrypt then makes each candidate cost real
 * time. Neither layer alone is sufficient: sha256 of hex digits is trivially
 * enumerable, and bcrypt of `code` alone lets two challenges with the same code
 * share a hash.
 */
export function codeDigest(challengeId: string, code: string, pepper: string): string {
  return crypto
    .createHmac('sha256', pepper)
    .update(`${challengeId}:${code}`, 'utf8')
    .digest('hex');
}

export async function hashChallengeCode(
  challengeId: string,
  code: string,
  pepper: string,
): Promise<string> {
  return bcrypt.hash(codeDigest(challengeId, code, pepper), CODE_HASH_ROUNDS);
}

export async function verifyChallengeCode(
  challengeId: string,
  code: string,
  pepper: string,
  storedHash: string,
): Promise<boolean> {
  return bcrypt
    .compare(codeDigest(challengeId, code, pepper), storedHash)
    .catch(() => false);
}

/** A fixed bcrypt hash used to spend comparison time when nothing is stored. */
const TIMING_EQUALIZER_HASH = bcrypt.hashSync(
  'not-a-real-auth-code',
  CODE_HASH_ROUNDS,
);

/** Burn one bcrypt comparison worth of time on a path with nothing to compare. */
export async function equalizeAuthTiming(submitted: string): Promise<void> {
  await bcrypt.compare(submitted, TIMING_EQUALIZER_HASH).catch(() => false);
}

// ── Redirect allowlist ────────────────────────────────────────────

/**
 * Accept a return path only when it is exactly one of the reviewed local
 * paths. Rejects schemes, protocol-relative forms, encoded separators, query
 * strings, fragments and prefix lookalikes (`/dashboard-evil`).
 */
export function sanitizeReturnPath(
  value: unknown,
  fallback = DEFAULT_STUDENT_HOME,
): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (!candidate || candidate.length > 200) return fallback;
  // No control characters, backslashes, or percent-encoded separators.
  if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;
  if (/%2f|%5c/i.test(candidate)) return fallback;
  if (candidate.includes('?') || candidate.includes('#')) return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  return POST_LOGIN_PATH_ALLOWLIST.includes(candidate) ? candidate : fallback;
}

/** The home page for a role, after a successful sign-in. */
export function homeForRole(role: string): string {
  return role === 'TEACHER' ? DEFAULT_TEACHER_HOME : DEFAULT_STUDENT_HOME;
}

/** Destinations that only a teacher may be returned to. */
const TEACHER_ONLY_PATHS: readonly string[] = [DEFAULT_TEACHER_HOME];

/**
 * Role-aware return path (P1-9).
 *
 * A path can pass the allowlist and still be wrong for this user: `/teacher`
 * must never be the destination for a student, even though the page guard
 * would also refuse it. Anything the role cannot open falls back to that role's
 * home, so the destination guard is not the only defence.
 */
export function returnPathForRole(value: unknown, role: string): string {
  const fallback = homeForRole(role);
  const candidate = sanitizeReturnPath(value, fallback);
  if (role !== 'TEACHER' && TEACHER_ONLY_PATHS.includes(candidate)) {
    return fallback;
  }
  return candidate;
}

/**
 * Administrator sessions are password-only. This is the single predicate both
 * the issuing and the consuming path call, so there is one rule to audit.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

// ── Request shape guards ──────────────────────────────────────────

/** True when the submitted email has a plausible shape and bounded length. */
export function isPlausibleEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  // Deliberately loose: delivery, not this regex, is the real check. The point
  // is to reject whitespace, header-injection characters and obviously broken
  // values before they reach the mailer.
  return /^[^\s@<>",;:]+@[^\s@<>",;:]+\.[^\s@<>",;:]+$/.test(trimmed);
}

/** True when the value is exactly six digits, preserving leading zeroes. */
export function isWellFormedAuthCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}
