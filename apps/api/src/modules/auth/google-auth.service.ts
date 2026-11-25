import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { deriveTransientKey, openString, sealString } from './auth-envelope';
import { AuthMethodsConfig } from './auth-methods.config';
import { GoogleIdentityError, GoogleOidcClient } from './google-oidc.client';
import {
  PasswordlessAuthService,
  type AuthCompletion,
} from './passwordless.service';
import {
  PROOF_FAILED_MESSAGE,
  randomToken,
  sanitizeReturnPath,
  sha256,
} from './auth-policy';

/** Ten-minute, single-use OAuth transaction lifetime (Phase 3). */
export const OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;

/**
 * AAD label for OAuth transaction ciphertext. Distinct from sign-in mail, so a
 * value sealed for one purpose can never open as the other.
 */
const OAUTH_AAD = Buffer.from('lor-mentor-oauth-tx:v1', 'utf8');

export interface GoogleStart {
  authorizationUrl: string;
  /** Plaintext browser-binding nonce for the HttpOnly cookie. */
  browserNonce: string;
}

/**
 * Server-side Google OIDC authorization-code flow (Phase 3).
 *
 * Owns only the OAuth plumbing: the browser-bound, single-use transaction, the
 * sealed PKCE verifier and nonce, and the code exchange. The account outcome —
 * identity resolution, eligibility, session issuance — lives in
 * `PasswordlessAuthService`, so there is a single definition of who may sign in.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly key: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oidc: GoogleOidcClient,
    private readonly passwordless: PasswordlessAuthService,
    private readonly methods: AuthMethodsConfig,
    config: ConfigService,
  ) {
    this.key = deriveTransientKey(
      config.get<string>('AUTH_TRANSIENT_ENCRYPTION_KEY'),
    );
  }

  private requireKey(): Buffer {
    if (!this.key) {
      // The transaction store holds sealed secrets; without the key it must not
      // operate at all.
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }
    return this.key;
  }

  /**
   * Refuse every Google route while the flag is off. The flag defaults to false,
   * so this gate keeps the method dark (a uniform 503) and is what stops a stale
   * client from reaching the plumbing when the method is not advertised.
   */
  private assertEnabled(): void {
    if (!this.methods.googleEnabled) {
      throw new ServiceUnavailableException(
        'Google sign-in is not available right now',
      );
    }
  }

  /** Begin a sign-in: create the transaction and return the redirect target. */
  async start(returnTo: unknown): Promise<GoogleStart> {
    this.assertEnabled();
    const key = this.requireKey();

    const state = randomToken(32);
    const browserNonce = randomToken(32);
    const nonce = randomToken(32);
    const codeVerifier = randomToken(32);
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    await this.prisma.authOAuthTransaction.create({
      data: {
        id: state,
        browserNonceHash: sha256(browserNonce),
        encryptedVerifier: sealString(key, OAUTH_AAD, codeVerifier),
        encryptedNonce: sealString(key, OAUTH_AAD, nonce),
        returnPath: sanitizeReturnPath(returnTo),
        expiresAt: new Date(Date.now() + OAUTH_TRANSACTION_TTL_MS),
      },
    });

    const authorizationUrl = this.oidc.authorizationUrl({
      state,
      nonce,
      codeChallenge,
    });
    return { authorizationUrl, browserNonce };
  }

  /**
   * Redeem a callback. The transaction is consumed before anything is
   * exchanged, so a replayed `code`/`state` pair finds nothing to claim.
   */
  async complete(input: {
    code: string;
    state: string;
    browserNonce: string | undefined;
  }): Promise<AuthCompletion> {
    this.assertEnabled();
    const key = this.requireKey();

    const transaction = await this.findTransaction(input.state);
    if (!transaction) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }
    if (
      !this.bindingMatches(transaction.browserNonceHash, input.browserNonce)
    ) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    const claimed = await this.consume(transaction.id);
    if (!claimed) {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    let codeVerifier: string;
    let nonce: string;
    try {
      codeVerifier = openString(key, OAUTH_AAD, claimed.encryptedVerifier);
      nonce = openString(key, OAUTH_AAD, claimed.encryptedNonce);
    } catch {
      throw new BadRequestException(PROOF_FAILED_MESSAGE);
    }

    try {
      const idToken = await this.oidc.exchangeCode({
        code: input.code,
        codeVerifier,
      });
      const identity = await this.oidc.verifyIdToken({
        idToken,
        expectedNonce: nonce,
      });
      return await this.passwordless.completeGoogleSignIn({
        email: identity.email,
        subject: identity.subject,
        returnPath: claimed.returnPath ?? null,
      });
    } catch (error) {
      if (error instanceof GoogleIdentityError) {
        // Uniform failure: a replayed, misbound or unverifiable callback is
        // indistinguishable on the wire.
        throw new BadRequestException(PROOF_FAILED_MESSAGE);
      }
      throw error;
    }
  }

  private async findTransaction(state: string) {
    if (typeof state !== 'string' || state.length < 16) return null;
    return this.prisma.authOAuthTransaction.findFirst({
      where: { id: state, consumedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  private async consume(state: string) {
    const result = await this.prisma.authOAuthTransaction.updateMany({
      where: {
        id: state,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1) return null;
    return this.prisma.authOAuthTransaction.findUnique({ where: { id: state } });
  }

  private bindingMatches(
    expectedHash: string,
    browserNonce: string | undefined,
  ): boolean {
    if (!browserNonce) return false;
    const expected = Buffer.from(expectedHash, 'utf8');
    const actual = Buffer.from(sha256(browserNonce), 'utf8');
    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  }
}
