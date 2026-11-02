import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function trimOrigin(value: string | undefined | null): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '').toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Rejects state-changing requests that a browser announces as coming from an
 * origin we do not serve.
 *
 * Why this exists on top of `SameSite=Lax` cookies:
 *
 *  - `SameSite=Lax` stops a browser from *attaching* the session cookie to a
 *    cross-site POST, which blocks the classic form-submission CSRF. That is
 *    the primary defence, but it is a browser-side policy: it does not help if
 *    a future change needs `SameSite=None` (for example a separate API host
 *    with a non-shared cookie domain), and it says nothing about requests made
 *    by a client that does not implement it.
 *  - Our state-changing endpoints take JSON bodies, so a cross-origin call
 *    also needs a successful CORS preflight — a second layer, again only for
 *    browsers.
 *
 * This guard adds a server-side check that does not depend on either: if the
 * request carries an `Origin` header and that origin is not ours, the request
 * is refused. Requests without an `Origin` header — server-to-server calls,
 * the Next.js rewrite/proxy, webhooks, curl and the test suite — are allowed,
 * because a browser cannot be tricked into omitting it on a cross-site
 * request.
 *
 * The allowlist is `CORS_ORIGIN` (comma-separated) plus `WEB_PUBLIC_URL` and
 * `API_PUBLIC_URL`. When none is configured (local development with defaults)
 * the guard stays out of the way; production validation requires those
 * variables, so a production deployment always has an allowlist.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(private readonly config: ConfigService) {
    const values = [
      ...(this.config.get<string>('CORS_ORIGIN') ?? '').split(','),
      this.config.get<string>('WEB_PUBLIC_URL') ?? '',
      this.config.get<string>('API_PUBLIC_URL') ?? '',
    ];
    this.allowed = new Set(
      values.map(trimOrigin).filter((value): value is string => value !== null),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const method = (request.method ?? 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) return true;

    const rawOrigin = request.headers?.origin;
    const origin = trimOrigin(
      Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin,
    );

    // No Origin header: not a cross-site browser request. The browser sets
    // this header on every cross-origin request and on same-origin non-GET
    // requests, so a state-changing request without one did not come from a
    // page the browser considers a different site.
    if (!origin) return true;

    if (this.allowed.size === 0) return true;

    if (this.allowed.has(origin)) return true;

    throw new ForbiddenException('Cross-origin request rejected');
  }
}
