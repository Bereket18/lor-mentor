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

  constructor(config: ConfigService) {
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

  /** True if this token id has been revoked. Fails OPEN if Redis is unreachable. */
  async isDenied(jti: string | undefined): Promise<boolean> {
    if (!jti) return false;
    try {
      return (await this.client.exists(this.key(jti))) === 1;
    } catch (err) {
      // Don't lock everyone out if Redis blips — log and allow. The token still
      // expires on its own; this only affects the revoke-early guarantee.
      this.logger.error(
        `Denylist check failed (allowing token): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
