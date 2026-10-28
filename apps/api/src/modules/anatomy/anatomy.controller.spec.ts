import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AnatomyController } from './anatomy.controller';
import { AnatomyService } from './anatomy.service';

describe('AnatomyController access', () => {
  it('restricts every anatomy route to students and teachers', () => {
    const reflector = new Reflector();

    expect(
      reflector.getAllAndOverride<string[]>(ROLES_KEY, [AnatomyController]),
    ).toEqual(['STUDENT', 'TEACHER']);
  });

  it('applies authentication, roles, and per-user throttling in order', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      AnatomyController,
    );

    expect(guards).toEqual([JwtAuthGuard, RolesGuard, UserThrottlerGuard]);
  });
});

async function createApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
    controllers: [AnatomyController],
    providers: [
      JwtAuthGuard,
      RolesGuard,
      UserThrottlerGuard,
      {
        provide: AnatomyService,
        useValue: {
          explainStructure: jest
            .fn()
            .mockResolvedValue({ explanation: 'mock explanation' }),
          generateStructureQuiz: jest.fn().mockResolvedValue({ questions: [] }),
        },
      },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: {
        switchToHttp: () => {
          getRequest: () => {
            headers: Record<string, string | undefined>;
            user?: { id: string; role: string };
          };
        };
      }) => {
        const req = context.switchToHttp().getRequest();
        req.user = {
          id: req.headers['x-test-user'] ?? 'user-a',
          role: 'STUDENT',
        };
        return true;
      },
    })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('AnatomyController AI throttling', () => {
  it.each([
    ['explain', '/anatomy/systems/heart/structures/aortic-valve/explain'],
    ['quiz', '/anatomy/systems/heart/structures/aortic-valve/quiz'],
  ])(
    'limits %s to 20 requests per user per minute',
    async (_name, path) => {
      const app = await createApp();
      try {
        const server = app.getHttpServer();

        for (let i = 0; i < 20; i += 1) {
          await request(server)
            .post(path)
            .set('x-test-user', 'user-a')
            .send({})
            .expect(201);
        }

        // The 21st request from the same account is blocked even though the
        // socket address is unchanged.
        await request(server)
          .post(path)
          .set('x-test-user', 'user-a')
          .send({})
          .expect(429);

        // A different account has its own bucket, proving the guard keys on
        // req.user rather than the shared IP.
        await request(server)
          .post(path)
          .set('x-test-user', 'user-b')
          .send({})
          .expect(201);
      } finally {
        await app.close();
      }
    },
    20_000,
  );
});
