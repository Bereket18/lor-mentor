import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AUTH_CLEANUP_INTERVAL_MS,
  purgeExpiredAuthRows,
  type AuthCleanupResult,
} from './auth-cleanup';

/**
 * Hourly sweep of expired passwordless rows (P1-4).
 *
 * Every instance runs the timer, but the transaction-scoped advisory lock in
 * `purgeExpiredAuthRows` lets exactly one instance do the work per tick. That
 * removes the need for a separate scheduler, a Redis lease, or a leader
 * election, and it degrades safely if an instance is slow or restarted.
 */
@Injectable()
export class AuthCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Sweep once at boot as well as hourly: a restart is a common way to
    // discover that nobody has been running the timer.
    void this.runScheduled();
    this.timer = setInterval(
      () => void this.runScheduled(),
      AUTH_CLEANUP_INTERVAL_MS,
    );
    // Do not keep the process alive just for the timer.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One sweep with operational logging. Never throws: a failed cleanup must not
   * take down the API or produce an unhandled rejection from a timer.
   */
  async runScheduled(now?: Date): Promise<AuthCleanupResult | null> {
    try {
      const result = await purgeExpiredAuthRows(this.prisma, now);
      if (!result) {
        this.logger.debug(
          'Auth cleanup skipped: another instance holds the lock',
        );
        return null;
      }

      const message =
        `auth_cleanup_removed challenges=${result.challenges} ` +
        `grants=${result.grants} duration_ms=${result.durationMs}`;
      if (result.challenges > 0 || result.grants > 0) {
        this.logger.log(message);
      } else {
        this.logger.debug(message);
      }
      return result;
    } catch (error) {
      this.logger.error(
        `auth_cleanup_failed ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
