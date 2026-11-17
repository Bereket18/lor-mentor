import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import type { Request } from 'express';
import { authCookieName } from '../../common/auth-cookies';
import { CSRF_BASE } from '../../common/auth-cookie-names';

/**
 * Injection token for the rate-limit Redis connection.
 *
 * Keeping the client behind a token lets the spec pass a fake connection: the
 * limiter's behaviour (window arithmetic, key hashing, fail-closed policy) is
 * what needs testing, not ioredis.
 */
export const AUTH_RATE_LIMIT_CLIENT = Symbol('AUTH_RATE_LIMIT_CLIENT');

/**
 * Atomic fixed-window counter.
 *
 * INCR and the first-hit PEXPIRE run inside Redis, so two API instances cannot
 * both read "4" and both write "5". Returns [count, remaining ttl in ms].
 */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
`;

/** One budget: at most `limit` events per `windowMs`. */
export interface RateRule {
  limit: number;
  windowMs: number;
}

/** Result of consuming one bucket. */
export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Rules for one browser-initiated request. */
export interface RequestRules {
  ip: RateRule;
  browser?: RateRule;
}

const TOO_MANY_MESSAGE = 'Too many requests. Please wait and try again.';
const UNAVAILABLE_MESSAGE = 'Sign-in is not available right now';

/**
 * Cross-instance rate limiting for the passwordless sign-in routes.
 *
 * Why this exists instead of relying on `@nestjs/throttler`: the throttler
 * keeps counters in process memory, so N API replicas allow N times the stated
 * budget and a restart forgets every bucket. The design requires atomic limits
 * and a uniform 503 when Redis cannot answer (fail closed, never unbounded).
 *
 * What is stored and what is not:
 *
 *  - No raw address, token, cookie or IP reaches Redis. Every key is an
 *    HMAC-SHA256 under `AUTH_RATE_KEY_SECRET`, so the key space is opaque and
 *    rotating the secret starts clean windows.
 *  - Only the counter and its TTL are stored.
 */
@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthRateLimitService.name);
  private readonly keySecret: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(AUTH_RATE_LIMIT_CLIENT) private readonly client: Redis,
  ) {
    this.keySecret = this.config.get<string>('AUTH_RATE_KEY_SECRET') ?? '';
    this.client.on('error', (err) =>
      this.logger.error(`Auth rate-limit Redis error: ${err.message}`),
    );
  }

  /**
   * Consume one unit of a named bucket.
   *
   * Any Redis failure becomes a 503 rather than an allow: a limiter that
   * silently stops limiting during an outage is worse than a sign-in outage,
   * and the design explicitly asks for this behaviour. Existing password and
   * admin flows never call this service, so they keep working.
   */
  async consume(
    kind: string,
    value: string,
    rule: RateRule,
  ): Promise<RateDecision> {
    const key = `authrl:${kind}:${this.digest(kind, value)}`;
    let count = 0;
    let ttlMs = rule.windowMs;
    try {
      const [rawCount, rawTtl] = (await this.client.eval(
        HIT_SCRIPT,
        1,
        key,
        String(rule.windowMs),
      )) as [number, number];
      count = Number(rawCount);
      ttlMs = Number(rawTtl);
    } catch (err) {
      this.logger.error(
        `Rate-limit check failed (failing closed): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }

    return {
      allowed: count <= rule.limit,
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
    };
  }

  /**
   * Enforce the per-IP (and optional per-browser) budgets for one endpoint.
   * Throws a 429 carrying `Retry-After`; the caller never learns which bucket
   * tripped beyond that.
   */
  async enforceRequest(
    req: Request,
    action: string,
    rules: RequestRules,
  ): Promise<void> {
    const ipDecision = await this.consume(
      `ip:${action}`,
      this.clientIp(req),
      rules.ip,
    );
    if (!ipDecision.allowed) this.reject(req, ipDecision.retryAfterSeconds);

    if (!rules.browser) return;
    const browser = this.browserId(req);
    if (!browser) return;
    const browserDecision = await this.consume(
      `browser:${action}`,
      browser,
      rules.browser,
    );
    if (!browserDecision.allowed) {
      this.reject(req, browserDecision.retryAfterSeconds);
    }
  }

  /** Enforce a budget for one profile grant (its token is never stored raw). */
  async enforceGrant(
    req: Request,
    grantToken: string | undefined,
    rule: RateRule,
  ): Promise<void> {
    if (!grantToken) return;
    const decision = await this.consume('grant:profile', grantToken, rule);
    if (!decision.allowed) this.reject(req, decision.retryAfterSeconds);
  }

  /**
   * Atomic delivery caps for one address (5/hour, 10/day per the design).
   * A refusal is not an error: the caller answers with the same generic 202 it
   * uses for administrator and inactive addresses.
   */
  async consumeAddressDelivery(
    email: string,
    perHour: RateRule,
    perDay: RateRule,
  ): Promise<RateDecision> {
    const hour = await this.consume('address:delivery:hour', email, perHour);
    if (!hour.allowed) return hour;
    return this.consume('address:delivery:day', email, perDay);
  }

  /**
   * Address-wide comparison budget across resends (20/hour). Refusals are
   * surfaced as the ordinary generic proof failure, never as an oracle.
   */
  async consumeAddressCode(
    email: string,
    rule: RateRule,
  ): Promise<RateDecision> {
    return this.consume('address:code', email, rule);
  }

  private digest(kind: string, value: string): string {
    if (!this.keySecret) {
      // Env validation requires this secret when a method is enabled; if it is
      // ever absent anyway, refuse the attempt instead of keying on nothing.
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
    return crypto
      .createHmac('sha256', this.keySecret)
      .update(`${kind}:${value}`, 'utf8')
      .digest('hex');
  }

  private clientIp(req: Request): string {
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  /**
   * A browser is identified by its CSRF bootstrap value: it is minted once per
   * tab, held in an HttpOnly cookie, and is already mandatory on every
   * passwordless POST. Nothing new is set just for accounting.
   */
  private browserId(req: Request): string | null {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    return cookies[authCookieName(CSRF_BASE, this.config)] ?? null;
  }

  private reject(req: Request, retryAfterSeconds: number): never {
    req.res?.setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpException(TOO_MANY_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      // Shutdown must not fail because Redis is already gone.
    }
  }
}
