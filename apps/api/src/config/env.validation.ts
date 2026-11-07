import { resolveTrustProxy } from './trust-proxy';

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

function looksLikePlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  return (
    PLACEHOLDERS.has(trimmed) ||
    /^change[_-]?me/i.test(trimmed) ||
    /^your[_-]/i.test(trimmed)
  );
}

// A bare DNS hostname, optionally prefixed with the RFC 6265 dot form. This
// rejects schemes, ports, paths, wildcards, whitespace, and malformed labels
// before the value can reach res.cookie()/res.clearCookie().
const COOKIE_DOMAIN_PATTERN =
  /^\.?(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i;

function isValidCookieDomain(value: unknown): boolean {
  return typeof value === 'string' && COOKIE_DOMAIN_PATTERN.test(value);
}

/** Hostname of an absolute URL, or null when the value is missing/malformed. */
function hostnameOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Does `domain` cover `hostname` as a cookie domain?
 *
 * Compares on label boundaries, so `example.com` covers `api.example.com` but
 * NOT `notexample.com`. A bare `hostname.endsWith(domain)` check would accept
 * the latter and hand the parent-domain cookie to an unrelated site.
 */
function cookieDomainCovers(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const bare = domain.toLowerCase().replace(/^\./, '').replace(/\.$/, '');
  if (!bare) return false;
  return host === bare || host.endsWith(`.${bare}`);
}

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

  // Express must trust exactly the proxies we operate, otherwise req.ip is the
  // proxy's loopback address and per-IP throttling/audit logs are wrong.
  try {
    resolveTrustProxy(config.TRUST_PROXY, config.NODE_ENV);
  } catch (error) {
    errors.push(
      error instanceof Error
        ? error.message
        : 'TRUST_PROXY must be a non-negative integer (number of proxy hops)',
    );
  }

  // Optional shared cookie domain for api.<domain> + <domain> deployments.
  // Both res.cookie() and res.clearCookie() use the same options, so a bad
  // value here would make sessions impossible to set or clear reliably.
  if (
    config.COOKIE_DOMAIN !== undefined &&
    config.COOKIE_DOMAIN !== null &&
    config.COOKIE_DOMAIN !== ''
  ) {
    if (!isValidCookieDomain(config.COOKIE_DOMAIN)) {
      errors.push(
        'COOKIE_DOMAIN must be a bare hostname such as example.com or .example.com (no scheme, port, path, or wildcard)',
      );
    }
  }

  // CORS is credentialed (cookies), so a wildcard is never safe: browsers
  // reject `Access-Control-Allow-Origin: *` with credentials, and reflecting
  // arbitrary origins would let any site drive authenticated requests.
  // Require an explicit comma-separated allowlist in every environment.
  if (typeof config.CORS_ORIGIN === 'string') {
    const corsOrigins = config.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (corsOrigins.some((origin) => origin.includes('*'))) {
      errors.push(
        'CORS_ORIGIN must list exact origins; wildcards are not allowed',
      );
    }
  }

  // How long an unpaid Chapa checkout stays resumable before lazy resolution
  // may close it. Must match the checkout/retry timeout configured in the
  // Chapa dashboard; the default (60) is documented there.
  if (
    config.CHAPA_RETRY_WINDOW_MINUTES !== undefined &&
    config.CHAPA_RETRY_WINDOW_MINUTES !== ''
  ) {
    const minutes = Number(config.CHAPA_RETRY_WINDOW_MINUTES);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      errors.push(
        'CHAPA_RETRY_WINDOW_MINUTES must be an integer between 1 and 1440',
      );
    }
  }

  // In production, refuse weak/placeholder JWT secrets outright.
  if (isProd) {
    if (
      typeof config.DATABASE_URL === 'string' &&
      /change[_-]?me/i.test(config.DATABASE_URL)
    ) {
      errors.push('DATABASE_URL must not use a placeholder in production');
    }

    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = config[key];
      if (typeof value === 'string' && looksLikePlaceholder(value)) {
        errors.push(
          `${key} must be changed from its placeholder in production`,
        );
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
      // Chapa test keys carry "TEST" in the value (CHASECK_TEST-...). A test
      // key in production cannot take live charges and would make every
      // verified transaction fail the mode check, so refuse to boot.
      const chapaSecret = config.CHAPA_SECRET_KEY;
      if (typeof chapaSecret === 'string' && /test/i.test(chapaSecret)) {
        errors.push(
          'CHAPA_SECRET_KEY looks like a Chapa test key; production requires a live key (test keys contain "TEST", e.g. CHASECK_TEST-...)',
        );
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

    if (looksLikePlaceholder(config.SMTP_PASS)) {
      errors.push('SMTP_PASS must not use a placeholder in production');
    }

    const smtpFrom = config.SMTP_FROM;
    if (typeof smtpFrom === 'string' && smtpFrom.trim()) {
      const fromAddress =
        smtpFrom.match(/<([^>]+)>/)?.[1]?.trim() ?? smtpFrom.trim();
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromAddress)) {
        errors.push('SMTP_FROM must contain a valid email address');
      }
      if (/@resend\.dev$/i.test(fromAddress)) {
        errors.push(
          'SMTP_FROM must use a verified sending domain, not resend.dev (F-8)',
        );
      }
    }

    const redisFailMode = config.REDIS_FAIL_MODE;
    if (redisFailMode !== undefined && redisFailMode !== '') {
      const mode =
        typeof redisFailMode === 'string'
          ? redisFailMode.toLowerCase()
          : undefined;
      if (mode !== 'closed' && mode !== 'open') {
        errors.push(
          'REDIS_FAIL_MODE must be either "closed" (default) or "open"',
        );
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

    // Split-host topology (web on <domain>, API on api.<domain>) only works
    // when the auth cookies are issued for a parent domain BOTH hosts share.
    // Without it the browser never sends the cookie to the web host, so the
    // edge guard (apps/web/src/proxy.ts) and /api/proxy see no session and
    // every protected page bounces to /login — a login loop that looks like a
    // broken password. Fail at boot with an actionable message instead.
    const webHost = hostnameOf(config.WEB_PUBLIC_URL);
    const apiHost = hostnameOf(config.API_PUBLIC_URL);
    const cookieDomainValue =
      typeof config.COOKIE_DOMAIN === 'string'
        ? config.COOKIE_DOMAIN.trim()
        : '';
    const cookieDomain = cookieDomainValue.replace(/^\./, '');
    const isSplitHost = Boolean(webHost && apiHost && webHost !== apiHost);

    if (isSplitHost && !cookieDomain) {
      errors.push(
        'COOKIE_DOMAIN is required in production when the web and API hosts differ ' +
          `(WEB_PUBLIC_URL=${webHost}, API_PUBLIC_URL=${apiHost}); without a shared ` +
          'parent domain the auth cookies are never sent to the web host and every ' +
          'protected page redirects to /login',
      );
    }

    if (cookieDomain) {
      // A single label ("com", "localhost") is either a public suffix or not
      // shared between two hosts — browsers reject such cookies outright.
      if (!cookieDomain.includes('.')) {
        errors.push(
          'COOKIE_DOMAIN must be a registrable domain of at least two labels in production (not a single label such as "com" or "localhost")',
        );
      }
      const hosts: Array<[string, string | null]> = [
        ['WEB_PUBLIC_URL', webHost],
        ['API_PUBLIC_URL', apiHost],
      ];
      for (const [key, host] of hosts) {
        if (host && !cookieDomainCovers(host, cookieDomain)) {
          errors.push(
            `COOKIE_DOMAIN (${cookieDomainValue}) must be a parent domain of ${key} (${host})`,
          );
        }
      }
    }
  }

  // Bank-receipt auto-verification is optional. Once enabled, require both
  // service authentication and plausible real receiving-account numbers.
  // This prevents an unsecured scraper endpoint or a placeholder account list
  // from silently reaching production.
  if (config.RECEIPT_VERIFIER_URL) {
    const token =
      typeof config.RECEIPT_VERIFIER_TOKEN === 'string'
        ? config.RECEIPT_VERIFIER_TOKEN.trim()
        : '';
    if (!token) {
      errors.push(
        'RECEIPT_VERIFIER_TOKEN is required when RECEIPT_VERIFIER_URL is set',
      );
    } else if (isProd && (token.length < 32 || /^change[_-]?me/i.test(token))) {
      errors.push(
        'RECEIPT_VERIFIER_TOKEN must be a non-placeholder secret of at least 32 characters in production',
      );
    }

    // Legacy `COMPANY_BANK_ACCOUNTS` is matching-only. The public transfer
    // panel reads active receiving accounts from the database (managed in
    // /admin/banks), so this env list is optional. Validate entries only when
    // an operator has supplied them; never require env values as the primary
    // source of receiving accounts.
    const accountValue =
      typeof config.COMPANY_BANK_ACCOUNTS === 'string'
        ? config.COMPANY_BANK_ACCOUNTS
        : '';
    const accounts = accountValue
      .split(',')
      .map((account) => account.trim())
      .filter(Boolean);
    if (
      accounts.length > 0 &&
      accounts.some((account) => account.replace(/\D/g, '').length < 8)
    ) {
      errors.push(
        'Each COMPANY_BANK_ACCOUNTS entry must contain at least 8 digits',
      );
    }

    const timeoutValue = config.RECEIPT_VERIFIER_TIMEOUT_MS;
    if (timeoutValue !== undefined && timeoutValue !== '') {
      const timeoutMs = Number(timeoutValue);
      if (
        !Number.isInteger(timeoutMs) ||
        timeoutMs < 5_000 ||
        timeoutMs > 120_000
      ) {
        errors.push(
          'RECEIPT_VERIFIER_TIMEOUT_MS must be an integer between 5000 and 120000',
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return config;
}
