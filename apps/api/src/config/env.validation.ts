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
      if (typeof value === 'string' && value.length < 32) {
        errors.push(`${key} should be at least 32 characters in production`);
      }
    }

    // Online payments need real Chapa credentials in production.
    for (const key of ['CHAPA_SECRET_KEY', 'CHAPA_WEBHOOK_SECRET']) {
      if (!config[key]) {
        errors.push(`${key} is required in production for online payments`);
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
