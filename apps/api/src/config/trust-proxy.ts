import type { INestApplication } from '@nestjs/common';

/**
 * Number of reverse-proxy hops to trust in production when TRUST_PROXY is not
 * set. The production topology is nginx -> API on the same host, so exactly
 * one hop (nginx) should be trusted. Without this, Express ignores
 * X-Forwarded-For and every request appears to come from 127.0.0.1, which
 * collapses per-IP rate limiting into one shared bucket.
 */
export const PRODUCTION_TRUST_PROXY_HOPS = 1;

/**
 * Resolve TRUST_PROXY to an Express `trust proxy` hop count.
 *
 * - Unset/blank: 1 in production, 0 everywhere else.
 * - Explicit value: a non-negative integer number of hops.
 *
 * A number (rather than `true`) is deliberate: `true` trusts the left-most
 * X-Forwarded-For entry, which a client can spoof. A hop count only trusts
 * addresses added by proxies we actually operate.
 */
export function resolveTrustProxy(
  raw: unknown,
  nodeEnv: unknown = process.env.NODE_ENV,
): number {
  const fallback = nodeEnv === 'production' ? PRODUCTION_TRUST_PROXY_HOPS : 0;

  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw < 0) {
      throw new Error(
        'TRUST_PROXY must be a non-negative integer (number of proxy hops)',
      );
    }
    return raw;
  }
  if (typeof raw !== 'string') {
    throw new Error(
      'TRUST_PROXY must be a non-negative integer (number of proxy hops)',
    );
  }

  const value = raw.trim();
  if (value === '') return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(
      'TRUST_PROXY must be a non-negative integer (number of proxy hops)',
    );
  }

  const hops = Number(value);
  if (!Number.isSafeInteger(hops)) {
    throw new Error(
      'TRUST_PROXY must be a non-negative integer (number of proxy hops)',
    );
  }
  return hops;
}

/**
 * Apply the configured trust-proxy hop count to the underlying Express app.
 * Must run before the HTTP server starts handling requests.
 */
export function applyTrustProxy(
  app: INestApplication,
  raw: unknown = process.env.TRUST_PROXY,
  nodeEnv: unknown = process.env.NODE_ENV,
): number {
  const hops = resolveTrustProxy(raw, nodeEnv);
  // getInstance() is typed as `any` by Nest's adapter interface; narrow it to
  // the Express setting API we actually use.
  const express = app.getHttpAdapter().getInstance() as {
    set: (setting: string, value: unknown) => void;
  };
  express.set('trust proxy', hops);
  return hops;
}
