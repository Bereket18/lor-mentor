import {
  codeDigest,
  hashChallengeCode,
  isAdminRole,
  isPlausibleEmail,
  isWellFormedAuthCode,
  returnPathForRole,
  sanitizeReturnPath,
  verifyChallengeCode,
} from './auth-policy';

const PEPPER = 'a'.repeat(48);

describe('challenge code hashing', () => {
  it('accepts the code it hashed and rejects any other', async () => {
    const id = 'challenge-1';
    const hash = await hashChallengeCode(id, '004217', PEPPER);

    await expect(verifyChallengeCode(id, '004217', PEPPER, hash)).resolves.toBe(
      true,
    );
    await expect(verifyChallengeCode(id, '004218', PEPPER, hash)).resolves.toBe(
      false,
    );
  });

  it('binds the hash to the challenge id', async () => {
    const hash = await hashChallengeCode('challenge-1', '004217', PEPPER);

    // The same code against a different challenge must not verify: this is what
    // stops a code from one email being replayed against another.
    await expect(
      verifyChallengeCode('challenge-2', '004217', PEPPER, hash),
    ).resolves.toBe(false);
  });

  it('binds the digest to the pepper', () => {
    expect(codeDigest('c', '123456', PEPPER)).not.toBe(
      codeDigest('c', '123456', 'b'.repeat(48)),
    );
  });

  it('treats a missing stored hash as a plain mismatch, not an error', async () => {
    await expect(
      verifyChallengeCode('challenge-1', '004217', PEPPER, ''),
    ).resolves.toBe(false);
  });
});

describe('sanitizeReturnPath', () => {
  it('keeps an allowlisted path exactly', () => {
    expect(sanitizeReturnPath('/support/tickets')).toBe('/support/tickets');
  });

  it('falls back for everything outside the allowlist', () => {
    for (const value of [
      '/dashboard-evil',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/admin',
      '/dashboard?next=/admin',
      '/dashboard#x',
      '/dashboard%2f..%2fadmin',
      '',
      null,
      42,
    ]) {
      expect(sanitizeReturnPath(value)).toBe('/dashboard');
    }
  });

  it('uses the caller fallback for an unknown role home', () => {
    expect(sanitizeReturnPath('/admin', '/teacher')).toBe('/teacher');
  });

  it('refuses a teacher-only destination for a student', () => {
    expect(returnPathForRole('/teacher', 'STUDENT')).toBe('/dashboard');
    expect(returnPathForRole('/teacher', 'ADMIN')).toBe('/dashboard');
    // A path every role may use is kept.
    expect(returnPathForRole('/support/tickets', 'STUDENT')).toBe(
      '/support/tickets',
    );
  });

  it('keeps an allowlisted destination for a teacher', () => {
    expect(returnPathForRole('/teacher', 'TEACHER')).toBe('/teacher');
    expect(returnPathForRole('/courses', 'TEACHER')).toBe('/courses');
    // A path outside the allowlist still falls back to the role home.
    expect(returnPathForRole('/admin', 'TEACHER')).toBe('/teacher');
  });
});

describe('input shape', () => {
  it('accepts ordinary addresses and rejects header-injection shapes', () => {
    expect(isPlausibleEmail('abebe@example.com')).toBe(true);
    expect(isPlausibleEmail('Abebe.Bekele+med@example.co.uk')).toBe(true);
    expect(isPlausibleEmail('abebe@example.com\r\nBcc: x@y.z')).toBe(false);
    expect(isPlausibleEmail('no-at-sign')).toBe(false);
  });

  it('accepts exactly six digits, including leading zeroes', () => {
    expect(isWellFormedAuthCode('000042')).toBe(true);
    expect(isWellFormedAuthCode('12345')).toBe(false);
    expect(isWellFormedAuthCode('1234567')).toBe(false);
    expect(isWellFormedAuthCode('12a456')).toBe(false);
  });

  it('recognises only the two administrator roles', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('SUPER_ADMIN')).toBe(true);
    expect(isAdminRole('TEACHER')).toBe(false);
    expect(isAdminRole('STUDENT')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});
