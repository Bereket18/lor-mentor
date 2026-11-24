import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PasswordlessController } from './passwordless.controller';
import type { PasswordlessAuthService } from './passwordless.service';
import type { AuthRateLimitService } from './auth-rate-limit.service';
import { BROWSER_ID_TTL_MS, CHALLENGE_TTL_MS, PUBLIC_READ_IP_PER_MINUTE, WINDOW_MINUTE_MS } from './auth-policy';

type CookieOptionsRecord = Record<string, unknown>;
type CookieMock = jest.Mock<void, [string, string, CookieOptionsRecord]>;

function configFor(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function harness(values: Record<string, string> = {}) {
  const cookie: CookieMock = jest.fn();
  const setHeader = jest.fn();
  const res = {
    cookie,
    clearCookie: jest.fn(),
    setHeader,
  } as unknown as Response;
  const limits = {
    enforceRequest: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthRateLimitService;
  const service = {
    grantStatus: jest.fn().mockResolvedValue({ status: 'none' }),
  } as unknown as PasswordlessAuthService;
  const controller = new PasswordlessController(
    service,
    limits,
    configFor(values),
  );
  return { controller, res, cookie, setHeader, limits };
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

describe('PasswordlessController profile status', () => {
  it('applies the public-read IP budget and no-store headers', async () => {
    const { controller, res, limits, setHeader } = harness();

    await controller.profileCompletion(requestWith(), res);

    expect(limits.enforceRequest as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      'profile:status',
      { ip: { limit: PUBLIC_READ_IP_PER_MINUTE, windowMs: WINDOW_MINUTE_MS } },
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
  });
});
