import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthMailPayload } from './auth-mail.constants';
import { AuthMailCryptoService } from './auth-mail.crypto';

const KEY_A = 'a'.repeat(48);
const KEY_B = 'b'.repeat(48);

function service(key: string | undefined): AuthMailCryptoService {
  return new AuthMailCryptoService({
    get: (name: string) =>
      name === 'AUTH_TRANSIENT_ENCRYPTION_KEY' ? key : undefined,
  } as unknown as ConfigService);
}

const payload: AuthMailPayload = {
  challengeId: 'challenge-1',
  to: 'student@example.com',
  code: '004217',
  confirmationLink: 'https://app.example.com/auth/email/confirm#token=abc',
  expiresInMinutes: 10,
  deliverable: true,
  userId: 'user-1',
  purpose: 'LOGIN',
};

describe('AuthMailCryptoService', () => {
  it('round-trips a payload without exposing plaintext in the envelope', () => {
    const crypto = service(KEY_A);
    const encrypted = crypto.encrypt(payload);

    expect(encrypted).not.toContain(payload.to);
    expect(encrypted).not.toContain(payload.code);
    expect(encrypted).not.toContain('confirm');
    expect(crypto.decrypt(encrypted)).toEqual(payload);
  });

  it('uses a fresh IV so the same payload encrypts differently', () => {
    const crypto = service(KEY_A);

    expect(crypto.encrypt(payload)).not.toBe(crypto.encrypt(payload));
  });

  it('rejects a payload encrypted with another key', () => {
    const encrypted = service(KEY_A).encrypt(payload);

    expect(() => service(KEY_B).decrypt(encrypted)).toThrow();
  });

  it('rejects a tampered envelope', () => {
    const crypto = service(KEY_A);
    const envelope = JSON.parse(crypto.encrypt(payload)) as {
      data: string;
    };
    const flipped = envelope.data.startsWith('A') ? 'B' : 'A';

    expect(() =>
      crypto.decrypt(
        JSON.stringify({ ...envelope, data: flipped + envelope.data.slice(1) }),
      ),
    ).toThrow();
  });

  it('rejects malformed or versioned envelopes', () => {
    const crypto = service(KEY_A);

    expect(() => crypto.decrypt('not json')).toThrow(/Invalid encrypted/);
    expect(() =>
      crypto.decrypt(JSON.stringify({ v: 2, iv: 'a', tag: 'b', data: 'c' })),
    ).toThrow(/Invalid encrypted/);
  });

  it.each([undefined, '', 'too-short'])(
    'fails closed when the key is missing or short (%s)',
    (key) => {
      const crypto = service(key);

      expect(() => crypto.encrypt(payload)).toThrow(
        ServiceUnavailableException,
      );
      expect(() => crypto.decrypt('{}')).toThrow(ServiceUnavailableException);
    },
  );

  it('accepts a key of exactly 32 characters', () => {
    const crypto = service('k'.repeat(32));

    expect(crypto.decrypt(crypto.encrypt(payload))).toEqual(payload);
  });
});
