/**
 * Strip live credentials out of a request body before it is handed to an
 * external service.
 *
 * `AllExceptionsFilter` attaches the request body to every unhandled-exception
 * report it sends to Sentry. On the auth routes that body is not incidental
 * data — it *is* the secret:
 *
 *   - `POST /auth/verify-email`   → `{ email, code }`
 *   - `POST /auth/register`       → `{ ..., password }`
 *   - `POST /auth/login`          → `{ email, password }`
 *   - `POST /auth/reset-password` → `{ token, newPassword }`
 *
 * So a database hiccup on any of those routes would ship a usable verification
 * code or password to a third-party error tracker, where it is retained and
 * visible to anyone with dashboard access. Error tracking is for diagnosing
 * failures, and no diagnosis needs the secret itself.
 *
 * Redaction rather than dropping the body entirely: the remaining fields (the
 * email, a department id, a request shape) are exactly what makes a 500
 * reproducible, and none of them are credentials.
 */

/** What replaces a redacted value. Never the original, never a partial mask. */
export const REDACTED = '[redacted]';

/**
 * Body field names that hold a credential, lowercased for comparison.
 *
 * Matched by exact (lowercased) name rather than by substring: a substring rule
 * would also swallow innocent fields such as `postalCode` or `countryCode`,
 * losing triage value for no gain. `code` covers the six-digit email
 * verification code and any other one-time code; the rest cover the passwords
 * and tokens this API accepts.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'code',
  'codehash',
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'passwordconfirmation',
  'token',
  'accesstoken',
  'refreshtoken',
  'passwordresettoken',
  'verifytoken',
  'secret',
  'clientsecret',
]);

/**
 * How deep to descend before giving up.
 *
 * Real bodies here are flat or one level deep. The cap exists so a deeply
 * nested or cyclic body cannot turn error reporting into a stack overflow —
 * which would replace a reportable 500 with an unreportable crash inside the
 * exception filter itself.
 */
const MAX_DEPTH = 4;

/**
 * Return a copy of `value` with every credential-shaped field replaced.
 *
 * Objects and arrays are copied rather than mutated: the same `req.body` object
 * is still referenced by the request and by anything else that reads it, so
 * redacting in place would silently corrupt the request that is still being
 * handled.
 */
export function redactSensitiveFields(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return '[truncated]';

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : redactSensitiveFields(item, depth + 1);
    }
    return result;
  }

  // Primitives (including null and undefined) pass through untouched.
  return value;
}
