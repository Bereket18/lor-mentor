import { ConfigService } from '@nestjs/config';
import { AuthMethodsConfig } from './auth-methods.config';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('AuthMethodsConfig', () => {
  it('defaults both methods off', () => {
    const methods = new AuthMethodsConfig(configWith({}));

    expect(methods.googleEnabled).toBe(false);
    expect(methods.emailLinkEnabled).toBe(false);
  });

  it('reads the email flag as a strict boolean', () => {
    expect(
      new AuthMethodsConfig(configWith({ AUTH_EMAIL_LINK_ENABLED: ' true ' }))
        .emailLinkEnabled,
    ).toBe(true);
    expect(
      new AuthMethodsConfig(configWith({ AUTH_EMAIL_LINK_ENABLED: 'yes' }))
        .emailLinkEnabled,
    ).toBe(false);
  });

  it('refuses to construct with Google enabled', () => {
    // env.validation rejects the same value at boot; this keeps a module test or
    // an alternate bootstrap from advertising a method with no verifier.
    expect(
      () => new AuthMethodsConfig(configWith({ AUTH_GOOGLE_ENABLED: 'true' })),
    ).toThrow(/AUTH_GOOGLE_ENABLED=true is not supported yet/);
  });
});
