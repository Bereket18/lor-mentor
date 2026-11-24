import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthRateLimitService, type RateRule } from './auth-rate-limit.service';

const SECRET = 'r'.repeat(48);
const CSRF_COOKIE = 'auth_cs_';
const BROWSER_COOKIE = 'auth_bid_';

const configFor = (values: Record<string, string> = {}): ConfigService =>
  ({
    get: (key: string) => values[key],
  }) as unknown as ConfigService;

/**
 * Minimal stand-in for the ioredis connection.
 *
 * It implements exactly the one command this service uses (`eval` with the
 * atomic INCR+PEXPIRE script) so the spec can drive counts, observe TTLs and
 * simulate an outage without a Redis server.
 */
class FakeRedis {
  readonly counts = new Map<string, { count: number; ttlMs: number }>();
  readonly calls: Array<{ key: string; ttlMs: number }> = [];
  fail = false;
  on(): void {
    // error listener registration
  }

  async eval(
    _script: string,
    _keys: number,
    key: string,
    windowMs: string,
  ): Promise<[number, number]> {
    if (this.fail) throw new Error('ECONNREFUSED');
    const ttlMs = Number(windowMs);
    const entry = this.counts.get(key) ?? { count: 0, ttlMs };
    entry.count += 1;
    entry.ttlMs = ttlMs;
    this.counts.set(key, entry);
    this.calls.push({ key, ttlMs });
    return [entry.count, entry.ttlMs];
  }

  async quit(): Promise<void> {
    // nothing to close
  }
}

function serviceFor(fake: FakeRedis, secret = SECRET): AuthRateLimitService {
  return new AuthRateLimitService(
    configFor({ AUTH_RATE_KEY_SECRET: secret }),
    fake as never,
  );
}

function requestFor(overrides: Partial<Request> = {}): Request {
  return {
    ip: '203.0.113.9',
    cookies: {},
    socket: { remoteAddress: '203.0.113.9' },
    res: { setHeader: jest.fn() } as unknown as Response,
    ...overrides,
  } as unknown as Request;
}

const rule = (limit: number, windowMs = 60_000): RateRule => ({
  limit,
  windowMs,
});

/** Resolve the HTTP status an operation failed with, or null if it passed. */
async function statusOf(operation: Promise<unknown>): Promise<number | null> {
  try {
    await operation;
    return null;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

describe('AuthRateLimitService', () => {
  it('allows exactly the budget and then refuses with a retry hint', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);

    for (let i = 0; i < 3; i += 1) {
      await expect(
        service.consume('ip:test', '1.2.3.4', rule(3)),
      ).resolves.toEqual({ allowed: true, retryAfterSeconds: 60 });
    }

    const blocked = await service.consume('ip:test', '1.2.3.4', rule(3));
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('never stores a raw address, IP or browser value in a key', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);

    await service.consume('address:code', 'student@example.edu', rule(5));
    const key = fake.calls[0].key;

    expect(key).toMatch(/^authrl:address:code:[0-9a-f]{64}$/);
    expect(key).not.toContain('student');
    expect(key).not.toContain('example.edu');
  });

  it('separates buckets, so one action cannot spend another action’s budget', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);

    await service.consume('ip:start', '1.2.3.4', rule(1));
    const second = await service.consume('ip:code', '1.2.3.4', rule(1));
    expect(second.allowed).toBe(true);
  });

  it('fails closed with a uniform 503 when Redis is unreachable', async () => {
    const fake = new FakeRedis();
    fake.fail = true;
    const service = serviceFor(fake);

    await expect(
      service.consume('ip:test', '1.2.3.4', rule(10)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await statusOf(service.consume('ip:test', '1.2.3.4', rule(10)))).toBe(
      503,
    );
  });

  it('refuses rather than keying on nothing when the secret is missing', async () => {
    const service = serviceFor(new FakeRedis(), '');
    expect(await statusOf(service.consume('ip:test', '1.2.3.4', rule(10)))).toBe(
      503,
    );
  });

  it('enforces the IP budget and sets Retry-After before throwing 429', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);
    const req = requestFor();

    await service.enforceRequest(req, 'email:code', { ip: rule(1) });
    expect(
      await statusOf(service.enforceRequest(req, 'email:code', { ip: rule(1) })),
    ).toBe(429);
    expect(req.res?.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('enforces a browser budget keyed to the stable browser id, not the CSRF token', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);
    const rules = { ip: rule(100), browser: rule(1) };

    const browserA = requestFor({
      cookies: { [BROWSER_COOKIE]: 'bid-a', [CSRF_COOKIE]: 'csrf-1' },
    });
    await service.enforceRequest(browserA, 'email:code', rules);

    // Refreshing the CSRF bootstrap must not return budget: the browser id is
    // unchanged, so this is the same bucket (P1-2).
    const sameBrowser = requestFor({
      cookies: { [BROWSER_COOKIE]: 'bid-a', [CSRF_COOKIE]: 'csrf-2' },
    });
    expect(
      await statusOf(service.enforceRequest(sameBrowser, 'email:code', rules)),
    ).toBe(429);

    // A different browser id is unaffected.
    const browserB = requestFor({
      cookies: { [BROWSER_COOKIE]: 'bid-b', [CSRF_COOKIE]: 'csrf-3' },
    });
    await expect(
      service.enforceRequest(browserB, 'email:code', rules),
    ).resolves.toBeUndefined();
  });

  it('falls back to the CSRF value when no browser id cookie is present', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);
    const rules = { ip: rule(100), browser: rule(1) };

    const first = requestFor({ cookies: { [CSRF_COOKIE]: 'csrf-only' } });
    await service.enforceRequest(first, 'email:code', rules);
    expect(
      await statusOf(service.enforceRequest(first, 'email:code', rules)),
    ).toBe(429);
  });

  it('stops consuming the day bucket once the hourly cap already refuses', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);
    const hour = { limit: 1, windowMs: 3_600_000 };
    const day = { limit: 10, windowMs: 86_400_000 };

    await service.consumeAddressDelivery('a@b.co', hour, day);
    const refused = await service.consumeAddressDelivery('a@b.co', hour, day);

    expect(refused.allowed).toBe(false);
    const dayCalls = fake.calls.filter((call) =>
      call.key.startsWith('authrl:address:delivery:day:'),
    );
    expect(dayCalls).toHaveLength(1);
  });

  it('shares one delivery budget across start and resend for an address', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);
    const hour = { limit: 2, windowMs: 3_600_000 };
    const day = { limit: 10, windowMs: 86_400_000 };

    await service.consumeAddressDelivery('student@example.edu', hour, day);
    await service.consumeAddressDelivery('student@example.edu', hour, day);
    const third = await service.consumeAddressDelivery(
      'student@example.edu',
      hour,
      day,
    );

    expect(third.allowed).toBe(false);
  });

  it('enforces the per-grant profile budget without storing the grant token', async () => {
    const fake = new FakeRedis();
    const service = serviceFor(fake);
    const token = 'grant-token-that-must-not-appear-in-redis';
    const req = requestFor();

    await service.enforceGrant(req, token, rule(1));
    expect(await statusOf(service.enforceGrant(req, token, rule(1)))).toBe(429);

    const keys = fake.calls.map((call) => call.key).join('\n');
    expect(keys).not.toContain(token);
  });
});
