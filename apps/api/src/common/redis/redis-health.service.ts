import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Dedicated Redis client for the readiness probe.
 *
 * Kept separate from feature clients (e.g. TokenDenylistService) so readiness
 * reflects whether Redis itself is reachable, independent of any feature's
 * own error-handling semantics.
 */
@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST') ?? 'localhost',
      port: parseInt(config.get<string>('REDIS_PORT') ?? '6379', 10),
      // Fail fast — a readiness probe must not hang while Redis is down.
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
    });
    this.client.on('error', (err) =>
      this.logger.error(`Redis health connection error: ${err.message}`),
    );
  }

  /** True if Redis answers PING. Never throws. */
  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch (err) {
      this.logger.error(
        `Redis health check failed: ${
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
