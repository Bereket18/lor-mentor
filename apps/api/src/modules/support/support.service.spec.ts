/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest's asymmetric
   matchers (expect.any, expect.objectContaining) are typed as `any`, so using
   them inside a toHaveBeenCalledWith payload is unavoidable here. */
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { MailService } from '../mail/mail.service';
import type { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../../common/types/request-user';
import { SupportService } from './support.service';
import { SupportAttachmentsService } from './support-attachments.service';
import {
  MAX_OPEN_TICKETS,
  MAX_TICKETS_PER_DAY,
  RESOLVE_REOPEN_WINDOW_DAYS,
} from './support.constants';

/**
 * The service is exercised against a hand-written Prisma stand-in rather than
 * a database: these tests pin the *rules* (who can see what, what reopens a
 * ticket, which notification is sent, what the limits are), and the migration
 * plus the HTTP authorisation matrix are proven separately against a real
 * disposable Postgres (test/support-auth.e2e-spec.ts).
 */
describe('SupportService', () => {
  const createTicket = jest.fn();
  const updateTicket = jest.fn();
  const updateManyTickets = jest.fn();
  const findFirstTicket = jest.fn();
  const findUniqueTicket = jest.fn();
  const findManyTickets = jest.fn();
  const countTickets = jest.fn();
  const createMessage = jest.fn();
  const findManyUsers = jest.fn();
  const findFirstUser = jest.fn();
  const createNote = jest.fn();
  const findManyPayments = jest.fn();
  const findFirstPayment = jest.fn();
  const findUniqueAttachment = jest.fn();
  const deleteAttachments = jest.fn();
  const findManyAttachments = jest.fn();
  const createAudit = jest.fn();
  const notifyUsers = jest.fn();
  const sendSupportTicketCreated = jest.fn();
  const sendSupportReply = jest.fn();

  const tx = {
    supportTicket: { create: createTicket, update: updateTicket },
    supportMessage: { create: createMessage },
  };

  const prisma = {
    supportTicket: {
      create: createTicket,
      findFirst: findFirstTicket,
      findUnique: findUniqueTicket,
      findMany: findManyTickets,
      count: countTickets,
      update: updateTicket,
      updateMany: updateManyTickets,
    },
    supportMessage: { create: createMessage },
    supportInternalNote: { create: createNote },
    supportAttachment: {
      findUnique: findUniqueAttachment,
      findMany: findManyAttachments,
      deleteMany: deleteAttachments,
    },
    payment: { findMany: findManyPayments, findFirst: findFirstPayment },
    user: { findMany: findManyUsers, findFirst: findFirstUser },
    auditLog: { create: createAudit },
    $transaction: jest.fn((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;

  const notifications = { notifyUsers } as unknown as NotificationsService;
  const mail = {
    sendSupportTicketCreated,
    sendSupportReply,
  } as unknown as MailService;
  const audit = { record: createAudit } as unknown as AuditService;

  const service = new SupportService(prisma, notifications, mail);
  const attachments = new SupportAttachmentsService(prisma, audit);

  const student: RequestUser = {
    id: 'student-1',
    email: 'student@example.com',
    fullName: 'Student One',
    role: 'STUDENT',
    phoneNumber: null,
    avatarPath: null,
    isActive: true,
    isEmailVerified: true,
    isAnatomyReviewer: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const admin: RequestUser = {
    ...student,
    id: 'admin-1',
    email: 'admin@example.com',
    fullName: 'Admin One',
    role: 'ADMIN',
  };

  const ticketRow = {
    id: 'ticket-1',
    number: 1,
    userId: 'student-1',
    subject: 'Payment not showing',
    category: 'PAYMENT',
    status: 'OPEN',
    reference: null,
    paymentId: null,
    assignedToId: null,
    createdAt: new Date('2026-11-11T08:00:00.000Z'),
    updatedAt: new Date('2026-11-11T08:00:00.000Z'),
    lastMessageAt: new Date('2026-11-11T08:00:00.000Z'),
    lastStudentReadAt: new Date('2026-11-11T08:00:00.000Z'),
    lastStaffReadAt: null,
    resolvedAt: null,
    closedAt: null,
    messages: [
      {
        id: 'message-1',
        ticketId: 'ticket-1',
        authorId: 'student-1',
        body: 'I paid yesterday and it still says pending.',
        isStaff: false,
        createdAt: new Date('2026-11-11T08:00:00.000Z'),
        attachments: [],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createTicket.mockResolvedValue(ticketRow);
    updateTicket.mockResolvedValue(ticketRow);
    updateManyTickets.mockResolvedValue({ count: 1 });
    findFirstTicket.mockResolvedValue(null);
    findUniqueTicket.mockResolvedValue(null);
    findManyTickets.mockResolvedValue([]);
    countTickets.mockResolvedValue(0);
    createMessage.mockResolvedValue({
      id: 'message-2',
      createdAt: new Date('2026-11-11T09:00:00.000Z'),
      attachments: [],
    });
    findManyUsers.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
    findFirstUser.mockResolvedValue({ id: 'admin-1' });
    findManyPayments.mockResolvedValue([]);
    findFirstPayment.mockResolvedValue(null);
    findUniqueAttachment.mockResolvedValue(null);
    findManyAttachments.mockResolvedValue([]);
    deleteAttachments.mockResolvedValue({ count: 0 });
    createAudit.mockResolvedValue({ id: 'audit-1' });
    notifyUsers.mockResolvedValue(2);
    sendSupportTicketCreated.mockResolvedValue(undefined);
    sendSupportReply.mockResolvedValue(undefined);
  });

  describe('create', () => {
    it('files the ticket under the signed-in user with the first message attached', async () => {
      await service.create(student, {
        subject: '  Payment not showing  ',
        category: 'PAYMENT',
        body: '  I paid yesterday and it still says pending.  ',
        reference: '  FT260311ABC  ',
      });

      expect(createTicket).toHaveBeenCalledWith({
        data: {
          userId: 'student-1',
          subject: 'Payment not showing',
          category: 'PAYMENT',
          reference: 'FT260311ABC',
          paymentId: null,
          lastStudentReadAt: expect.any(Date),
          messages: {
            create: {
              authorId: 'student-1',
              body: 'I paid yesterday and it still says pending.',
              isStaff: false,
            },
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: expect.anything(),
          },
        },
      });
    });

    it('notifies every active admin and emails the support mailbox', async () => {
      await service.create(student, {
        subject: 'Payment not showing',
        body: 'I paid yesterday and it still says pending.',
      });

      expect(findManyUsers).toHaveBeenCalledWith({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
        select: { id: true },
      });
      expect(notifyUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['admin-1', 'admin-2'],
          title: 'New support ticket: Payment not showing',
          type: 'SUPPORT_TICKET',
        }),
      );
      expect(lastNotification().meta.href).toBe('/admin/support/ticket-1');
      // The staff email carries the minimum: number, category, subject.
      expect(sendSupportTicketCreated).toHaveBeenCalledWith({
        subject: 'Payment not showing',
        category: 'PAYMENT',
        ticketId: 'ticket-1',
        ticketNumber: 'T-000001',
      });
    });

    it('keeps the ticket even when the support email cannot be sent', async () => {
      sendSupportTicketCreated.mockRejectedValue(new Error('SMTP down'));

      await expect(
        service.create(student, {
          subject: 'Payment not showing',
          body: 'I paid yesterday and it still says pending.',
        }),
      ).resolves.toMatchObject({ id: 'ticket-1' });
    });

    it('rejects a body that is only whitespace', async () => {
      await expect(
        service.create(student, {
          subject: 'Payment not showing',
          body: '          ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(createTicket).not.toHaveBeenCalled();
    });

    it(`refuses a fourth open ticket (${MAX_OPEN_TICKETS} open is the cap)`, async () => {
      countTickets
        .mockResolvedValueOnce(MAX_OPEN_TICKETS)
        .mockResolvedValueOnce(0);

      const attempt = service.create(student, {
        subject: 'Another problem',
        body: 'This is a long enough body.',
      });

      await expect(attempt).rejects.toBeInstanceOf(HttpException);
      await expect(attempt).rejects.toMatchObject({ status: 429 });
      expect(createTicket).not.toHaveBeenCalled();
    });

    it(`refuses more than ${MAX_TICKETS_PER_DAY} tickets in a day`, async () => {
      countTickets
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(MAX_TICKETS_PER_DAY);

      await expect(
        service.create(student, {
          subject: 'Another problem',
          body: 'This is a long enough body.',
        }),
      ).rejects.toMatchObject({ status: 429 });
      expect(createTicket).not.toHaveBeenCalled();
    });

    it("accepts one of the caller's own payments", async () => {
      findFirstPayment.mockResolvedValue({ id: 'pay-1' });

      await service.create(student, {
        subject: 'Payment not showing',
        body: 'I paid yesterday and it still says pending.',
        paymentId: 'pay-1',
      });

      expect(findFirstPayment).toHaveBeenCalledWith({
        where: { id: 'pay-1', userId: 'student-1' },
        select: { id: true },
      });
      expect(createTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentId: 'pay-1' }),
        }),
      );
    });

    it('refuses a payment that belongs to someone else', async () => {
      findFirstPayment.mockResolvedValue(null);

      await expect(
        service.create(student, {
          subject: 'Payment not showing',
          body: 'I paid yesterday and it still says pending.',
          paymentId: 'pay-of-someone-else',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createTicket).not.toHaveBeenCalled();
    });

    it('returns the display number and never a staff-only field', async () => {
      const view = await service.create(student, {
        subject: 'Payment not showing',
        body: 'I paid yesterday and it still says pending.',
      });

      expect(view.ticketNumber).toBe('T-000001');
      expect(view).not.toHaveProperty('assignedToId');
      expect(view).not.toHaveProperty('lastStaffReadAt');
      expect(view).not.toHaveProperty('internalNotes');
    });
  });

  describe('student reads', () => {
    it('scopes the list to the signed-in user and applies the status filter', async () => {
      await service.findMine('student-1', { status: 'OPEN' });

      expect(findManyTickets).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'student-1', status: 'OPEN' },
        }),
      );
      expect(cumulativeWhere()).toEqual({
        userId: 'student-1',
        status: 'OPEN',
      });
    });

    it("never returns another student's ticket", async () => {
      findFirstTicket.mockResolvedValue(null);

      await expect(
        service.findOne('student-1', 'ticket-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findFirstTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-9', userId: 'student-1' },
        }),
      );
    });

    it('flags a ticket unread when staff wrote after the student last read', async () => {
      findFirstTicket.mockResolvedValue({
        ...ticketRow,
        status: 'AWAITING_STUDENT',
        lastMessageAt: new Date('2026-11-12T09:00:00.000Z'),
        lastStudentReadAt: new Date('2026-11-11T08:00:00.000Z'),
        payment: null,
      });

      const view = await service.findOne('student-1', 'ticket-1');
      expect(view.unread).toBe(true);
      expect(view.canReply).toBe(true);
    });

    it('does not flag a ticket unread after the student read it', async () => {
      findFirstTicket.mockResolvedValue({
        ...ticketRow,
        status: 'AWAITING_STUDENT',
        lastMessageAt: new Date('2026-11-12T09:00:00.000Z'),
        lastStudentReadAt: new Date('2026-11-12T10:00:00.000Z'),
        payment: null,
      });

      const view = await service.findOne('student-1', 'ticket-1');
      expect(view.unread).toBe(false);
    });

    it('marks a thread read only for its owner', async () => {
      await service.markRead('student-1', 'ticket-1');
      expect(updateManyTickets).toHaveBeenCalledWith({
        where: { id: 'ticket-1', userId: 'student-1' },
        data: { lastStudentReadAt: expect.any(Date) },
      });

      updateManyTickets.mockResolvedValue({ count: 0 });
      await expect(
        service.markRead('student-1', 'ticket-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lists only the caller's own payments for the picker", async () => {
      await service.listOwnPayments('student-1');
      expect(findManyPayments).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'student-1' } }),
      );
    });
  });

  describe('student reply', () => {
    it('puts the ticket back in the queue and nudges the admins', async () => {
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        number: 1,
        subject: 'Payment not showing',
        status: 'AWAITING_STUDENT',
        resolvedAt: null,
      });

      await service.reply('student-1', 'ticket-1', {
        body: 'Any update?',
      });

      expect(createMessage).toHaveBeenCalledWith({
        data: {
          ticketId: 'ticket-1',
          authorId: 'student-1',
          body: 'Any update?',
          isStaff: false,
        },
        include: expect.anything(),
      });
      expect(updateTicket).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: {
          status: 'OPEN',
          lastMessageAt: new Date('2026-11-11T09:00:00.000Z'),
          lastStudentReadAt: new Date('2026-11-11T09:00:00.000Z'),
        },
      });
      expect(notifyUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New support ticket: Payment not showing',
        }),
      );
    });

    it('does not re-notify on a ticket that is already OPEN', async () => {
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        number: 1,
        subject: 'Payment not showing',
        status: 'OPEN',
        resolvedAt: null,
      });

      await service.reply('student-1', 'ticket-1', { body: 'More detail.' });

      expect(notifyUsers).not.toHaveBeenCalled();
    });

    it('reopens a ticket resolved within the window', async () => {
      const resolvedAt = new Date(Date.now() - 2 * 86_400_000);
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        number: 1,
        subject: 'Payment not showing',
        status: 'RESOLVED',
        resolvedAt,
      });

      await service.reply('student-1', 'ticket-1', { body: 'It came back.' });

      expect(updateTicket).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: {
          status: 'OPEN',
          lastMessageAt: new Date('2026-11-11T09:00:00.000Z'),
          lastStudentReadAt: new Date('2026-11-11T09:00:00.000Z'),
          resolvedAt: null,
        },
      });
    });

    it('refuses a reply once the ticket has been resolved for too long', async () => {
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        number: 1,
        subject: 'Payment not showing',
        status: 'RESOLVED',
        resolvedAt: new Date(
          Date.now() - (RESOLVE_REOPEN_WINDOW_DAYS + 1) * 86_400_000,
        ),
      });

      await expect(
        service.reply('student-1', 'ticket-1', { body: 'Hello?' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(createMessage).not.toHaveBeenCalled();
    });

    it('refuses to reply to a ticket the student closed', async () => {
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        number: 1,
        subject: 'Payment not showing',
        status: 'CLOSED',
        resolvedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await expect(
        service.reply('student-1', 'ticket-1', { body: 'Hello?' }),
      ).rejects.toBeInstanceOf(ConflictException);
      // The refusal quotes the old ticket number so a new ticket can link back.
      await expect(
        service.reply('student-1', 'ticket-1', { body: 'Hello?' }),
      ).rejects.toThrow('T-000001');
      expect(createMessage).not.toHaveBeenCalled();
    });
  });

  describe('resolve (replaces the old student close)', () => {
    it("resolves only the caller's ticket", async () => {
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        status: 'OPEN',
        resolvedAt: null,
      });

      await expect(service.resolve('student-1', 'ticket-1')).resolves.toEqual({
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
      });
      expect(findFirstTicket).toHaveBeenCalledWith({
        where: { id: 'ticket-1', userId: 'student-1' },
        select: { id: true, status: true, resolvedAt: true },
      });
      expect(updateTicket).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: {
          status: 'RESOLVED',
          resolvedAt: expect.any(Date),
          lastStudentReadAt: expect.any(Date),
        },
      });
    });

    it('reports a missing or foreign ticket as not found', async () => {
      findFirstTicket.mockResolvedValue(null);

      await expect(
        service.resolve('student-1', 'ticket-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to resolve a ticket that is already closed', async () => {
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        status: 'CLOSED',
        resolvedAt: null,
      });

      await expect(
        service.resolve('student-1', 'ticket-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('admin inbox', () => {
    it('searches subject, reference, student name and student email', async () => {
      await service.findAllAdmin({ search: 'Jane' }, 'admin-1');

      expect(findManyTickets).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { subject: { contains: 'Jane', mode: 'insensitive' } },
              { reference: { contains: 'Jane', mode: 'insensitive' } },
              { user: { fullName: { contains: 'Jane', mode: 'insensitive' } } },
              { user: { email: { contains: 'Jane', mode: 'insensitive' } } },
            ],
          },
        }),
      );
    });

    it('also finds a ticket by its display number', async () => {
      await service.findAllAdmin({ search: 'T-000123' }, 'admin-1');

      const where = (
        findManyTickets.mock.calls[0] as [{ where: { OR: unknown[] } }]
      )[0].where;
      expect(where.OR).toContainEqual({ number: 123 });
    });

    it('filters by assignee: me / unassigned / a specific admin', async () => {
      await service.findAllAdmin({ assignedTo: 'me' }, 'admin-1');
      expect(cumulativeWhere()).toMatchObject({ assignedToId: 'admin-1' });

      await service.findAllAdmin({ assignedTo: 'unassigned' }, 'admin-1');
      expect(cumulativeWhere()).toMatchObject({ assignedToId: null });

      await service.findAllAdmin({ assignedTo: 'admin-2' }, 'admin-1');
      expect(cumulativeWhere()).toMatchObject({ assignedToId: 'admin-2' });
    });

    it('clamps the page size into 1..100', async () => {
      await service.findAllAdmin({ take: 5000 }, 'admin-1');
      expect(findManyTickets).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 100 }),
      );

      await service.findAllAdmin({ take: 0 }, 'admin-1');
      expect(findManyTickets).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 1 }),
      );

      await service.findAllAdmin({}, 'admin-1');
      expect(findManyTickets).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 25 }),
      );
    });

    it('marks the ticket as awaiting the student and tells them', async () => {
      findUniqueTicket.mockResolvedValue({
        id: 'ticket-1',
        number: 1,
        subject: 'Payment not showing',
        status: 'OPEN',
        userId: 'student-1',
        user: {
          email: 'student@example.com',
          fullName: 'Student One',
        },
      });

      await service.replyAsStaff(admin, 'ticket-1', {
        body: 'We found the payment; it is approved now.',
      });

      expect(createMessage).toHaveBeenCalledWith({
        data: {
          ticketId: 'ticket-1',
          authorId: 'admin-1',
          body: 'We found the payment; it is approved now.',
          isStaff: true,
        },
        include: expect.anything(),
      });
      expect(updateTicket).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: {
          status: 'AWAITING_STUDENT',
          lastMessageAt: new Date('2026-11-11T09:00:00.000Z'),
          lastStaffReadAt: new Date('2026-11-11T09:00:00.000Z'),
          resolvedAt: null,
        },
      });
      expect(notifyUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['student-1'],
          type: 'SUPPORT_REPLY',
          title: 'Support replied: Payment not showing',
        }),
      );
      expect(lastNotification().meta.href).toBe('/support/tickets/ticket-1');
      expect(sendSupportReply).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'student@example.com',
          fullName: 'Student One',
          ticketId: 'ticket-1',
          ticketNumber: 'T-000001',
        }),
      );
    });

    it('refuses to answer a closed ticket until it is reopened', async () => {
      findUniqueTicket.mockResolvedValue({
        id: 'ticket-1',
        number: 1,
        subject: 'Payment not showing',
        status: 'CLOSED',
        userId: 'student-1',
        user: { email: 'student@example.com', fullName: 'Student One' },
      });

      await expect(
        service.replyAsStaff(admin, 'ticket-1', { body: 'Hello?' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(createMessage).not.toHaveBeenCalled();
    });

    it('updates the status of an existing ticket', async () => {
      findUniqueTicket.mockResolvedValue({ id: 'ticket-1', status: 'OPEN' });

      await service.updateStatus('ticket-1', 'RESOLVED');

      expect(updateTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-1' },
          data: { status: 'RESOLVED', resolvedAt: expect.any(Date) },
        }),
      );
    });

    it('stamps closedAt when staff close a ticket', async () => {
      findUniqueTicket.mockResolvedValue({
        id: 'ticket-1',
        status: 'RESOLVED',
      });

      await service.updateStatus('ticket-1', 'CLOSED');

      expect(updateTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'CLOSED', closedAt: expect.any(Date) },
        }),
      );
    });

    it('reports an unknown ticket as not found', async () => {
      await expect(
        service.updateStatus('ticket-9', 'RESOLVED'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('assigns only to an active administrator', async () => {
      findUniqueTicket.mockResolvedValue({ id: 'ticket-1' });
      await service.assign('ticket-1', 'admin-1');
      expect(updateTicket).toHaveBeenCalledWith(
        expect.objectContaining({ data: { assignedToId: 'admin-1' } }),
      );

      findFirstUser.mockResolvedValue(null);
      await expect(
        service.assign('ticket-1', 'student-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps internal notes in their own table and never emails them', async () => {
      findUniqueTicket.mockResolvedValue({ id: 'ticket-1' });
      createNote.mockResolvedValue({ id: 'note-1' });

      await service.addInternalNote(admin, 'ticket-1', 'Student called.');

      expect(createNote).toHaveBeenCalledWith({
        data: {
          ticketId: 'ticket-1',
          authorId: 'admin-1',
          body: 'Student called.',
        },
        include: expect.anything(),
      });
      expect(createMessage).not.toHaveBeenCalled();
      expect(sendSupportReply).not.toHaveBeenCalled();
      expect(notifyUsers).not.toHaveBeenCalled();
    });

    it('bulk-closes resolved tickets older than the cutoff', async () => {
      findManyTickets.mockResolvedValue([{ id: 'ticket-1', number: 1 }]);

      const result = await service.closeStaleResolved();

      expect(findManyTickets).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'RESOLVED' }),
        }),
      );
      expect(updateManyTickets).toHaveBeenCalledWith({
        where: { id: { in: ['ticket-1'] } },
        data: { status: 'CLOSED', closedAt: expect.any(Date) },
      });
      expect(result.closed).toBe(1);
    });

    it('serves canned replies to staff only through the service', () => {
      const replies = service.cannedReplies();
      expect(replies.length).toBeGreaterThanOrEqual(12);
      expect(
        replies.every((reply) => reply.id && reply.title && reply.body),
      ).toBe(true);
    });
  });

  describe('attachments', () => {
    it("refuses an attachment on someone else's ticket as not found", async () => {
      findUniqueAttachment.mockResolvedValue({
        id: 'att-1',
        storedName: 'abc.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        message: { ticket: { id: 'ticket-2', userId: 'student-2', number: 2 } },
      });

      await expect(
        attachments.openForDownload({
          attachmentId: 'att-1',
          userId: 'student-1',
          isStaff: false,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(createAudit).not.toHaveBeenCalled();
    });

    it('writes an audit row for every staff view', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.spyOn needs the mutable CommonJS exports, not the ESM namespace.
      const fs = require('fs') as typeof import('fs');
      const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      findUniqueAttachment.mockResolvedValue({
        id: 'att-1',
        storedName: 'abc.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        message: { ticket: { id: 'ticket-1', userId: 'student-1', number: 1 } },
      });

      try {
        await attachments.openForDownload({
          attachmentId: 'att-1',
          userId: 'admin-1',
          isStaff: true,
          ipAddress: '127.0.0.1',
        });
      } finally {
        exists.mockRestore();
      }

      expect(createAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPPORT_ATTACHMENT_VIEW',
          actorId: 'admin-1',
          entityType: 'SupportAttachment',
          entityId: 'att-1',
        }),
      );
    });

    it('rejects a file whose bytes are not an allowed image', async () => {
      await expect(
        attachments.storeAll([
          {
            buffer: Buffer.from('not an image at all'),
            mimetype: 'image/jpeg',
            size: 18,
          },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects more than three files in one message', async () => {
      const file = {
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        mimetype: 'image/jpeg',
        size: 4,
      };
      await expect(
        attachments.storeAll([file, file, file, file]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('dry-runs retention without deleting anything', async () => {
      findManyAttachments.mockResolvedValue([
        {
          id: 'att-1',
          storedName: 'abc.jpg',
          message: { ticket: { id: 'ticket-1', number: 1 } },
        },
      ]);

      const result = await attachments.purgeClosedBefore(new Date(), {
        dryRun: true,
      });

      expect(result).toMatchObject({ tickets: 1, attachments: 1, files: 0 });
      expect(deleteAttachments).not.toHaveBeenCalled();
    });
  });

  /** The `where` passed to the most recent list query. */
  function cumulativeWhere(): unknown {
    const calls = findManyTickets.mock.calls as Array<[{ where?: unknown }]>;
    return calls[calls.length - 1]?.[0]?.where;
  }

  /** The payload of the most recent `notifyUsers` call. */
  function lastNotification(): {
    meta: { href?: string };
  } {
    const calls = notifyUsers.mock.calls as Array<
      [{ meta: { href?: string } }]
    >;
    const last = calls[calls.length - 1];
    if (!last) throw new Error('notifyUsers was not called');
    return last[0];
  }
});
