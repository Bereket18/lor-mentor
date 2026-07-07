/**
 * Fail-fast environment validation. Runs once at boot via ConfigModule.
 *
 * The app previously fell back to an empty string when JWT secrets were
 * missing — which silently turns every access token into a forgeable,
 * unsigned-equivalent token. We now refuse to start instead.
 */
const PLACEHOLDERS = new Set([
  'change-me-to-a-long-random-string',
  'change-me-to-another-long-random-string',
  '',
]);

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const isProd = config.NODE_ENV === 'production';
  const errors: string[] = [];

  const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  for (const key of required) {
    const value = config[key];
    if (typeof value !== 'string' || value.length === 0) {
      errors.push(`${key} is required`);
    }
  }

  // In production, refuse weak/placeholder JWT secrets outright.
  if (isProd) {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = config[key];
      if (typeof value === 'string' && PLACEHOLDERS.has(value)) {
        errors.push(`${key} must be changed from its placeholder in production`);
      }
      // A forgeable admin token is catastrophic — demand real entropy.
      if (typeof value === 'string' && value.length < 32) {
        errors.push(`${key} must be at least 32 characters in production`);
      }
      // Reject low-entropy strings (all one character, obvious patterns).
      if (typeof value === 'string' && /^(.)\1+$/.test(value)) {
        errors.push(`${key} is too low-entropy (repeated character)`);
      }
    }
    if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
      errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
    }

    // Chapa online payments are OPTIONAL at launch (the bank-transfer + manual
    // review flow is the primary payment path). But a HALF-configured gateway
    // is dangerous — a missing webhook secret would skip signature verification
    // wiring — so enforce all-or-nothing: if any Chapa var is set, all must be.
    const chapaKeys = ['CHAPA_SECRET_KEY', 'CHAPA_WEBHOOK_SECRET'];
    const anyChapa = chapaKeys.some((key) => Boolean(config[key]));
    if (anyChapa) {
      for (const key of chapaKeys) {
        if (!config[key]) {
          errors.push(
            `${key} is required once Chapa is enabled (all Chapa keys must be set together)`,
          );
        }
      }
    }

    // Email delivery underpins password reset AND payment notifications.
    // Without it these silently throw at request time (users locked out,
    // payments stranded), so fail fast at boot instead.
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
      if (!config[key]) {
        errors.push(`${key} is required in production for email delivery`);
      }
    }

    // Public URLs must be real: Chapa's browser callback and webhook are
    // built from these, and CORS must name the real frontend origin or the
    // whole web app is blocked.
    for (const key of ['API_PUBLIC_URL', 'WEB_PUBLIC_URL', 'CORS_ORIGIN']) {
      const value = config[key];
      if (!value) {
        errors.push(`${key} is required in production`);
      } else if (
        typeof value === 'string' &&
        /localhost|127\.0\.0\.1/.test(value)
      ) {
        errors.push(`${key} must not point at localhost in production`);
      }
    }
  }

  // Bank-receipt auto-verification is optional, but enabling the verifier
  // without declaring which accounts are ours would let a valid transfer to
  // ANY account auto-approve — so require the account list when the URL is set.
  if (config.RECEIPT_VERIFIER_URL && !config.COMPANY_BANK_ACCOUNTS) {
    errors.push(
      'COMPANY_BANK_ACCOUNTS is required when RECEIPT_VERIFIER_URL is set ' +
        '(auto-approval matches the receipt receiver against these accounts)',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return config;
}
