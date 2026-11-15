import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerStorageService } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import sharp from 'sharp';
import { AppThrottlerGuard } from '../src/common/guards/app-throttler.guard';
import { JwtStrategy } from '../src/common/strategies/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/modules/users/users.service';
import { MailService } from '../src/modules/mail/mail.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { SupportController } from '../src/modules/support/support.controller';
import { AdminSupportController } from '../src/modules/support/admin-support.controller';
import { SupportService } from '../src/modules/support/support.service';
import { SupportAttachmentsService } from '../src/modules/support/support-attachments.service';
import {
  MAX_OPEN_TICKETS,
  MAX_TICKETS_PER_DAY,
} from '../src/modules/support/support.constants';
import { isDisposableDatabaseUrl } from '../src/common/utils/disposable-database';

export { isDisposableDatabaseUrl };

/**
 * REAL-HTTP authorisation matrix for support tickets.
 *
 * Unlike support.service.spec.ts (a hand-written Prisma stand-in), this suite
 * boots the controllers, guards, JWT strategy and the real Prisma client
 * against a **disposable Postgres**, and asserts the answer a hostile browser
 * would actually get.
 *
 * Run:
 *   $env:DATABASE_URL = "postgresql://qa@127.0.0.1:55433/lor_support_e2e?schema=public"
 *   cd apps/api && npx jest --config ./test/jest-e2e.json support-auth
 *
 * It skips itself unless DATABASE_URL names a database that looks disposable
 * (it creates and then deletes rows), so it can never wipe a real environment
 * by accident. The CI service database (`lor_mentor_ci`) is in the allowlist,
 * which is what makes this matrix run in the api:e2e job instead of skipping.
 */
jest.setTimeout(120_000);

/**
 * True only for a database this suite may create and delete rows in.
 *
 * The rule lives in `src/common/utils/disposable-database.ts` so the fixture
 * seeder cannot drift from it; see that file for what is accepted (any name
 * containing e2e / test / disposable / qa, or exactly `lor_mentor_ci`).
 */

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const DISPOSABLE_DB = isDisposableDatabaseUrl(DATABASE_URL);

if (!DATABASE_URL || !DISPOSABLE_DB) {
  describe.skip('Support authorisation matrix (set DATABASE_URL to a disposable database)', () => {
    it('skipped', () => undefined);
  });
} else {
  const JWT_SECRET = 'support-e2e-secret';

  interface TestUser {
    id: string;
    email: string;
    fullName: string;
    role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  }

  describe('Support authorisation matrix (real HTTP, disposable Postgres)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let jwt: JwtService;
    const mail = {
      sendSupportTicketCreated: jest.fn().mockResolvedValue(undefined),
      sendSupportReply: jest.fn().mockResolvedValue(undefined),
    };

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const users: Record<'a' | 'b' | 'teacher' | 'admin', TestUser> = {
      a: {
        id: '',
        email: `student-a-${suffix}@example.test`,
        fullName: 'Student A',
        role: 'STUDENT',
      },
      b: {
        id: '',
        email: `student-b-${suffix}@example.test`,
        fullName: 'Student B',
        role: 'STUDENT',
      },
      teacher: {
        id: '',
        email: `teacher-${suffix}@example.test`,
        fullName: 'Teacher One',
        role: 'TEACHER',
      },
      admin: {
        id: '',
        email: `admin-${suffix}@example.test`,
        fullName: 'Admin One',
        role: 'ADMIN',
      },
    };
    const ids = {
      tickets: [] as string[],
      payments: [] as string[],
      users: [] as string[],
    };

    beforeAll(async () => {
      process.env.JWT_ACCESS_SECRET = JWT_SECRET;
      process.env.DATABASE_URL = DATABASE_URL;

      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
          ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
        ],
        controllers: [SupportController, AdminSupportController],
        providers: [
          PrismaService,
          SupportService,
          SupportAttachmentsService,
          NotificationsService,
          AuditService,
          JwtStrategy,
          {
            provide: UsersService,
            useValue: {
              findById: (id: string) =>
                prisma.user.findUnique({
                  where: { id },
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                    role: true,
                    phoneNumber: true,
                    avatarPath: true,
                    isActive: true,
                    isEmailVerified: true,
                    isAnatomyReviewer: true,
                    createdAt: true,
                  },
                }),
            },
          },
          { provide: MailService, useValue: mail },
          { provide: APP_GUARD, useClass: AppThrottlerGuard },
        ],
      }).compile();

      app = moduleRef.createNestApplication({ rawBody: true });
      prisma = app.get(PrismaService);
      // The global guard reads the signed cookie before any auth guard runs.
      app.use(cookieParser());
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();

      jwt = new JwtService();

      for (const key of Object.keys(users) as Array<keyof typeof users>) {
        const user = users[key];
        const created = await prisma.user.create({
          data: {
            email: user.email,
            passwordHash: 'not-a-real-hash',
            fullName: user.fullName,
            role: user.role,
            isActive: true,
            isEmailVerified: true,
          },
          select: { id: true },
        });
        user.id = created.id;
        ids.users.push(created.id);
      }
    });

    afterAll(async () => {
      if (!prisma) return;
      // Scoped cleanup: only the rows this suite created, and in FK order.
      await prisma.notification.deleteMany({
        where: { userId: { in: ids.users } },
      });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: ids.users } },
      });
      await prisma.supportAttachment.deleteMany({
        where: { message: { ticket: { userId: { in: ids.users } } } },
      });
      await prisma.supportInternalNote.deleteMany({
        where: { ticket: { userId: { in: ids.users } } },
      });
      await prisma.supportMessage.deleteMany({
        where: { ticket: { userId: { in: ids.users } } },
      });
      await prisma.supportTicket.deleteMany({
        where: { userId: { in: ids.users } },
      });
      await prisma.payment.deleteMany({ where: { id: { in: ids.payments } } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      // The throttler keeps one expiry timer per (route, user) bucket. In the
      // real app the storage's shutdown hook clears them; this suite builds a
      // partial module graph, so do it explicitly or Jest waits out every TTL.
      await app.close();
      try {
        app.get(ThrottlerStorageService).onApplicationShutdown?.();
      } catch {
        // Nothing to clear if the storage never left the graph.
      }
    });

    async function cookieFor(userId: string): Promise<string> {
      const token = await jwt.signAsync(
        { sub: userId },
        { secret: JWT_SECRET },
      );
      return `access_token=${token}`;
    }

    /** Seeds a ticket straight into Postgres, bypassing the create throttle. */
    async function seedTicket(
      userId: string,
      overrides: { status?: 'OPEN' | 'RESOLVED' } = {},
    ): Promise<{ id: string; number: number }> {
      const row = await prisma.supportTicket.create({
        data: {
          userId,
          subject: 'Seeded ticket',
          category: 'OTHER',
          status: overrides.status ?? 'OPEN',
          resolvedAt: overrides.status === 'RESOLVED' ? new Date() : null,
          messages: {
            create: {
              authorId: userId,
              body: 'Seeded message body.',
              isStaff: false,
            },
          },
        },
        select: { id: true, number: true },
      });
      ids.tickets.push(row.id);
      return row;
    }

    /** A fresh student, so per-user throttles never leak between tests. */
    async function createStudent(label: string): Promise<string> {
      const created = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@example.test`,
          passwordHash: 'x',
          fullName: `Student ${label}`,
          role: 'STUDENT',
          isActive: true,
          isEmailVerified: true,
        },
        select: { id: true },
      });
      ids.users.push(created.id);
      return created.id;
    }

    async function createTicketAs(
      userId: string,
      body = 'I paid yesterday and it still says pending.',
    ): Promise<{ id: string; number: number; messages: unknown[] }> {
      const res = await request(app.getHttpServer())
        .post('/api/v1/support/tickets')
        .set('Cookie', await cookieFor(userId))
        .field('subject', 'Payment not showing')
        .field('category', 'PAYMENT')
        .field('body', body)
        .expect(201);
      const ticket = res.body as {
        id: string;
        number: number;
        messages: unknown[];
      };
      ids.tickets.push(ticket.id);
      return ticket;
    }

    describe('authentication', () => {
      it('rejects every support route without a token', async () => {
        for (const path of [
          '/api/v1/support/tickets',
          '/api/v1/support/tickets/anything',
          '/api/v1/support/payments',
        ]) {
          await request(app.getHttpServer()).get(path).expect(401);
        }
        await request(app.getHttpServer())
          .post('/api/v1/support/tickets')
          .send({ subject: 'Hello', body: 'Long enough body here.' })
          .expect(401);
      });
    });

    describe("student A cannot reach student B's ticket", () => {
      let ticketB: { id: string; number: number };

      beforeAll(async () => {
        ticketB = await seedTicket(users.b.id);
      });

      it('cannot read the ticket', async () => {
        await request(app.getHttpServer())
          .get(`/api/v1/support/tickets/${ticketB.id}`)
          .set('Cookie', await cookieFor(users.a.id))
          .expect(404);
      });

      it('cannot read the thread through a listing filter', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/support/tickets')
          .set('Cookie', await cookieFor(users.a.id))
          .expect(200);
        const body = res.body as { items: Array<{ id: string }> };
        expect(body.items.some((row) => row.id === ticketB.id)).toBe(false);
      });

      it('cannot reply on it', async () => {
        await request(app.getHttpServer())
          .post(`/api/v1/support/tickets/${ticketB.id}/messages`)
          .set('Cookie', await cookieFor(users.a.id))
          .send({ body: 'Hijacked' })
          .expect(404);
      });

      it('cannot resolve it or mark it read', async () => {
        await request(app.getHttpServer())
          .patch(`/api/v1/support/tickets/${ticketB.id}/resolve`)
          .set('Cookie', await cookieFor(users.a.id))
          .expect(404);
        await request(app.getHttpServer())
          .post(`/api/v1/support/tickets/${ticketB.id}/read`)
          .set('Cookie', await cookieFor(users.a.id))
          .expect(404);
      });

      it('can read its own ticket and never sees staff-only fields', async () => {
        const own = await createTicketAs(users.a.id);
        const res = await request(app.getHttpServer())
          .get(`/api/v1/support/tickets/${own.id}`)
          .set('Cookie', await cookieFor(users.a.id))
          .expect(200);
        const body = res.body as Record<string, unknown>;
        expect(body.id).toBe(own.id);
        expect(body.ticketNumber).toBe(
          `T-${String(own.number).padStart(6, '0')}`,
        );
        expect(body).not.toHaveProperty('assignedToId');
        expect(body).not.toHaveProperty('lastStaffReadAt');
        expect(body).not.toHaveProperty('internalNotes');
      });
    });

    describe('internal notes', () => {
      it('are visible to staff and never to the student', async () => {
        const ticket = await seedTicket(users.a.id);
        const note = 'Called the student; the bank says pending.';

        await request(app.getHttpServer())
          .post(`/api/v1/admin/support/tickets/${ticket.id}/notes`)
          .set('Cookie', await cookieFor(users.admin.id))
          .send({ body: note })
          .expect(201);

        const staffView = await request(app.getHttpServer())
          .get(`/api/v1/admin/support/tickets/${ticket.id}`)
          .set('Cookie', await cookieFor(users.admin.id))
          .expect(200);
        expect(
          (staffView.body as { internalNotes: unknown[] }).internalNotes,
        ).toHaveLength(1);

        const studentView = await request(app.getHttpServer())
          .get(`/api/v1/support/tickets/${ticket.id}`)
          .set('Cookie', await cookieFor(users.a.id))
          .expect(200);
        expect(studentView.body).not.toHaveProperty('internalNotes');
        expect(JSON.stringify(studentView.body)).not.toContain(note);
      });
    });

    describe('payments', () => {
      it("refuses another student's payment", async () => {
        const plan =
          (await prisma.subscriptionPlan.findFirst({ select: { id: true } })) ??
          (await prisma.subscriptionPlan.create({
            data: {
              name: `E2E plan ${suffix}`,
              priceETB: 100,
              durationMonths: 1,
            },
            select: { id: true },
          }));

        const paymentOfB = await prisma.payment.create({
          data: {
            userId: users.b.id,
            planId: plan.id,
            method: 'MANUAL',
            status: 'PENDING',
            amount: 100,
          },
          select: { id: true },
        });
        ids.payments.push(paymentOfB.id);

        await request(app.getHttpServer())
          .post('/api/v1/support/tickets')
          .set('Cookie', await cookieFor(users.a.id))
          .field('subject', 'About a payment')
          .field('category', 'PAYMENT')
          .field('body', 'This is about a payment that is not mine.')
          .field('paymentId', paymentOfB.id)
          .expect(400);
      });

      it("lists only the caller's own payments for the picker", async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/support/payments')
          .set('Cookie', await cookieFor(users.a.id))
          .expect(200);
        const items = (res.body as { items: Array<{ id: string }> }).items;
        expect(items.every((row) => !ids.payments.includes(row.id))).toBe(true);
      });
    });

    describe('roles on the admin routes', () => {
      it('refuses a student, a teacher and anyone unauthenticated', async () => {
        const ticket = await seedTicket(users.a.id);
        for (const offender of [users.a, users.teacher]) {
          await request(app.getHttpServer())
            .get('/api/v1/admin/support/tickets')
            .set('Cookie', await cookieFor(offender.id))
            .expect(403);
          await request(app.getHttpServer())
            .get(`/api/v1/admin/support/tickets/${ticket.id}`)
            .set('Cookie', await cookieFor(offender.id))
            .expect(403);
          await request(app.getHttpServer())
            .post(`/api/v1/admin/support/tickets/${ticket.id}/messages`)
            .set('Cookie', await cookieFor(offender.id))
            .send({ body: 'Not allowed' })
            .expect(403);
          await request(app.getHttpServer())
            .post(`/api/v1/admin/support/tickets/${ticket.id}/notes`)
            .set('Cookie', await cookieFor(offender.id))
            .send({ body: 'Not allowed' })
            .expect(403);
        }
        await request(app.getHttpServer())
          .get('/api/v1/admin/support/tickets')
          .expect(401);
      });

      it('serves canned replies and the staff list to staff only', async () => {
        const canned = await request(app.getHttpServer())
          .get('/api/v1/admin/support/canned-replies')
          .set('Cookie', await cookieFor(users.admin.id))
          .expect(200);
        expect(
          (canned.body as { items: unknown[] }).items.length,
        ).toBeGreaterThanOrEqual(12);

        await request(app.getHttpServer())
          .get('/api/v1/admin/support/canned-replies')
          .set('Cookie', await cookieFor(users.a.id))
          .expect(403);

        await request(app.getHttpServer())
          .get('/api/v1/admin/support/staff')
          .set('Cookie', await cookieFor(users.admin.id))
          .expect(200);
      });
    });

    describe('attachments', () => {
      async function jpeg(): Promise<Buffer> {
        return sharp({
          create: {
            width: 64,
            height: 48,
            channels: 3,
            background: { r: 12, g: 120, b: 120 },
          },
        })
          .jpeg()
          .toBuffer();
      }

      it('accepts a real JPEG, re-encodes it, and serves it to the owner only', async () => {
        const owner = await createStudent('attach-owner');
        const stranger = await createStudent('attach-stranger');
        const image = await jpeg();
        const created = await request(app.getHttpServer())
          .post('/api/v1/support/tickets')
          .set('Cookie', await cookieFor(owner))
          .field('subject', 'Receipt image')
          .field('category', 'PAYMENT')
          .field('body', 'Here is the receipt I am asking about.')
          .attach('attachments', image, {
            filename: 'receipt.jpg',
            contentType: 'image/jpeg',
          })
          .expect(201);

        const body = created.body as {
          id: string;
          messages: Array<{
            attachments: Array<{ id: string; width: number; height: number }>;
          }>;
        };
        ids.tickets.push(body.id);
        const attachment = body.messages[0]?.attachments[0];
        expect(attachment).toBeDefined();
        expect(attachment?.width).toBe(64);
        expect(attachment?.height).toBe(48);

        const download = await request(app.getHttpServer())
          .get(`/api/v1/support/attachments/${attachment?.id}`)
          .set('Cookie', await cookieFor(owner))
          .expect(200);
        expect(download.headers['content-type']).toBe('image/jpeg');
        expect(download.headers['x-content-type-options']).toBe('nosniff');
        expect(download.headers['cache-control']).toBe('private, no-store');

        await request(app.getHttpServer())
          .get(`/api/v1/support/attachments/${attachment?.id}`)
          .set('Cookie', await cookieFor(stranger))
          .expect(404);

        await request(app.getHttpServer())
          .get(`/api/v1/support/attachments/${attachment?.id}`)
          .expect(401);
      });

      it('records an audit row when staff view a student file', async () => {
        const owner = await createStudent('attach-audit');
        const ticket = await seedTicket(owner);
        const image = await jpeg();
        const replied = await request(app.getHttpServer())
          .post(`/api/v1/support/tickets/${ticket.id}/messages`)
          .set('Cookie', await cookieFor(owner))
          .field('body', 'Attaching the screenshot now.')
          .attach('attachments', image, {
            filename: 'shot.jpg',
            contentType: 'image/jpeg',
          })
          .expect(201);
        const attachmentId = (
          replied.body as { attachments: Array<{ id: string }> }
        ).attachments[0]?.id;
        expect(attachmentId).toBeDefined();

        await request(app.getHttpServer())
          .get(`/api/v1/support/attachments/${attachmentId}`)
          .set('Cookie', await cookieFor(users.admin.id))
          .expect(200);

        const audit = await prisma.auditLog.findFirst({
          where: { action: 'SUPPORT_ATTACHMENT_VIEW', entityId: attachmentId },
        });
        expect(audit?.actorId).toBe(users.admin.id);
      });

      it('rejects a file that is not really an image', async () => {
        const student = await createStudent('attach-bad');
        await request(app.getHttpServer())
          .post('/api/v1/support/tickets')
          .set('Cookie', await cookieFor(student))
          .field('subject', 'Bad upload')
          .field('category', 'OTHER')
          .field('body', 'This file is not an image at all.')
          .attach('attachments', Buffer.from('<script>alert(1)</script>'), {
            filename: 'evil.jpg',
            contentType: 'image/jpeg',
          })
          .expect(400);
      });

      it('rejects a fourth attachment', async () => {
        const student = await createStudent('attach-four');
        const image = await jpeg();
        await request(app.getHttpServer())
          .post('/api/v1/support/tickets')
          .set('Cookie', await cookieFor(student))
          .field('subject', 'Too many images')
          .field('category', 'OTHER')
          .field('body', 'Four images is one too many here.')
          .attach('attachments', image, {
            filename: '1.jpg',
            contentType: 'image/jpeg',
          })
          .attach('attachments', image, {
            filename: '2.jpg',
            contentType: 'image/jpeg',
          })
          .attach('attachments', image, {
            filename: '3.jpg',
            contentType: 'image/jpeg',
          })
          .attach('attachments', image, {
            filename: '4.jpg',
            contentType: 'image/jpeg',
          })
          .expect(400);
      });
    });

    describe('limits', () => {
      it(`refuses a student's ${MAX_OPEN_TICKETS + 1}th open ticket`, async () => {
        const student = await prisma.user.create({
          data: {
            email: `limit-${suffix}@example.test`,
            passwordHash: 'x',
            fullName: 'Limit Student',
            role: 'STUDENT',
            isActive: true,
            isEmailVerified: true,
          },
          select: { id: true },
        });
        ids.users.push(student.id);

        for (let index = 0; index < MAX_OPEN_TICKETS; index += 1) {
          await seedTicket(student.id);
        }

        const res = await request(app.getHttpServer())
          .post('/api/v1/support/tickets')
          .set('Cookie', await cookieFor(student.id))
          .field('subject', 'One too many')
          .field('category', 'OTHER')
          .field('body', 'This ticket should be refused by the open cap.')
          .expect(429);
        expect((res.body as { message: string }).message).toContain(
          'open tickets',
        );
      });

      it(`refuses more than ${MAX_TICKETS_PER_DAY} tickets a day`, async () => {
        const student = await prisma.user.create({
          data: {
            email: `daily-${suffix}@example.test`,
            passwordHash: 'x',
            fullName: 'Daily Student',
            role: 'STUDENT',
            isActive: true,
            isEmailVerified: true,
          },
          select: { id: true },
        });
        ids.users.push(student.id);

        // Seed the day's quota directly so the per-minute create throttle
        // cannot mask the daily cap (which is the rule under test).
        for (let index = 0; index < MAX_TICKETS_PER_DAY; index += 1) {
          await seedTicket(student.id, { status: 'RESOLVED' });
        }

        const res = await request(app.getHttpServer())
          .post('/api/v1/support/tickets')
          .set('Cookie', await cookieFor(student.id))
          .field('subject', 'One too many today')
          .field('category', 'OTHER')
          .field('body', 'This ticket should be refused by the daily cap.')
          .expect(429);
        expect((res.body as { message: string }).message).toContain('a day');
      });

      it('throttles per user, not per IP: two students on one IP do not block each other', async () => {
        // 21 messages trips the 20/min per-user route limit. Both students come
        // from the same IP (supertest), so an IP-keyed limiter would block B
        // as soon as A was throttled. Dedicated users keep their buckets away
        // from the lifecycle tests above.
        const first = await prisma.user.create({
          data: {
            email: `throttle-a-${suffix}@example.test`,
            passwordHash: 'x',
            fullName: 'Throttle A',
            role: 'STUDENT',
            isActive: true,
            isEmailVerified: true,
          },
          select: { id: true },
        });
        const second = await prisma.user.create({
          data: {
            email: `throttle-b-${suffix}@example.test`,
            passwordHash: 'x',
            fullName: 'Throttle B',
            role: 'STUDENT',
            isActive: true,
            isEmailVerified: true,
          },
          select: { id: true },
        });
        ids.users.push(first.id, second.id);

        const ticketA = await seedTicket(first.id);
        const ticketB = await seedTicket(second.id);

        for (let attempt = 0; attempt < 20; attempt += 1) {
          await request(app.getHttpServer())
            .post(`/api/v1/support/tickets/${ticketA.id}/messages`)
            .set('Cookie', await cookieFor(first.id))
            .send({ body: `Message ${attempt}` })
            .expect(201);
        }
        await request(app.getHttpServer())
          .post(`/api/v1/support/tickets/${ticketA.id}/messages`)
          .set('Cookie', await cookieFor(first.id))
          .send({ body: 'One too many' })
          .expect(429);

        await request(app.getHttpServer())
          .post(`/api/v1/support/tickets/${ticketB.id}/messages`)
          .set('Cookie', await cookieFor(second.id))
          .send({ body: 'Student B is unaffected' })
          .expect(201);
      });
    });

    describe('student reply lifecycle', () => {
      it('reopens a RESOLVED ticket and refuses one resolved long ago', async () => {
        const fresh = await seedTicket(users.a.id);
        await request(app.getHttpServer())
          .patch(`/api/v1/support/tickets/${fresh.id}/resolve`)
          .set('Cookie', await cookieFor(users.a.id))
          .expect(200);

        const reopened = await request(app.getHttpServer())
          .post(`/api/v1/support/tickets/${fresh.id}/messages`)
          .set('Cookie', await cookieFor(users.a.id))
          .send({ body: 'The problem came back.' })
          .expect(201);
        expect(reopened.body).toMatchObject({ isStaff: false });

        const old = await seedTicket(users.a.id);
        await prisma.supportTicket.update({
          where: { id: old.id },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(Date.now() - 30 * 86_400_000),
          },
        });
        const refused = await request(app.getHttpServer())
          .post(`/api/v1/support/tickets/${old.id}/messages`)
          .set('Cookie', await cookieFor(users.a.id))
          .send({ body: 'Too late?' })
          .expect(409);
        expect((refused.body as { message: string }).message).toContain(
          `T-${String(old.number).padStart(6, '0')}`,
        );
      });

      it('hides the reply composer once a ticket is CLOSED', async () => {
        const ticket = await seedTicket(users.a.id);
        await prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { status: 'CLOSED', closedAt: new Date() },
        });

        const view = await request(app.getHttpServer())
          .get(`/api/v1/support/tickets/${ticket.id}`)
          .set('Cookie', await cookieFor(users.a.id))
          .expect(200);
        expect((view.body as { canReply: boolean }).canReply).toBe(false);
      });
    });

    describe('staff notification email', () => {
      it('contains only the ticket id, number, category and subject', async () => {
        mail.sendSupportTicketCreated.mockClear();

        await createTicketAs(
          users.b.id,
          'Secret medical detail that must not be emailed.',
        );

        expect(mail.sendSupportTicketCreated).toHaveBeenCalledTimes(1);
        const calls = mail.sendSupportTicketCreated.mock.calls as Array<
          [Record<string, unknown>]
        >;
        const payload = calls[0]?.[0] ?? {};
        expect(Object.keys(payload).sort()).toEqual([
          'category',
          'subject',
          'ticketId',
          'ticketNumber',
        ]);
        expect(JSON.stringify(payload)).not.toContain('Secret medical detail');
      });
    });
  });
}
