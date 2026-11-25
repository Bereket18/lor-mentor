import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthMailPayload } from './auth-mail.constants';
import {
  deriveTransientKey,
  openString,
  sealString,
} from './auth-envelope';

/**
 * AAD label for sign-in mail. It separates mail ciphertext from every other
 * envelope sealed under the same key (for example the OAuth transactions).
 */
const AAD = Buffer.from('lor-mentor-auth-mail:v1', 'utf8');

/**
 * Authenticated encryption for transient sign-in mail payloads.
 *
 * The queue is allowed to hold ciphertext only: an operator with Redis access
 * must not be able to read a code or sign-in link. The key is derived from a
 * dedicated environment secret; it is never logged, and a missing or short
 * secret fails closed.
 */
@Injectable()
export class AuthMailCryptoService {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    this.key = deriveTransientKey(
      config.get<string>('AUTH_TRANSIENT_ENCRYPTION_KEY'),
    );
  }

  encrypt(payload: AuthMailPayload): string {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }
    return sealString(this.key, AAD, JSON.stringify(payload));
  }

  decrypt(value: string): AuthMailPayload {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }

    let plaintext: string;
    try {
      plaintext = openString(this.key, AAD, value);
    } catch {
      throw new Error('Invalid encrypted auth-mail payload');
    }

    let parsed: Partial<AuthMailPayload>;
    try {
      parsed = JSON.parse(plaintext) as Partial<AuthMailPayload>;
    } catch {
      throw new Error('Invalid encrypted auth-mail payload');
    }

    if (
      typeof parsed.challengeId !== 'string' ||
      typeof parsed.to !== 'string' ||
      typeof parsed.code !== 'string' ||
      typeof parsed.confirmationLink !== 'string' ||
      typeof parsed.expiresInMinutes !== 'number' ||
      typeof parsed.deliverable !== 'boolean' ||
      (parsed.purpose !== 'LOGIN' && parsed.purpose !== 'SIGNUP')
    ) {
      throw new Error('Invalid decrypted auth-mail payload');
    }

    return {
      challengeId: parsed.challengeId,
      to: parsed.to,
      code: parsed.code,
      confirmationLink: parsed.confirmationLink,
      expiresInMinutes: parsed.expiresInMinutes,
      deliverable: parsed.deliverable,
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      purpose: parsed.purpose,
    };
  }
}
