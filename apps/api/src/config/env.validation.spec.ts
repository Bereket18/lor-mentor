import { validateEnv } from './env.validation';

const secureProductionConfig = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
  DATABASE_URL: 'postgresql://user:pass@db:5432/lor_mentor',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'mailer',
  SMTP_PASS: 'mailer-secret',
  SMTP_FROM: 'no-reply@example.com',
  API_PUBLIC_URL: 'https://api.example.com',
  WEB_PUBLIC_URL: 'https://app.example.com',
  CORS_ORIGIN: 'https://app.example.com',
};

describe('validateEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(validateEnv({ ...secureProductionConfig })).toEqual(
      secureProductionConfig,
    );
  });

  it('requires core secrets and the database URL in every environment', () => {
    expect(() => validateEnv({ NODE_ENV: 'test' })).toThrow(
      /JWT_ACCESS_SECRET is required[\s\S]*JWT_REFRESH_SECRET is required[\s\S]*DATABASE_URL is required/,
    );
  });

  it('rejects weak, reused, and localhost production configuration', () => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        JWT_ACCESS_SECRET: 'aaaaaaaa',
        JWT_REFRESH_SECRET: 'aaaaaaaa',
        API_PUBLIC_URL: 'http://localhost:4000',
      }),
    ).toThrow(
      /at least 32 characters[\s\S]*low-entropy[\s\S]*must differ[\s\S]*must not point at localhost/,
    );
  });

  it('enforces all-or-nothing Chapa configuration in production', () => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        CHAPA_SECRET_KEY: 'chapa-secret',
      }),
    ).toThrow(/CHAPA_WEBHOOK_SECRET is required once Chapa is enabled/);
  });

  it('allows receipt verification without legacy env accounts because DB accounts are primary', () => {
    const config = {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access',
      JWT_REFRESH_SECRET: 'test-refresh',
      DATABASE_URL: 'postgresql://localhost/test',
      RECEIPT_VERIFIER_URL: 'http://localhost:8000',
      RECEIPT_VERIFIER_TOKEN: 'local-test-token',
    };

    expect(validateEnv({ ...config })).toEqual(config);
  });

  it('requires a shared token when receipt verification is enabled', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: 'test-access',
        JWT_REFRESH_SECRET: 'test-refresh',
        DATABASE_URL: 'postgresql://localhost/test',
        RECEIPT_VERIFIER_URL: 'http://localhost:8000',
        COMPANY_BANK_ACCOUNTS: '1000123456789',
      }),
    ).toThrow(
      /RECEIPT_VERIFIER_TOKEN is required when RECEIPT_VERIFIER_URL is set/,
    );
  });

  it('rejects malformed company account entries', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: 'test-access',
        JWT_REFRESH_SECRET: 'test-refresh',
        DATABASE_URL: 'postgresql://localhost/test',
        RECEIPT_VERIFIER_URL: 'http://localhost:8000',
        RECEIPT_VERIFIER_TOKEN: 'local-test-token',
        COMPANY_BANK_ACCOUNTS: 'CHANGE_ME,1234',
      }),
    ).toThrow(
      /Each COMPANY_BANK_ACCOUNTS entry must contain at least 8 digits/,
    );
  });

  it('rejects a weak verifier token in production', () => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        RECEIPT_VERIFIER_URL: 'http://verifier:8000',
        RECEIPT_VERIFIER_TOKEN: 'CHANGE_ME_shared_verifier_token',
        COMPANY_BANK_ACCOUNTS: '1000123456789',
      }),
    ).toThrow(
      /RECEIPT_VERIFIER_TOKEN must be a non-placeholder secret of at least 32 characters/,
    );
  });

  it('rejects placeholder database and SMTP values in production', () => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        DATABASE_URL:
          'postgresql://lor:CHANGE_ME_strong_db_password@db:5432/lor_mentor',
        SMTP_PASS: 'CHANGE_ME_smtp_api_key',
      }),
    ).toThrow(
      /DATABASE_URL must not use a placeholder[\s\S]*SMTP_PASS must not use a placeholder/,
    );
  });

  it('rejects a Resend-owned sender in production (F-8)', () => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        SMTP_FROM: 'Lor Mentor <onboarding@resend.dev>',
      }),
    ).toThrow(/SMTP_FROM must use a verified sending domain/);
  });

  it('rejects an invalid SMTP_FROM address in production', () => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        SMTP_FROM: 'not-an-email',
      }),
    ).toThrow(/SMTP_FROM must contain a valid email address/);
  });

  it('rejects an unknown Redis fail mode', () => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        REDIS_FAIL_MODE: 'sometimes',
      }),
    ).toThrow(/REDIS_FAIL_MODE must be either "closed" \(default\) or "open"/);
  });

  it('accepts an explicit closed Redis fail mode', () => {
    const config = {
      ...secureProductionConfig,
      REDIS_FAIL_MODE: 'closed',
    };

    expect(validateEnv({ ...config })).toEqual(config);
  });

  it('accepts complete local receipt-verifier configuration', () => {
    const config = {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access',
      JWT_REFRESH_SECRET: 'test-refresh',
      DATABASE_URL: 'postgresql://localhost/test',
      RECEIPT_VERIFIER_URL: 'http://127.0.0.1:8000',
      RECEIPT_VERIFIER_TOKEN: 'local-test-token',
      COMPANY_BANK_ACCOUNTS: '1000-1234-56789,0900 112 233',
    };

    expect(validateEnv({ ...config })).toEqual(config);
  });

  it.each([
    '*',
    'https://*.example.com',
    'https://app.example.com,*',
    'https://app.example.com, https://*.example.com',
  ])('rejects wildcard CORS origins (%s)', (corsOrigin) => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        CORS_ORIGIN: corsOrigin,
      }),
    ).toThrow(/CORS_ORIGIN must list exact origins; wildcards are not allowed/);
  });

  it('accepts an explicit comma-separated CORS allowlist', () => {
    const config = {
      ...secureProductionConfig,
      CORS_ORIGIN: 'https://app.example.com,https://admin.example.com',
    };

    expect(validateEnv({ ...config })).toEqual(config);
  });

  it('accepts an explicit trust-proxy hop count and shared cookie domain', () => {
    const config = {
      ...secureProductionConfig,
      TRUST_PROXY: '2',
      COOKIE_DOMAIN: '.example.com',
    };

    expect(validateEnv({ ...config })).toEqual(config);
  });

  it.each(['one', '-1', '1.5', 'true', '1,2'])(
    'rejects a non-integer TRUST_PROXY value (%s)',
    (trustProxy) => {
      expect(() =>
        validateEnv({
          ...secureProductionConfig,
          TRUST_PROXY: trustProxy,
        }),
      ).toThrow(
        /TRUST_PROXY must be a non-negative integer \(number of proxy hops\)/,
      );
    },
  );

  it.each([
    'https://example.com',
    'example.com/path',
    'example.com:3000',
    '*.example.com',
    'example..com',
    'example.com.',
    'not a domain',
  ])('rejects a malformed COOKIE_DOMAIN value (%s)', (cookieDomain) => {
    expect(() =>
      validateEnv({
        ...secureProductionConfig,
        COOKIE_DOMAIN: cookieDomain,
      }),
    ).toThrow(/COOKIE_DOMAIN must be a bare hostname/);
  });

  it('validates the optional receipt-verifier timeout range', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: 'test-access',
        JWT_REFRESH_SECRET: 'test-refresh',
        DATABASE_URL: 'postgresql://localhost/test',
        RECEIPT_VERIFIER_URL: 'http://127.0.0.1:8000',
        RECEIPT_VERIFIER_TOKEN: 'local-test-token',
        RECEIPT_VERIFIER_TIMEOUT_MS: '2000',
        COMPANY_BANK_ACCOUNTS: '1000123456789',
      }),
    ).toThrow(
      /RECEIPT_VERIFIER_TIMEOUT_MS must be an integer between 5000 and 120000/,
    );
  });
});
