import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Server-side denylist for revoked refresh tokens, backed by Redis.
 *
 * JWTs are stateless — clearing the cookie on logout only stops the browser
 * from sending it; a copied token stays valid until it expires. We give each
 * refresh token a unique `jti` and record revoked ids here with a TTL equal to
 * the token's own remaining lifetime, so the entry self-expires and Redis never
 * grows unbounded. `refresh` checks this list and rejects a revoked token.
 */
@Injectable()
export class TokenDenylistService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenDenylistService.name);
  private readonly client: Redis;
  private readonly failMode: 'closed' | 'open';

  constructor(config: ConfigService) {
    // Fail closed by default: if Redis cannot answer, a refresh token cannot
    // be proven un-revoked, so it must be rejected. `open` exists only as an
    // explicit local-debug escape hatch and is never recommended in production.
    this.failMode =
      config.get<string>('REDIS_FAIL_MODE')?.toLowerCase() === 'open'
        ? 'open'
        : 'closed';
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST') ?? 'localhost',
      port: parseInt(config.get<string>('REDIS_PORT') ?? '6379', 10),
      // Fail fast rather than queueing commands forever if Redis is down.
      maxRetriesPerRequest: 2,
    });
    this.client.on('error', (err) =>
      this.logger.error(`Redis denylist connection error: ${err.message}`),
    );
  }

  private key(jti: string): string {
    return `denylist:refresh:${jti}`;
  }

  /** Revoke a token id until `ttlSeconds` from now (no-op for past/absent ids). */
  async deny(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti || ttlSeconds <= 0) return;
    await this.client.set(this.key(jti), '1', 'EX', Math.ceil(ttlSeconds));
  }

  /**
   * True if this token id has been revoked.
   *
   * Fails CLOSED by default: if Redis is unreachable we cannot prove the token
   * is still valid, so a refresh attempt is rejected. This deliberately
   * prioritises revocation correctness over availability. Set
   * `REDIS_FAIL_MODE=open` only for an explicit local-debug session.
   */
  async isDenied(jti: string | undefined): Promise<boolean> {
    if (!jti) return false;
    try {
      return (await this.client.exists(this.key(jti))) === 1;
    } catch (err) {
      const allow = this.failMode === 'open';
      this.logger.error(
        `Denylist check failed (${allow ? 'allowing' : 'denying'} token): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return !allow;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
