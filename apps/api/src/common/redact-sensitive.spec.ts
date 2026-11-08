import { REDACTED, redactSensitiveFields } from './redact-sensitive';

describe('redactSensitiveFields', () => {
  // The reason this module exists: this exact body is what POST
  // /auth/verify-email sends, and it carries a code that is still valid.
  it('redacts the verification code from a verify-email body', () => {
    const result = redactSensitiveFields({
      email: 'student@example.com',
      code: '428193',
    });

    expect(result).toEqual({
      email: 'student@example.com',
      code: REDACTED,
    });
    expect(JSON.stringify(result)).not.toContain('428193');
  });

  it('redacts passwords from register and login bodies', () => {
    expect(
      redactSensitiveFields({
        email: 'a@b.com',
        password: 'correct horse battery staple',
        fullName: 'Abebe Kebede',
        departmentId: 'dep_1',
      }),
    ).toEqual({
      email: 'a@b.com',
      password: REDACTED,
      fullName: 'Abebe Kebede',
      departmentId: 'dep_1',
    });

    expect(redactSensitiveFields({ email: 'a@b.com', password: 'hunter2' })).toEqual({
      email: 'a@b.com',
      password: REDACTED,
    });
  });

  it('redacts the reset token and the new password', () => {
    expect(
      redactSensitiveFields({ token: 'abc123', newPassword: 'new-secret' }),
    ).toEqual({ token: REDACTED, newPassword: REDACTED });
  });

  it('matches key names case-insensitively', () => {
    expect(
      redactSensitiveFields({ Password: 'p', NEWPASSWORD: 'q', Code: '123456' }),
    ).toEqual({ Password: REDACTED, NEWPASSWORD: REDACTED, Code: REDACTED });
  });

  it('leaves non-credential fields untouched', () => {
    // The whole point of redacting rather than dropping the body: these are
    // what make an unhandled 500 reproducible.
    const body = {
      email: 'student@example.com',
      fullName: 'Abebe Kebede',
      departmentId: 'dep_1',
      academicYearId: 'ay_2',
      phoneNumber: '+251900000000',
      attempt: 3,
      isActive: true,
      note: null,
    };

    expect(redactSensitiveFields(body)).toEqual(body);
  });

  it('does not redact a field merely because its name contains a keyword', () => {
    // Substring matching would eat these; exact-name matching keeps them.
    const body = {
      postalCode: '1000',
      countryCode: 'ET',
      verificationCodeHint: '6 digits',
      encodedPayload: 'not-a-secret',
    };

    expect(redactSensitiveFields(body)).toEqual(body);
  });

  it('reaches credentials nested inside objects and arrays', () => {
    expect(
      redactSensitiveFields({
        data: { user: { password: 'nested' } },
        items: [{ code: '111111' }, { code: '222222' }],
      }),
    ).toEqual({
      data: { user: { password: REDACTED } },
      items: [{ code: REDACTED }, { code: REDACTED }],
    });
  });

  it('returns a copy and never mutates the body it was given', () => {
    // The request object still references this body, so mutating it would
    // corrupt the in-flight request rather than only the report.
    const body: Record<string, unknown> = { email: 'a@b.com', code: '428193' };
    const result = redactSensitiveFields(body);

    expect(result).not.toBe(body);
    expect(body.code).toBe('428193');
  });

  it('passes primitives and empty bodies through without throwing', () => {
    expect(redactSensitiveFields({})).toEqual({});
    expect(redactSensitiveFields(undefined)).toBeUndefined();
    expect(redactSensitiveFields(null)).toBeNull();
    expect(redactSensitiveFields('a string body')).toBe('a string body');
    expect(redactSensitiveFields(42)).toBe(42);
  });

  it('stops descending instead of overflowing on a very deep body', () => {
    // A reportable 500 must not become an unreportable crash inside the
    // exception filter.
    let deep: Record<string, unknown> = { code: '428193' };
    for (let i = 0; i < 50; i++) deep = { nested: deep };

    const result = redactSensitiveFields(deep) as Record<string, unknown>;

    expect(JSON.stringify(result)).not.toContain('428193');
    expect(JSON.stringify(result)).toContain('[truncated]');
  });
});
