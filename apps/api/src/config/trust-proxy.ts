import type { INestApplication } from '@nestjs/common';
import { isIP } from 'node:net';

/**
 * Number of reverse-proxy hops to trust in production when TRUST_PROXY is not
 * set. The production topology is nginx -> API on the same host, so exactly
 * one hop (nginx) should be trusted. Without this, Express ignores
 * X-Forwarded-For and every request appears to come from 127.0.0.1, which
 * collapses per-IP rate limiting into one shared bucket.
 */
export const PRODUCTION_TRUST_PROXY_HOPS = 1;

/** The value Express accepts for its `trust proxy` setting. */
export type TrustProxySetting = number | string[];

const INVALID_TRUST_PROXY =
  'TRUST_PROXY must be a non-negative integer (proxy hops) or a comma-separated list of trusted proxy IPs/subnets (e.g. "loopback,172.18.0.0/16")';

/**
 * Named ranges Express/proxy-addr understands: `loopback` (127.0.0.0/8, ::1),
 * `linklocal` (169.254.0.0/16, fe80::/10) and `uniquelocal` (the private
 * ranges, including the Docker bridge subnets).
 */
const NAMED_PROXY_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** True when `entry` is a single IP literal or an IP/subnet (CIDR) range. */
function isProxyAddress(entry: string): boolean {
  if (NAMED_PROXY_RANGES.has(entry)) return true;

  const parts = entry.split('/');
  if (parts.length > 2) return false;

  const [address, prefix] = parts;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;

  const bits = Number(prefix);
  return Number.isSafeInteger(bits) && bits <= (family === 4 ? 32 : 128);
}

function invalidTrustProxy(): Error {
  return new Error(INVALID_TRUST_PROXY);
}

/**
 * Resolve TRUST_PROXY to an Express `trust proxy` setting.
 *
 * - Unset/blank: 1 in production, 0 everywhere else.
 * - A non-negative integer: that many reverse-proxy hops.
 * - A comma-separated list: trusted proxy addresses/subnets, e.g.
 *   `loopback` or `loopback,172.18.0.0/16`. This is the recommended form when
 *   the proxies are known (nginx on loopback, the Docker bridge subnet): a
 *   subnet only trusts peers that can actually reach the API, so a client
 *   cannot spoof its way into a new rate-limit bucket.
 *
 * A number (rather than `true`) is deliberate: `true` trusts the left-most
 * X-Forwarded-For entry, which a client can spoof. A hop count only trusts
 * addresses added by proxies we actually operate.
 */
export function resolveTrustProxy(
  raw: unknown,
  nodeEnv: unknown = process.env.NODE_ENV,
): TrustProxySetting {
  const fallback: number =
    nodeEnv === 'production' ? PRODUCTION_TRUST_PROXY_HOPS : 0;

  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw < 0) throw invalidTrustProxy();
    return raw;
  }
  if (typeof raw !== 'string') throw invalidTrustProxy();

  const value = raw.trim();
  if (value === '') return fallback;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (!Number.isSafeInteger(hops)) throw invalidTrustProxy();
    return hops;
  }

  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.some((entry) => !entry || !isProxyAddress(entry))) {
    throw invalidTrustProxy();
  }
  return entries;
}

/**
 * Apply the configured trust-proxy setting to the underlying Express app.
 * Must run before the HTTP server starts handling requests.
 */
export function applyTrustProxy(
  app: INestApplication,
  raw: unknown = process.env.TRUST_PROXY,
  nodeEnv: unknown = process.env.NODE_ENV,
): TrustProxySetting {
  const trustProxy = resolveTrustProxy(raw, nodeEnv);
  // getInstance() is typed as `any` by Nest's adapter interface; narrow it to
  // the Express setting API we actually use.
  const express = app.getHttpAdapter().getInstance() as {
    set: (setting: string, value: unknown) => void;
  };
  express.set('trust proxy', trustProxy);
  return trustProxy;
}
