import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PasswordlessController } from './passwordless.controller';
import type { PasswordlessAuthService } from './passwordless.service';
import type { AuthRateLimitService } from './auth-rate-limit.service';
import type { GoogleAuthService } from './google-auth.service';
import { BROWSER_ID_TTL_MS, CHALLENGE_TTL_MS, PUBLIC_READ_IP_PER_MINUTE, WINDOW_MINUTE_MS } from './auth-policy';
import { OAUTH_TRANSACTION_TTL_MS } from './google-auth.service';

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
    redirect: jest.fn(),
  } as unknown as Response;
  const limits = {
    enforceRequest: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthRateLimitService;
  const service = {
    grantStatus: jest.fn().mockResolvedValue({ status: 'none' }),
    verifyCode: jest.fn().mockResolvedValue({
      next: 'signed_in',
      redirectTo: '/dashboard',
      user: {
        id: 'user-1',
        email: 'student@example.com',
        fullName: 'Test Student',
        role: 'STUDENT',
      },
      session: { accessToken: 'access', refreshToken: 'refresh' },
    }),
    revokePresentedRefreshToken: jest.fn().mockResolvedValue(false),
  } as unknown as PasswordlessAuthService;
  const google = {
    start: jest.fn().mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      browserNonce: 'browser-nonce',
    }),
    complete: jest.fn().mockResolvedValue({
      next: 'signed_in',
      redirectTo: '/dashboard',
      user: {
        id: 'user-1',
        email: 'student@example.com',
        fullName: 'Test Student',
        role: 'STUDENT',
      },
      session: { accessToken: 'access', refreshToken: 'refresh' },
    }),
  };
  const controller = new PasswordlessController(
    service,
    limits,
    configFor(values),
    google as unknown as GoogleAuthService,
  );
  return { controller, res, cookie, setHeader, limits, service, google };
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

describe('PasswordlessController session replacement', () => {
  it('revokes the presented refresh token before writing the new pair', async () => {
    const { controller, res, service } = harness();
    const revoke = (service as unknown as {
      revokePresentedRefreshToken: jest.Mock;
    }).revokePresentedRefreshToken;

    const body = await controller.emailCode(
      { challengeId: 'challenge-1', code: '123456' },
      requestWith({ refresh_token: 'old-refresh' }),
      res,
    );

    expect(revoke).toHaveBeenCalledWith('old-refresh', 'user-1');
    expect(body).toEqual({
      next: 'signed_in',
      redirectTo: '/dashboard',
      user: expect.objectContaining({ id: 'user-1' }),
    });
    expect(JSON.stringify(body)).not.toContain('old-refresh');
    expect(JSON.stringify(body)).not.toContain('refresh');
  });

  it('reports an account switch without naming the previous user', async () => {
    const { controller, res, service } = harness();
    const revoke = (service as unknown as {
      revokePresentedRefreshToken: jest.Mock;
    }).revokePresentedRefreshToken;
    revoke.mockResolvedValue(true);

    const body = await controller.emailCode(
      { challengeId: 'challenge-1', code: '123456' },
      requestWith({ refresh_token: 'old-refresh' }),
      res,
    );

    expect(body).toEqual(
      expect.objectContaining({ next: 'signed_in', switchedAccount: true }),
    );
  });
});

describe('PasswordlessController Google OAuth', () => {
  it('starts a sign-in by binding the transaction to this browser and redirecting', async () => {
    const { controller, res, cookie, google, limits } = harness();

    await controller.startGoogle('/courses', requestWith(), res);

    expect(limits.enforceRequest).toHaveBeenCalledWith(
      expect.anything(),
      'google:start',
      expect.objectContaining({ ip: expect.any(Object) }),
    );
    const [name, value, options] = cookie.mock.calls[0];
    expect(name).toBe('auth_go_');
    expect(value).toBe('browser-nonce');
    expect(options).toEqual(
      expect.objectContaining({ httpOnly: true, maxAge: OAUTH_TRANSACTION_TTL_MS }),
    );
    expect((google as unknown as { start: jest.Mock }).start).toHaveBeenCalledWith(
      '/courses',
    );
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://accounts.google.com/o/oauth2/v2/auth?x=1',
    );
  });

  it('redeems a callback and writes the session, clearing the binding cookie', async () => {
    const { controller, res, google } = harness();

    const body = await controller.googleCallback(
      { code: 'auth-code', state: 'state-value-long-enough' },
      requestWith({ auth_go_: 'browser-nonce' }),
      res,
    );

    expect(
      (google as unknown as { complete: jest.Mock }).complete,
    ).toHaveBeenCalledWith({
      code: 'auth-code',
      state: 'state-value-long-enough',
      browserNonce: 'browser-nonce',
    });
    expect(body).toEqual({
      next: 'signed_in',
      redirectTo: '/dashboard',
      user: expect.objectContaining({ id: 'user-1' }),
    });
    expect(res.clearCookie).toHaveBeenCalledWith(
      'auth_go_',
      expect.any(Object),
    );
  });

  it('clears the binding cookie even when the callback is rejected', async () => {
    const { controller, res, google } = harness();
    (google as unknown as { complete: jest.Mock }).complete.mockRejectedValue(
      new Error('rejected'),
    );

    await expect(
      controller.googleCallback(
        { code: 'auth-code', state: 'state-value-long-enough' },
        requestWith({ auth_go_: 'browser-nonce' }),
        res,
      ),
    ).rejects.toThrow('rejected');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'auth_go_',
      expect.any(Object),
    );
  });
});
