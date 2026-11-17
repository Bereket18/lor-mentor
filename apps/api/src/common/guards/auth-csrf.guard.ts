import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { authCookieName } from '../auth-cookies';
import { CSRF_BASE } from '../auth-cookie-names';

/** Constant-time string equality that tolerates different lengths. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizeOrigin(value: string | undefined | null): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '').toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * CSRF protection for the new passwordless endpoints.
 *
 * The global OriginGuard allows requests that omit `Origin`, because that is
 * correct for server-to-server calls. These endpoints are browser-only and
 * unauthenticated, so this guard is stricter:
 *
 *  - `Origin` must be present AND exactly one of our configured origins;
 *  - the body must be JSON (which also forces a CORS preflight cross-origin);
 *  - the `x-auth-csrf` header must equal the value of the bootstrap cookie,
 *    compared in constant time.
 *
 * The token is obtained from `GET /auth/csrf`. It is not tied to a session
 * because there is no session yet; it is a double-submit synchronizer token.
 */
@Injectable()
export class AuthCsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(private readonly config: ConfigService) {
    const values = [
      ...(this.config.get<string>('CORS_ORIGIN') ?? '').split(','),
      this.config.get<string>('WEB_PUBLIC_URL') ?? '',
      this.config.get<string>('API_PUBLIC_URL') ?? '',
    ];
    this.allowedOrigins = new Set(
      values.map(normalizeOrigin).filter((value): value is string => !!value),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Only state-changing requests need this; the guard is attached to POST
    // routes, but GET is allowed through in case a route is shared.
    const method = (request.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new UnsupportedMediaTypeException('Expected a JSON request body');
    }

    const origin = normalizeOrigin(request.headers.origin as string | undefined);
    if (!origin) {
      throw new ForbiddenException('Request origin is required');
    }
    if (this.allowedOrigins.size === 0 || !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException('Cross-origin request rejected');
    }

    const cookies = (request.cookies ?? {}) as Record<string, string | undefined>;
    const cookieToken = cookies[authCookieName(CSRF_BASE, this.config)] ?? '';
    const headerToken = String(request.headers['x-auth-csrf'] ?? '');
    if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    return true;
  }
}
