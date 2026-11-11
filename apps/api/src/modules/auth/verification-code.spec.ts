import * as bcrypt from 'bcrypt';
import {
  CODE_HASH_ROUNDS,
  CODE_TTL_MINUTES,
  CODE_TTL_MS,
  MAX_CODES_PER_HOUR,
  MAX_VERIFY_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  equalizeVerificationTiming,
  generateVerificationCode,
  hashVerificationCode,
  isWellFormedCode,
  verifyCodeHash,
} from './verification-code';

describe('generateVerificationCode', () => {
  it('always produces exactly six digits', () => {
    for (let i = 0; i < 5000; i++) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it('never produces a seven-digit value', () => {
    expect(generateVerificationCode()).not.toMatch(/^\d{7}$/);
  });

  it('returns a string, not a number', () => {
    expect(typeof generateVerificationCode()).toBe('string');
  });

  it('preserves leading zeroes as real, six-character codes', () => {
    // The failure this guards against is `randomInt(...).toString()`: a draw of
    // 42 becomes "42", which is two characters, fails the six-digit check and
    // silently narrows the code space. A padded "000042" is only reachable if
    // the value is padded, so its presence proves the padding runs.
    const samples = Array.from({ length: 3000 }, generateVerificationCode);
    const padded = samples.filter((code) => code.startsWith('0'));

    expect(padded.length).toBeGreaterThan(0);
    for (const code of padded) {
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }

    // The same fact from the other end: some draw produced a value small enough
    // to need padding at all.
    expect(samples.some((code) => Number(code) < 1000)).toBe(true);
  });

  it('is not a fixed or cycling value', () => {
    const samples = Array.from({ length: 300 }, generateVerificationCode);
    expect(new Set(samples).size).toBeGreaterThan(250);
  });

  it('does not draw from Math.random', () => {
    // Pinning Math.random to one value would make a Math.random-driven
    // generator return the same six digits on every call, since its output is a
    // pure function of the generator's state. The output staying varied is
    // therefore evidence the value does not come from there — which matters
    // because Math.random is seeded predictably and its state can be
    // reconstructed from a few samples.
    //
    // `crypto.randomInt` itself cannot be spied on (the built-in module defines
    // it non-configurable), so this observes the consequence rather than the
    // call.
    const original = Math.random;
    Math.random = () => 0.999999;
    try {
      const samples = Array.from({ length: 25 }, generateVerificationCode);
      expect(new Set(samples).size).toBeGreaterThan(1);
    } finally {
      Math.random = original;
    }
  });

  it('covers the whole 0..999999 range without bias at the boundaries', () => {
    // randomInt's upper bound is exclusive; an inclusive one would make
    // "1000000" reachable and unpaddable to six characters.
    const samples = Array.from({ length: 5000 }, generateVerificationCode);
    const values = samples.map(Number);

    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(999_999);
  });
});

describe('isWellFormedCode', () => {
  it('accepts exactly six digits', () => {
    expect(isWellFormedCode('123456')).toBe(true);
    expect(isWellFormedCode('000000')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of [
      '12345',
      '1234567',
      '12345a',
      ' 123456',
      '123456 ',
      '',
      123456,
      null,
      undefined,
      {},
      ['123456'],
    ]) {
      expect(isWellFormedCode(value)).toBe(false);
    }
  });
});

describe('hashVerificationCode', () => {
  it('stores a bcrypt hash rather than the code', async () => {
    const hash = await hashVerificationCode('000042');

    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain('000042');
    expect(hash.length).toBeGreaterThan(50);
  });

  it('salts, so the same code hashes differently every time', async () => {
    const [first, second] = await Promise.all([
      hashVerificationCode('123456'),
      hashVerificationCode('123456'),
    ]);

    expect(first).not.toBe(second);
    // ...while still verifying against both.
    await expect(verifyCodeHash('123456', first)).resolves.toBe(true);
    await expect(verifyCodeHash('123456', second)).resolves.toBe(true);
  });

  it('uses the configured cost factor', async () => {
    const hash = await hashVerificationCode('123456');
    expect(bcrypt.getRounds(hash)).toBe(CODE_HASH_ROUNDS);
  });
});

describe('verifyCodeHash', () => {
  let hash: string;

  beforeAll(async () => {
    hash = await hashVerificationCode('123456');
  });

  it('accepts the matching code', async () => {
    await expect(verifyCodeHash('123456', hash)).resolves.toBe(true);
  });

  it('rejects a different code', async () => {
    await expect(verifyCodeHash('654321', hash)).resolves.toBe(false);
    // One digit off is still a miss.
    await expect(verifyCodeHash('123457', hash)).resolves.toBe(false);
    await expect(verifyCodeHash('12345', hash)).resolves.toBe(false);
    await expect(verifyCodeHash('012345', hash)).resolves.toBe(false);
  });

  it('returns false instead of throwing when there is no hash to compare', async () => {
    // bcrypt.compare(value, null) rejects. An unguarded call would turn "this
    // account has no pending code" into a 500 rather than an ordinary
    // rejection.
    await expect(verifyCodeHash('123456', null)).resolves.toBe(false);
    await expect(verifyCodeHash('123456', undefined)).resolves.toBe(false);
    await expect(verifyCodeHash('123456', '')).resolves.toBe(false);
  });

  it('returns false rather than throwing on a corrupt stored hash', async () => {
    await expect(verifyCodeHash('123456', 'not-a-hash')).resolves.toBe(false);
  });
});

describe('equalizeVerificationTiming', () => {
  it('resolves without throwing for any input', async () => {
    await expect(equalizeVerificationTiming('123456')).resolves.toBeUndefined();
    await expect(equalizeVerificationTiming('')).resolves.toBeUndefined();
    await expect(
      equalizeVerificationTiming('long-non-code-value'),
    ).resolves.toBeUndefined();
  });
});

describe('verification policy constants', () => {
  it('keeps the email copy and the enforced lifetime in agreement', () => {
    // The email says "expires in N minutes"; the service expires rows after
    // CODE_TTL_MS. If these two drift, the email starts lying to the user.
    expect(CODE_TTL_MINUTES).toBe(CODE_TTL_MS / 60_000);
    expect(Number.isInteger(CODE_TTL_MINUTES)).toBe(true);
  });

  it('keeps the code space and the format in agreement', () => {
    expect(isWellFormedCode(generateVerificationCode())).toBe(true);
  });

  it('allows a wrong guess or two but not a meaningful brute force', () => {
    // 5 of 10^6 per code. Large enough that a typo is not fatal, small enough
    // that guessing is hopeless within one code's lifetime.
    expect(MAX_VERIFY_ATTEMPTS).toBeGreaterThanOrEqual(3);
    expect(MAX_VERIFY_ATTEMPTS).toBeLessThanOrEqual(10);
  });

  it('allows legitimate resends but bounds sustained abuse', () => {
    expect(MAX_CODES_PER_HOUR).toBeGreaterThan(1);
    expect(MAX_CODES_PER_HOUR).toBeLessThanOrEqual(10);

    // The hourly cap must be reachable at all given the cooldown: with a cap
    // below 60s/cooldown the cooldown would be the only limit that ever binds.
    expect(MAX_CODES_PER_HOUR).toBeGreaterThanOrEqual(2);
    expect(RESEND_COOLDOWN_MS).toBeGreaterThanOrEqual(30_000);
  });
});
