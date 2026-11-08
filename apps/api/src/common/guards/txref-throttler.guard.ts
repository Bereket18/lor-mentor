import { Injectable, OnModuleInit } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * A dedicated, self-contained throttler for the public Chapa browser callback.
 *
 * `GET /payments/chapa/callback?tx_ref=...` re-verifies the transaction with
 * Chapa on every call, so replaying one reference must be capped at its source:
 * the transaction reference. That key spans clients (Chapa's redirect and any
 * browser retries all carry the same `tx_ref`), which is why it cannot be a
 * second named throttler in the global config - it would apply to every route.
 * This guard installs its own `txref` throttler instead and is applied only to
 * that handler. The global limiter still provides a generous per-IP ceiling.
 */
@Injectable()
export class TxRefThrottlerGuard extends ThrottlerGuard implements OnModuleInit {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  async onModuleInit(): Promise<void> {
    // Do not call super: the module-level throttlers are the global per-IP
    // bucket, and this guard must only enforce its own tx_ref bucket.
    const txref: ThrottlerOptions = {
      name: 'txref',
      ttl: 60_000,
      limit: 6,
    };
    this.throttlers = [txref];
    this.commonOptions = {
      getTracker: this.getTracker.bind(this),
      generateKey: this.generateKey.bind(this),
    };
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const query = req.query as Record<string, unknown> | undefined;
    const raw = query?.tx_ref ?? query?.trx_ref;
    const reference =
      typeof raw === 'string' && raw.trim() ? raw.trim() : 'missing';
    return Promise.resolve(`txref:${reference}`);
  }
}
