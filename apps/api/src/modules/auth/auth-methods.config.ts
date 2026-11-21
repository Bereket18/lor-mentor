import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Strict boolean reader: only the literal strings "true"/"false" are accepted. */
function readFlag(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

/**
 * Server-side switches for the passwordless methods.
 *
 * These are read from the environment at construction, never from the client.
 * A disabled method fails closed with a uniform 503 (a 404 would itself reveal
 * which methods an environment runs). Google has no verifier yet, so enabling
 * it is a boot error rather than a quietly unavailable endpoint.
 */
@Injectable()
export class AuthMethodsConfig {
  readonly googleEnabled: boolean;
  readonly emailLinkEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.googleEnabled = readFlag(config.get<string>('AUTH_GOOGLE_ENABLED'));
    if (this.googleEnabled) {
      throw new Error(
        'AUTH_GOOGLE_ENABLED=true is not supported yet; Google sign-in has no OIDC verifier',
      );
    }
    this.emailLinkEnabled = readFlag(
      config.get<string>('AUTH_EMAIL_LINK_ENABLED'),
    );
  }

  /**
   * The pepper used when hashing six-digit codes. Required only once email
   * sign-in is switched on; a missing value fails the request closed rather
   * than falling back to an unpeppered hash.
   */
  codePepper(): string | null {
    const value = this.config.get<string>('AUTH_CODE_PEPPER')?.trim();
    return value && value.length >= 32 ? value : null;
  }

  /**
   * Keyed secret for rate-limit identifiers. Raw email addresses must never be
   * used as a bucket key, so callers hash through this.
   */
  rateKeySecret(): string | null {
    const value = this.config.get<string>('AUTH_RATE_KEY_SECRET')?.trim();
    return value && value.length >= 32 ? value : null;
  }
}
