import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PasswordlessController } from './passwordless.controller';
import type { PasswordlessAuthService } from './passwordless.service';
import type { AuthRateLimitService } from './auth-rate-limit.service';
import { BROWSER_ID_TTL_MS, CHALLENGE_TTL_MS } from './auth-policy';

type CookieOptionsRecord = Record<string, unknown>;
type CookieMock = jest.Mock<void, [string, string, CookieOptionsRecord]>;

function configFor(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function harness(values: Record<string, string> = {}) {
  const cookie: CookieMock = jest.fn();
  const res = {
    cookie,
    clearCookie: jest.fn(),
    setHeader: jest.fn(),
  } as unknown as Response;
  const limits = {
    enforceRequest: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthRateLimitService;
  const controller = new PasswordlessController(
    {} as unknown as PasswordlessAuthService,
    limits,
    configFor(values),
  );
  return { controller, res, cookie };
}

function requestWith(cookies: Record<string, string> = {}): Request {
  return { cookies } as unknown as Request;
}

describe('PasswordlessController CSRF bootstrap', () => {
  it('mints one stable browser id and one CSRF token', async () => {
    const { controller, res, cookie } = harness();

    const body = await controller.csrf(requestWith(), res);

    expect(cookie).toHaveBeenCalledTimes(2);
    const [browserName, browserValue, browserOptions] = cookie.mock.calls[0];
    expect(browserName).toBe('auth_bid_');
    expect(browserValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(browserOptions).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: BROWSER_ID_TTL_MS,
    });

    const [csrfName, csrfValue, csrfOptions] = cookie.mock.calls[1];
    expect(csrfName).toBe('auth_cs_');
    expect(csrfValue).toBe(body.csrfToken);
    expect(csrfOptions).toEqual(
      expect.objectContaining({ httpOnly: true, maxAge: CHALLENGE_TTL_MS }),
    );
  });

  it('keeps an existing browser id when refreshing the CSRF token', async () => {
    const { controller, res, cookie } = harness();

    const body = await controller.csrf(
      requestWith({ auth_bid_: 'existing-browser' }),
      res,
    );

    expect(cookie).toHaveBeenCalledTimes(1);
    expect(cookie.mock.calls[0][0]).toBe('auth_cs_');
    expect(cookie.mock.calls[0][1]).toBe(body.csrfToken);
  });

  it('uses the __Host- prefix and Secure in production', async () => {
    const { controller, res, cookie } = harness({ NODE_ENV: 'production' });

    await controller.csrf(requestWith(), res);

    expect(cookie.mock.calls.map((call) => call[0])).toEqual([
      '__Host-auth_bid_',
      '__Host-auth_cs_',
    ]);
    for (const call of cookie.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ secure: true, path: '/' }));
    }
  });
});
