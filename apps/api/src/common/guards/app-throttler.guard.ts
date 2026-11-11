import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * The global rate limiter, keyed per authenticated USER when we can identify
 * one and per IP otherwise.
 *
 * A global guard runs before route guards, so `req.user` is not populated yet.
 * Authenticated browsers send the signed `access_token` cookie, which is
 * available this early because `cookieParser` is registered before the router
 * in main.ts. We verify it with the same secret the API signs with; an absent,
 * expired or invalid token simply falls back to the client IP. That keeps the
 * "no auth needed to be rate limited" property while preventing many students
 * behind one college NAT from sharing (and exhausting) a single bucket.
 *
 * The tracker is deliberately prefixed with `global:` so this bucket never
 * collides with the route-level `UserThrottlerGuard`, which uses `user:<id>`.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly jwt = new JwtService();

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    if (user?.id) return `global:user:${user.id}`;

    const cookieUserId = await this.userIdFromAccessToken(req);
    if (cookieUserId) return `global:user:${cookieUserId}`;

    const ip =
      (req.ip as string | undefined) ??
      (req.ips as string[] | undefined)?.[0] ??
      'unknown';
    return `global:ip:${ip}`;
  }

  private async userIdFromAccessToken(
    req: Record<string, unknown>,
  ): Promise<string | undefined> {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) return undefined;

    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.access_token;
    if (!token) return undefined;

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token, {
        secret,
      });
      return payload.sub || undefined;
    } catch {
      // Expired/invalid token: the request is unauthenticated, so it goes into
      // the IP bucket (and will be rejected by the auth guard anyway).
      return undefined;
    }
  }
}
