import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { MailService } from '../mail/mail.service';
import type { RequestUser } from '../../common/types/request-user';
import { SupportService } from './support.service';

/**
 * The service is exercised against a hand-written Prisma stand-in rather than
 * a database: these tests pin the *rules* (who can see what, what reopens a
 * ticket, which notification is sent), and the migration itself is proven
 * separately by applying it to a throwaway database.
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
    user: { findMany: findManyUsers },
    $transaction: jest.fn((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;

  const notifications = { notifyUsers } as unknown as NotificationsService;
  const mail = {
    sendSupportTicketCreated,
    sendSupportReply,
  } as unknown as MailService;

  const service = new SupportService(prisma, notifications, mail);

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
    subject: 'Payment not showing',
    category: 'PAYMENT',
    status: 'OPEN',
    reference: null,
    createdAt: new Date('2026-11-11T08:00:00.000Z'),
    updatedAt: new Date('2026-11-11T08:00:00.000Z'),
    lastMessageAt: new Date('2026-11-11T08:00:00.000Z'),
    messages: [
      {
        id: 'message-1',
        ticketId: 'ticket-1',
        authorId: 'student-1',
        body: 'I paid yesterday and it still says pending.',
        isStaff: false,
        createdAt: new Date('2026-11-11T08:00:00.000Z'),
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
    });
    findManyUsers.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
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
          messages: {
            create: {
              authorId: 'student-1',
              body: 'I paid yesterday and it still says pending.',
              isStaff: false,
            },
          },
        },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
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
      expect(lastNotification().meta.href).toBe(
        '/admin/support?ticket=ticket-1',
      );
      expect(sendSupportTicketCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          studentEmail: 'student@example.com',
          studentName: 'Student One',
          ticketId: 'ticket-1',
        }),
      );
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

    it('never returns another student’s ticket', async () => {
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
  });

  describe('student reply', () => {
    it('puts the ticket back in the queue and nudges the admins', async () => {
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        subject: 'Payment not showing',
        status: 'AWAITING_STUDENT',
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
      });
      expect(updateTicket).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: {
          status: 'OPEN',
          lastMessageAt: new Date('2026-11-11T09:00:00.000Z'),
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
        subject: 'Payment not showing',
        status: 'OPEN',
      });

      await service.reply('student-1', 'ticket-1', { body: 'More detail.' });

      expect(notifyUsers).not.toHaveBeenCalled();
    });

    it('refuses to reply to a ticket the student closed', async () => {
      findFirstTicket.mockResolvedValue({
        id: 'ticket-1',
        subject: 'Payment not showing',
        status: 'CLOSED',
      });

      await expect(
        service.reply('student-1', 'ticket-1', { body: 'Hello?' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(createMessage).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('closes only the caller’s ticket', async () => {
      await expect(service.close('student-1', 'ticket-1')).resolves.toEqual({
        status: 'CLOSED',
      });
      expect(updateManyTickets).toHaveBeenCalledWith({
        where: { id: 'ticket-1', userId: 'student-1' },
        data: { status: 'CLOSED' },
      });
    });

    it('reports a missing or foreign ticket as not found', async () => {
      updateManyTickets.mockResolvedValue({ count: 0 });

      await expect(
        service.close('student-1', 'ticket-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('admin inbox', () => {
    it('searches subject, reference, student name and student email', async () => {
      await service.findAllAdmin({ search: 'Jane' });

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

    it('clamps the page size into 1..100', async () => {
      await service.findAllAdmin({ take: 5000 });
      expect(findManyTickets).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 100 }),
      );

      await service.findAllAdmin({ take: 0 });
      expect(findManyTickets).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 1 }),
      );

      await service.findAllAdmin({});
      expect(findManyTickets).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 25 }),
      );
    });

    it('marks the ticket as awaiting the student and tells them', async () => {
      findUniqueTicket.mockResolvedValue({
        id: 'ticket-1',
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
      });
      expect(updateTicket).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: {
          status: 'AWAITING_STUDENT',
          lastMessageAt: new Date('2026-11-11T09:00:00.000Z'),
        },
      });
      expect(notifyUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['student-1'],
          type: 'SUPPORT_REPLY',
          title: 'Support replied: Payment not showing',
        }),
      );
      expect(lastNotification().meta.href).toBe('/support?ticket=ticket-1');
      expect(sendSupportReply).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'student@example.com',
          fullName: 'Student One',
          ticketId: 'ticket-1',
        }),
      );
    });

    it('refuses to answer a closed ticket until it is reopened', async () => {
      findUniqueTicket.mockResolvedValue({
        id: 'ticket-1',
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
      findUniqueTicket.mockResolvedValue({ id: 'ticket-1' });

      await service.updateStatus('ticket-1', 'RESOLVED');

      expect(updateTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-1' },
          data: { status: 'RESOLVED' },
        }),
      );
    });

    it('reports an unknown ticket as not found', async () => {
      await expect(
        service.updateStatus('ticket-9', 'RESOLVED'),
      ).rejects.toBeInstanceOf(NotFoundException);
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
