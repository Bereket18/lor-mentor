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

  it('reads the Google flag as a strict boolean', () => {
    expect(
      new AuthMethodsConfig(configWith({ AUTH_GOOGLE_ENABLED: 'true' }))
        .googleEnabled,
    ).toBe(true);
    expect(
      new AuthMethodsConfig(configWith({ AUTH_GOOGLE_ENABLED: '1' }))
        .googleEnabled,
    ).toBe(false);
  });
});
