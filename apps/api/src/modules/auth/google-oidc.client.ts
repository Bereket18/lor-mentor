import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeChallengeMethod,
  OAuth2Client,
  type TokenPayload,
} from 'google-auth-library';
import { normalizeEmail } from '../../common/normalize-email';

/**
 * Google OIDC authorization-code client (Phase 3).
 *
 * Signature, issuer, audience and expiry are verified by `google-auth-library`
 * — the maintained verifier the design requires. Nothing here re-implements JWT
 * verification. This module adds only:
 *
 *   - the exact, fixed authorization request (the library's option type does
 *     not model `nonce`, so the request is built explicitly);
 *   - the checks the library does not make: `nonce`, a verified email, a
 *     non-empty subject, and a bounded issued-at skew;
 *   - fail-closed configuration and a token-free error surface.
 *
 * No access, refresh or ID token is returned to a caller or retained: the code
 * exchange yields the ID token only long enough to verify it.
 */

/** The single fixed authorization endpoint. The token and JWKS endpoints are
 * the library's own fixed Google defaults. */
export const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * OIDC scopes: `openid` is required for an ID token; `email` for the address;
 * `profile` for a display name. No `offline` access, so no refresh token is
 * ever requested or kept.
 */
export const GOOGLE_OIDC_SCOPES = ['openid', 'email', 'profile'];

/** A token whose `iat` is further in the future than this is rejected. */
export const GOOGLE_MAX_IAT_SKEW_MS = 5 * 60 * 1000;

export interface GoogleAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface GoogleVerifiedIdentity {
  /** Immutable Google subject. This is the only identity key. */
  subject: string;
  /** Normalised, verified address. Never used to resolve an account. */
  email: string;
}

/**
 * Raised when a Google result cannot be trusted. It never carries the token,
 * the code or any claim value, so it is safe to let propagate.
 */
export class GoogleIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleIdentityError';
  }
}

/**
 * The claim checks `google-auth-library` does not perform. It must run only
 * after the library has verified the signature, issuer, audience and expiry.
 *
 * A pure function so the rules are unit-testable without a network or a token.
 */
export function assertGoogleIdentity(
  payload: TokenPayload | undefined,
  expectedNonce: string,
  now: Date = new Date(),
): GoogleVerifiedIdentity {
  if (!payload) {
    throw new GoogleIdentityError('id token has no payload');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new GoogleIdentityError('id token has no subject');
  }
  if (payload.nonce !== expectedNonce) {
    // Missing, empty or mismatched: a replay or a token for another session.
    throw new GoogleIdentityError('id token nonce mismatch');
  }
  if (payload.email_verified !== true) {
    throw new GoogleIdentityError('id token email is not verified');
  }
  const rawEmail =
    typeof payload.email === 'string' ? payload.email.trim() : '';
  if (rawEmail.length === 0) {
    throw new GoogleIdentityError('id token has no email');
  }
  if (
    typeof payload.iat === 'number' &&
    payload.iat * 1000 - now.getTime() > GOOGLE_MAX_IAT_SKEW_MS
  ) {
    throw new GoogleIdentityError('id token issued-at is in the future');
  }
  return { subject: payload.sub, email: normalizeEmail(rawEmail) };
}

/**
 * Build the fixed authorization URL. Hand-built because
 * `GenerateAuthUrlOpts` cannot express `nonce`; the parameters are the ones
 * Google documents for the authorization-code flow.
 */
export function buildGoogleAuthorizationUrl(
  request: GoogleAuthorizationRequest,
): string {
  const params = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: 'code',
    scope: GOOGLE_OIDC_SCOPES.join(' '),
    state: request.state,
    nonce: request.nonce,
    code_challenge: request.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    access_type: 'online',
  });
  return `${GOOGLE_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

@Injectable()
export class GoogleOidcClient {
  private readonly logger = new Logger(GoogleOidcClient.name);

  constructor(private readonly config: ConfigService) {}

  /** Configured client id, or a fail-closed 503 when it is missing. */
  private clientId(): string {
    const value = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        'Google sign-in is not available right now',
      );
    }
    return value;
  }

  /** Configured client secret, or a fail-closed 503 when it is missing. */
  private clientSecret(): string {
    const value = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        'Google sign-in is not available right now',
      );
    }
    return value;
  }

  /**
   * The exact redirect URI. It is fixed — an explicit `GOOGLE_REDIRECT_URI`
   * wins, otherwise it is derived from `WEB_PUBLIC_URL` — and must be
   * registered verbatim on the Google client.
   */
  redirectUri(): string {
    const explicit = this.config.get<string>('GOOGLE_REDIRECT_URI')?.trim();
    if (explicit) return explicit;
    const web =
      this.config.get<string>('WEB_PUBLIC_URL')?.trim() ??
      'http://localhost:3000';
    return `${web.replace(/\/$/, '')}/auth/google/callback`;
  }

  /** The authorization URL to redirect the browser to. */
  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string {
    return buildGoogleAuthorizationUrl({
      clientId: this.clientId(),
      redirectUri: this.redirectUri(),
      state: input.state,
      nonce: input.nonce,
      codeChallenge: input.codeChallenge,
    });
  }

  private newClient(): OAuth2Client {
    return new OAuth2Client({
      clientId: this.clientId(),
      clientSecret: this.clientSecret(),
      redirectUri: this.redirectUri(),
    });
  }

  /**
   * Exchange an authorization code with PKCE. Only the ID token is returned;
   * the access and refresh tokens are discarded and never stored or logged.
   */
  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
  }): Promise<string> {
    // Resolve configuration before the try so a missing secret stays a 503
    // rather than being folded into a generic verification failure.
    const client = this.newClient();
    let idToken: string | undefined;
    try {
      const { tokens } = await client.getToken({
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirect_uri: this.redirectUri(),
      });
      idToken = tokens.id_token ?? undefined;
    } catch {
      // Static message only: a library error must not leak token material.
      this.logger.warn('google_code_exchange_failed');
      throw new GoogleIdentityError('code exchange failed');
    }
    if (!idToken) {
      this.logger.warn('google_code_exchange_missing_id_token');
      throw new GoogleIdentityError('code exchange returned no id token');
    }
    return idToken;
  }

  /**
   * Verify an ID token with the maintained library, then apply the extra claim
   * checks. Returns the verified identity as claims, never the token.
   */
  async verifyIdToken(input: {
    idToken: string;
    expectedNonce: string;
  }): Promise<GoogleVerifiedIdentity> {
    const client = this.newClient();
    const audience = this.clientId();
    let payload: TokenPayload | undefined;
    try {
      const ticket = await client.verifyIdToken({
        idToken: input.idToken,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      // Static message only: the rejected token is never logged.
      this.logger.warn('google_id_token_rejected');
      throw new GoogleIdentityError('id token verification failed');
    }
    return assertGoogleIdentity(payload, input.expectedNonce);
  }
}
