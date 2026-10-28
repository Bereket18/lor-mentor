import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

type CookieOptionsRecord = Record<string, unknown>;
type CookieMock = jest.Mock<void, [string, string, CookieOptionsRecord]>;
type ClearCookieMock = jest.Mock<void, [string, CookieOptionsRecord]>;

function response(): {
  res: Response;
  cookie: CookieMock;
  clearCookie: ClearCookieMock;
} {
  const cookie = jest.fn<void, [string, string, CookieOptionsRecord]>();
  const clearCookie = jest.fn<void, [string, CookieOptionsRecord]>();
  return {
    res: { cookie, clearCookie } as unknown as Response,
    cookie,
    clearCookie,
  };
}

function service(): AuthService {
  return {
    login: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      message: 'Logged in',
      user: { id: 'user-1' },
    }),
    verifyRefreshToken: jest.fn().mockResolvedValue({
      sub: 'user-1',
      jti: 'token-1',
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
    assertRefreshTokenActive: jest.fn().mockResolvedValue(undefined),
    revokeRefreshPayload: jest.fn().mockResolvedValue(undefined),
    refreshTokens: jest.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    }),
    revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
}

const loginDto: LoginDto = {
  email: 'student@example.com',
  password: 'Password123!',
};

const requestWithRefreshToken = {
  cookies: { refresh_token: 'refresh-token' },
} as unknown as Request;

describe('AuthController cookie domain', () => {
  it('sets both auth cookies on the configured shared domain', async () => {
    const { res, cookie } = response();
    const controller = new AuthController(
      service(),
      config({ NODE_ENV: 'production', COOKIE_DOMAIN: '.example.com' }),
    );

    await controller.login(loginDto, '127.0.0.1', res);

    expect(cookie).toHaveBeenCalledTimes(2);
    expect(cookie).toHaveBeenNthCalledWith(
      1,
      'access_token',
      'access-token',
      expect.objectContaining({
        domain: '.example.com',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      2,
      'refresh_token',
      'refresh-token',
      expect.objectContaining({
        domain: '.example.com',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('sets both rotated cookies on the configured shared domain', async () => {
    const { res, cookie } = response();
    const controller = new AuthController(
      service(),
      config({ NODE_ENV: 'production', COOKIE_DOMAIN: '.example.com' }),
    );

    await controller.refresh(requestWithRefreshToken, res);

    expect(cookie).toHaveBeenCalledTimes(2);
    for (const call of cookie.mock.calls) {
      expect(call[2]).toEqual(
        expect.objectContaining({ domain: '.example.com' }),
      );
    }
  });

  it('clears both auth cookies with the same domain used to set them', async () => {
    const { res, cookie, clearCookie } = response();
    const controller = new AuthController(
      service(),
      config({ NODE_ENV: 'production', COOKIE_DOMAIN: '.example.com' }),
    );

    await controller.login(loginDto, '127.0.0.1', res);
    const setOptions = cookie.mock.calls[0][2];

    await controller.logout(requestWithRefreshToken, res);
    expect(clearCookie).toHaveBeenCalledTimes(2);
    for (const call of clearCookie.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          domain: setOptions.domain,
          httpOnly: setOptions.httpOnly,
          secure: setOptions.secure,
          sameSite: setOptions.sameSite,
          path: setOptions.path,
        }),
      );
    }
  });

  it('omits the domain option when COOKIE_DOMAIN is not configured', async () => {
    const { res, cookie } = response();
    const controller = new AuthController(
      service(),
      config({ NODE_ENV: 'development' }),
    );

    await controller.login(loginDto, '127.0.0.1', res);

    const options = cookie.mock.calls[0][2];
    expect(options).not.toHaveProperty('domain');
    expect(options).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });
});
