import type { CookieOptions, Response } from 'express';
import type { ConfigService } from '@nestjs/config';

/**
 * Cookies that carry the session. Shared by the password and passwordless
 * controllers so both issue exactly the same cookie shape — the web proxy and
 * the edge guard read these names, and a mismatch would look like a failed
 * login rather than a configuration error.
 */
export function sessionCookieOptions(config: ConfigService): CookieOptions {
  const domain = config.get<string>('COOKIE_DOMAIN')?.trim();
  return {
    httpOnly: true,
    secure: config.get<string>('NODE_ENV') === 'production',
    sameSite: 'lax',
    path: '/',
    // Optional shared parent domain. The web edge guard (apps/web/src/proxy.ts)
    // and /api/proxy read cookies on the WEB host, so when the API lives on
    // api.<domain> and the web app on <domain>, both must use the same
    // parent-domain cookie (for example COOKIE_DOMAIN=.example.com).
    ...(domain ? { domain } : {}),
  };
}

/** Overwrite both session cookies with a freshly issued pair. */
export function writeSessionCookies(
  res: Response,
  config: ConfigService,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie('access_token', tokens.accessToken, {
    ...sessionCookieOptions(config),
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refresh_token', tokens.refreshToken, {
    ...sessionCookieOptions(config),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/** Remove both session cookies. */
export function clearSessionCookies(res: Response, config: ConfigService): void {
  res.clearCookie('access_token', sessionCookieOptions(config));
  res.clearCookie('refresh_token', sessionCookieOptions(config));
}
