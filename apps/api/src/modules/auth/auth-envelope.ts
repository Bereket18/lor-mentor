import * as crypto from 'crypto';

/**
 * Authenticated-encryption envelope for transient sign-in secrets (P2-7).
 *
 * One implementation, shared by the sign-in mail queue and the Google OAuth
 * transaction store. A caller supplies its own additional-authenticated-data
 * label, so ciphertext sealed for one purpose can never decrypt as another.
 * The key is derived from a single dedicated environment secret; a missing or
 * short secret yields `null` and the caller fails closed.
 */
const ALGORITHM = 'aes-256-gcm';
const VERSION = 1;

interface EncryptedEnvelope {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

/** Derive the 32-byte key from the shared secret, or null when unusable. */
export function deriveTransientKey(secret: string | undefined): Buffer | null {
  const trimmed = secret?.trim();
  return trimmed && trimmed.length >= 32
    ? crypto.createHash('sha256').update(trimmed, 'utf8').digest()
    : null;
}

/** Seal a UTF-8 string into a versioned base64url envelope. */
export function sealString(
  key: Buffer,
  aad: Buffer,
  plaintext: string,
): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
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

/**
 * Open an envelope sealed with the same key and AAD. Throws on a malformed
 * envelope, a version mismatch, or any authentication failure.
 */
export function openString(key: Buffer, aad: Buffer, value: string): string {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(value) as EncryptedEnvelope;
  } catch {
    throw new Error('Invalid encrypted payload');
  }

  if (
    envelope.v !== VERSION ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.data !== 'string'
  ) {
    throw new Error('Invalid encrypted payload');
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.iv, 'base64url'),
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
