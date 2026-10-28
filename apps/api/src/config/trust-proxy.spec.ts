import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { applyTrustProxy, resolveTrustProxy } from './trust-proxy';

@Controller('rate-limit-probe')
class RateLimitProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
  controllers: [RateLimitProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class RateLimitProbeModule {}

async function createApp(trustProxy: string): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [RateLimitProbeModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  applyTrustProxy(app, trustProxy, 'test');
  await app.init();
  return app;
}

describe('trust proxy', () => {
  it('defaults to one hop in production and zero elsewhere', () => {
    expect(resolveTrustProxy(undefined, 'production')).toBe(1);
    expect(resolveTrustProxy('', 'production')).toBe(1);
    expect(resolveTrustProxy(undefined, 'development')).toBe(0);
    expect(resolveTrustProxy(undefined, 'test')).toBe(0);
  });

  it('accepts an explicit non-negative hop count', () => {
    expect(resolveTrustProxy('0', 'production')).toBe(0);
    expect(resolveTrustProxy('2', 'production')).toBe(2);
    expect(resolveTrustProxy(3, 'test')).toBe(3);
  });

  it.each(['one', '-1', '1.5', 'true', '1,2'])(
    'rejects an invalid hop count (%s)',
    (value) => {
      expect(() => resolveTrustProxy(value, 'production')).toThrow(
        /TRUST_PROXY must be a non-negative integer/,
      );
    },
  );

  it('keys the rate limiter on the forwarded client address when enabled', async () => {
    const app = await createApp('1');
    try {
      const server = app.getHttpServer();

      // Two requests from the same forwarded client consume its bucket.
      await request(server)
        .get('/rate-limit-probe')
        .set('X-Forwarded-For', '203.0.113.10')
        .expect(200);
      await request(server)
        .get('/rate-limit-probe')
        .set('X-Forwarded-For', '203.0.113.10')
        .expect(200);
      await request(server)
        .get('/rate-limit-probe')
        .set('X-Forwarded-For', '203.0.113.10')
        .expect(429);

      // A different forwarded client gets its own bucket, proving the limiter
      // is not using the loopback address shared by the test connection.
      await request(server)
        .get('/rate-limit-probe')
        .set('X-Forwarded-For', '203.0.113.11')
        .expect(200);
    } finally {
      await app.close();
    }
  });

  it('ignores forwarded addresses when trust proxy is disabled', async () => {
    const app = await createApp('0');
    try {
      const server = app.getHttpServer();

      await request(server)
        .get('/rate-limit-probe')
        .set('X-Forwarded-For', '203.0.113.10')
        .expect(200);
      await request(server)
        .get('/rate-limit-probe')
        .set('X-Forwarded-For', '203.0.113.11')
        .expect(200);

      // Both requests share the real socket address, so the third is blocked
      // regardless of the spoofable header.
      await request(server)
        .get('/rate-limit-probe')
        .set('X-Forwarded-For', '203.0.113.12')
        .expect(429);
    } finally {
      await app.close();
    }
  });
});
