import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OriginGuard } from './origin.guard';

function config(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const configWithAllowlist = config({
  CORS_ORIGIN: 'https://lormentor.com, https://www.lormentor.com ',
  WEB_PUBLIC_URL: 'https://lormentor.com/',
  API_PUBLIC_URL: 'https://api.lormentor.com',
});

function context(method: string, origin?: string | string[]): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        headers: origin === undefined ? {} : { origin },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  const guard = new OriginGuard(configWithAllowlist);

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'allows %s from any origin (safe methods change nothing)',
    (method) => {
      expect(guard.canActivate(context(method, 'https://evil.example'))).toBe(
        true,
      );
    },
  );

  it('allows a state-changing request from an allowlisted origin', () => {
    for (const origin of [
      'https://lormentor.com',
      'https://lormentor.com/',
      'https://www.lormentor.com',
      'https://api.lormentor.com',
      'HTTPS://LORMENTOR.COM',
    ]) {
      expect(guard.canActivate(context('POST', origin))).toBe(true);
    }
  });

  it('rejects a state-changing request from a foreign origin', () => {
    expect(() =>
      guard.canActivate(context('POST', 'https://evil.example')),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(context('PATCH', 'https://lormentor.com.evil.example')),
    ).toThrow('Cross-origin request rejected');
    expect(() => guard.canActivate(context('DELETE', 'null'))).toThrow(
      ForbiddenException,
    );
  });

  it('allows requests with no Origin header', () => {
    // The Next rewrite/proxy, webhooks, server-to-server calls and the test
    // suite do not send one; a browser cannot be made to omit it cross-site.
    expect(guard.canActivate(context('POST'))).toBe(true);
    expect(guard.canActivate(context('DELETE'))).toBe(true);
  });

  it('does not get in the way when no allowlist is configured', () => {
    const unconfigured = new OriginGuard(config({}));
    expect(
      unconfigured.canActivate(context('POST', 'https://anything.example')),
    ).toBe(true);
  });

  it('evaluates a repeated Origin header by its first value', () => {
    // A duplicate header is not something a browser produces, but it must be
    // handled deterministically and must not smuggle an allowlisted value in
    // at position two.
    expect(() =>
      guard.canActivate(
        context('POST', ['https://evil.example', 'https://lormentor.com']),
      ),
    ).toThrow(ForbiddenException);
  });
});
