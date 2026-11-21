import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { AuthMailPayload } from './auth-mail.constants';

const ALGORITHM = 'aes-256-gcm';
const AAD = Buffer.from('lor-mentor-auth-mail:v1', 'utf8');
const VERSION = 1;

interface EncryptedEnvelope {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

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
    const secret = config.get<string>('AUTH_TRANSIENT_ENCRYPTION_KEY')?.trim();
    this.key =
      secret && secret.length >= 32
        ? crypto.createHash('sha256').update(secret, 'utf8').digest()
        : null;
  }

  encrypt(payload: AuthMailPayload): string {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(AAD);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    const envelope: EncryptedEnvelope = {
      v: VERSION,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      data: encrypted.toString('base64url'),
    };
    return JSON.stringify(envelope);
  }

  decrypt(value: string): AuthMailPayload {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Sign-in is not available right now',
      );
    }

    let envelope: EncryptedEnvelope;
    try {
      envelope = JSON.parse(value) as EncryptedEnvelope;
    } catch {
      throw new Error('Invalid encrypted auth-mail payload');
    }

    if (
      envelope.v !== VERSION ||
      typeof envelope.iv !== 'string' ||
      typeof envelope.tag !== 'string' ||
      typeof envelope.data !== 'string'
    ) {
      throw new Error('Invalid encrypted auth-mail payload');
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(envelope.iv, 'base64url'),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');

    const parsed = JSON.parse(plaintext) as Partial<AuthMailPayload>;
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
