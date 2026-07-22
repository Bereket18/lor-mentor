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

  it('requires company account matching when receipt verification is enabled', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: 'test-access',
        JWT_REFRESH_SECRET: 'test-refresh',
        DATABASE_URL: 'postgresql://localhost/test',
        RECEIPT_VERIFIER_URL: 'http://localhost:8000',
      }),
    ).toThrow(
      /COMPANY_BANK_ACCOUNTS is required when RECEIPT_VERIFIER_URL is set/,
    );
  });
});
