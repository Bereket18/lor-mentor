import type { CookieOptions } from 'express';
import type { ConfigService } from '@nestjs/config';

/**
 * Cookie policy for the passwordless sign-in flow.
 *
 * These cookies are deliberately separate from the session cookies:
 *
 *  - they are host-only and carry no `Domain`, so a parent-domain session
 *    cookie (`COOKIE_DOMAIN`) does not widen their reach;
 *  - production uses the `__Host-` prefix, which browsers only accept when the
 *    cookie is Secure, has `Path=/` and has no Domain — the prefix is therefore
 *    an enforced statement of the policy rather than a naming convention;
 *  - values are random 256-bit material stored only inside the cookie. The
 *    database holds a SHA-256 digest, never the value.
 */
export function isSecureDeployment(config: ConfigService): boolean {
  return config.get<string>('NODE_ENV') === 'production';
}

/** Prefix a base cookie name for the current deployment. */
export function authCookieName(base: string, config: ConfigService): string {
  return isSecureDeployment(config) ? `__Host-${base}` : base;
}

/** HttpOnly, host-only, Lax cookie options for a transient auth artifact. */
export function authCookieOptions(
  config: ConfigService,
  maxAgeMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureDeployment(config),
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * Options that clear a cookie previously set by `authCookieOptions`.
 *
 * `maxAge` is not passed: `res.clearCookie` only needs the identity
 * (name/path/domain/secure/sameSite) to match.
 */
export function clearedAuthCookieOptions(config: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureDeployment(config),
    sameSite: 'lax',
    path: '/',
  };
}
