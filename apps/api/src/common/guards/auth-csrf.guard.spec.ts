import { ForbiddenException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuthCsrfGuard } from './auth-csrf.guard';

const CSRF_COOKIE = 'auth_cs_';

function guardFor(values: Record<string, string> = {}): AuthCsrfGuard {
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new AuthCsrfGuard(config);
}

function contextFor(request: {
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: request.method ?? 'POST',
        headers: request.headers ?? {},
        cookies: request.cookies ?? {},
      }),
    }),
  } as unknown as ExecutionContext;
}

const BASE_CONFIG = {
  CORS_ORIGIN: 'http://localhost:3000',
  WEB_PUBLIC_URL: 'http://localhost:3000',
};

describe('AuthCsrfGuard', () => {
  it('lets safe methods through without a token', () => {
    const guard = guardFor(BASE_CONFIG);
    expect(
      guard.canActivate(contextFor({ method: 'GET', headers: {} })),
    ).toBe(true);
  });

  it('accepts a JSON POST from an allowed origin with a matching token', () => {
    const guard = guardFor(BASE_CONFIG);
    expect(
      guard.canActivate(
        contextFor({
          headers: {
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
            'x-auth-csrf': 'token-123',
          },
          cookies: { [CSRF_COOKIE]: 'token-123' },
        }),
      ),
    ).toBe(true);
  });

  it('rejects a missing Origin even when the token matches', () => {
    const guard = guardFor(BASE_CONFIG);
    expect(() =>
      guard.canActivate(
        contextFor({
          headers: {
            'content-type': 'application/json',
            'x-auth-csrf': 'token-123',
          },
          cookies: { [CSRF_COOKIE]: 'token-123' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a foreign Origin', () => {
    const guard = guardFor(BASE_CONFIG);
    expect(() =>
      guard.canActivate(
        contextFor({
          headers: {
            origin: 'https://evil.example',
            'content-type': 'application/json',
            'x-auth-csrf': 'token-123',
          },
          cookies: { [CSRF_COOKIE]: 'token-123' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a missing or mismatched token', () => {
    const guard = guardFor(BASE_CONFIG);
    const base = {
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
    };
    expect(() =>
      guard.canActivate(contextFor({ ...base, cookies: {} })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        contextFor({
          ...base,
          headers: { ...base.headers, 'x-auth-csrf': 'other' },
          cookies: { [CSRF_COOKIE]: 'token-123' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a non-JSON body before looking at the token', () => {
    const guard = guardFor(BASE_CONFIG);
    expect(() =>
      guard.canActivate(
        contextFor({
          headers: {
            origin: 'http://localhost:3000',
            'content-type': 'application/x-www-form-urlencoded',
          },
        }),
      ),
    ).toThrow(UnsupportedMediaTypeException);
  });

  it('rejects everything when no origin allowlist is configured', () => {
    const guard = guardFor({});
    expect(() =>
      guard.canActivate(
        contextFor({
          headers: {
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
            'x-auth-csrf': 'token-123',
          },
          cookies: { [CSRF_COOKIE]: 'token-123' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
