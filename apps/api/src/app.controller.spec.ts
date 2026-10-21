import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import type { PrismaService } from './prisma/prisma.service';
import type { RedisHealthService } from './common/redis/redis-health.service';

describe('AppController', () => {
  function makeController(
    queryRaw: () => Promise<unknown>,
    ping: () => Promise<boolean> = () => Promise.resolve(true),
  ) {
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const redis = { ping } as unknown as RedisHealthService;
    return new AppController(prisma, redis);
  }

  describe('getHealth (liveness)', () => {
    it('reports ok without touching the database', () => {
      const spy = jest.fn();
      const controller = makeController(spy);
      const res = controller.getHealth();
      expect(res.status).toBe('ok');
      expect(res.app).toBe('Lor Mentor API');
      expect(typeof res.timestamp).toBe('string');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('getReadiness', () => {
    it('reports ready when the database and Redis respond', async () => {
      const controller = makeController(() =>
        Promise.resolve([{ '?column?': 1 }]),
      );
      await expect(controller.getReadiness()).resolves.toEqual({
        status: 'ready',
        database: 'up',
        redis: 'up',
      });
    });

    it('throws ServiceUnavailable when the database is down', async () => {
      const controller = makeController(() =>
        Promise.reject(new Error('connection refused')),
      );
      await expect(controller.getReadiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailable when Redis is down', async () => {
      const controller = makeController(
        () => Promise.resolve([{ '?column?': 1 }]),
        () => Promise.resolve(false),
      );

      let caught: unknown;
      try {
        await controller.getReadiness();
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      expect((caught as ServiceUnavailableException).getResponse()).toEqual({
        status: 'unavailable',
        database: 'up',
        redis: 'down',
      });
    });
  });
});
