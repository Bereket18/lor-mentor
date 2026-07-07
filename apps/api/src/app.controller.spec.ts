import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import type { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  function makeController(queryRaw: () => Promise<unknown>) {
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    return new AppController(prisma);
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
    it('reports ready when the database responds', async () => {
      const controller = makeController(() => Promise.resolve([{ '?column?': 1 }]));
      await expect(controller.getReadiness()).resolves.toEqual({
        status: 'ready',
        database: 'up',
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
  });
});
