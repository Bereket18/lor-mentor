import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import type { RequestUser } from '../../common/types/request-user';
import { CreateTicketDto, ReplyTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto, type SupportStatus } from './dto/list-tickets.dto';
import { AdminListTicketsDto } from './dto/admin-list-tickets.dto';

/** Newest first, capped: the inbox is a work queue, not an archive. */
const ADMIN_PAGE_SIZE = 25;
const STUDENT_PAGE_SIZE = 20;

/** One line, short enough for a bell dropdown or an email subject. */
function excerpt(value: string, max = 300): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function pageWindow(query: { take?: number; skip?: number }): {
  take: number;
  skip: number;
} {
  const take = Math.min(Math.max(query.take ?? ADMIN_PAGE_SIZE, 1), 100);
  const skip = Math.max(query.skip ?? 0, 0);
  return { take, skip };
}

const TICKET_SUMMARY = {
  id: true,
  subject: true,
  category: true,
  status: true,
  reference: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketSelect;

const MESSAGE_AUTHOR = {
  select: { id: true, fullName: true, role: true },
} satisfies Prisma.SupportMessageInclude['author'];

/**
 * In-app support tickets.
 *
 * The college answers from the admin inbox; the student's own list is scoped
 * by `userId` from the JWT, never by a query parameter. Staff replies are
 * ordinary SupportMessage rows with `isStaff = true`, so a thread is one
 * ordered list rather than two interleaved tables.
 *
 * Email and in-app notifications are best-effort by design: a mail outage must
 * not lose the ticket the student just wrote, so failures are logged and the
 * ticket is still saved.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  // ── Student ────────────────────────────────────────────────────────

  async create(user: RequestUser, dto: CreateTicketDto) {
    const subject = dto.subject.trim();
    const body = this.cleanBody(dto.body, 10, 'Describe the problem');

    const ticket = await this.prisma.$transaction(async (tx) => {
      return tx.supportTicket.create({
        data: {
          userId: user.id,
          subject,
          category: dto.category ?? 'OTHER',
          reference: dto.reference?.trim() || null,
          messages: {
            create: { authorId: user.id, body, isStaff: false },
          },
        },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    await this.notifyAdminsOfNewTicket({
      ticketId: ticket.id,
      subject,
      category: ticket.category,
      body,
      studentName: user.fullName,
      studentEmail: user.email,
      reference: ticket.reference,
    });

    try {
      await this.mail.sendSupportTicketCreated({
        subject,
        category: ticket.category,
        body,
        studentName: user.fullName,
        studentEmail: user.email,
        reference: ticket.reference,
        ticketId: ticket.id,
      });
    } catch (error) {
      this.logger.error(
        `Could not email the support address about ticket ${ticket.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return ticket;
  }

  async findMine(userId: string, query: ListTicketsDto) {
    const take = STUDENT_PAGE_SIZE;
    const skip = 0;
    const where: Prisma.SupportTicketWhereInput = { userId };
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        select: TICKET_SUMMARY,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { items, total, take, skip, hasMore: skip + items.length < total };
  }

  async findOne(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: MESSAGE_AUTHOR },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  /**
   * A student reply always puts the ticket back in the staff queue.
   *
   * A CLOSED ticket is terminal for the student: the same problem coming back
   * is a new conversation, and silently reopening a ticket the student chose
   * to close would surprise both sides.
   */
  async reply(userId: string, ticketId: string, dto: ReplyTicketDto) {
    const body = this.cleanBody(dto.body, 1, 'Write a message');
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true, subject: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') {
      throw new ConflictException(
        'This ticket is closed. Open a new ticket if you still need help.',
      );
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: { ticketId, authorId: userId, body, isStaff: false },
      });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'OPEN', lastMessageAt: created.createdAt },
      });
      return created;
    });

    // Only nudge the college when the ball was in their court. A second
    // message on an already-OPEN ticket is part of the same unread thread.
    if (ticket.status !== 'OPEN') {
      await this.notifyAdminsOfNewTicket({
        ticketId,
        subject: ticket.subject,
        category: null,
        body,
        studentName: null,
        studentEmail: null,
        reference: null,
      });
    }

    return message;
  }

  /** Students may close their own ticket; they cannot reopen it themselves. */
  async close(userId: string, ticketId: string) {
    const result = await this.prisma.supportTicket.updateMany({
      where: { id: ticketId, userId },
      data: { status: 'CLOSED' },
    });
    if (result.count === 0) throw new NotFoundException('Ticket not found');
    return { status: 'CLOSED' as const };
  }

  // ── Admin inbox ────────────────────────────────────────────────────

  async findAllAdmin(query: AdminListTicketsDto) {
    const { take, skip } = pageWindow(query);
    const where: Prisma.SupportTicketWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        // Open work first, then the most recently active conversation.
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        select: {
          ...TICKET_SUMMARY,
          user: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { items, total, take, skip, hasMore: skip + items.length < total };
  }

  async findOneAdmin(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            phoneNumber: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: MESSAGE_AUTHOR },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async replyAsStaff(
    admin: RequestUser,
    ticketId: string,
    dto: ReplyTicketDto,
  ) {
    const body = this.cleanBody(dto.body, 1, 'Write a reply');
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        status: true,
        userId: true,
        user: { select: { email: true, fullName: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') {
      throw new ConflictException(
        'This ticket is closed. Set it to OPEN before replying.',
      );
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          ticketId,
          authorId: admin.id,
          body,
          isStaff: true,
        },
      });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'AWAITING_STUDENT', lastMessageAt: created.createdAt },
      });
      return created;
    });

    await this.notifyStudentOfReply({
      userId: ticket.userId,
      email: ticket.user.email,
      fullName: ticket.user.fullName,
      subject: ticket.subject,
      body,
      ticketId,
    });

    return message;
  }

  async updateStatus(ticketId: string, status: SupportStatus) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status },
      select: TICKET_SUMMARY,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private cleanBody(raw: string, min: number, label: string): string {
    const body = raw.trim();
    if (body.length < min) {
      throw new BadRequestException(
        `${label} in at least ${min} character${min === 1 ? '' : 's'}.`,
      );
    }
    return body;
  }

  /** In-app bell entry for every active admin. Never fails the request. */
  private async notifyAdminsOfNewTicket(input: {
    ticketId: string;
    subject: string;
    category: string | null;
    body: string;
    studentName: string | null;
    studentEmail: string | null;
    reference: string | null;
  }): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
        select: { id: true },
      });
      await this.notifications.notifyUsers({
        userIds: admins.map((row) => row.id),
        title: `New support ticket: ${input.subject}`,
        message: excerpt(
          input.studentName
            ? `${input.studentName}: ${input.body}`
            : input.body,
        ),
        type: 'SUPPORT_TICKET',
        meta: {
          href: `/admin/support?ticket=${input.ticketId}`,
          ticketId: input.ticketId,
          category: input.category ?? 'OTHER',
          ...(input.studentEmail ? { studentEmail: input.studentEmail } : {}),
          ...(input.reference ? { reference: input.reference } : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not notify admins about ticket ${input.ticketId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Bell entry plus an email to the student who is waiting. Best effort. */
  private async notifyStudentOfReply(input: {
    userId: string;
    email: string;
    fullName: string;
    subject: string;
    body: string;
    ticketId: string;
  }): Promise<void> {
    try {
      await this.notifications.notifyUsers({
        userIds: [input.userId],
        title: `Support replied: ${input.subject}`,
        message: excerpt(input.body),
        type: 'SUPPORT_REPLY',
        meta: {
          href: `/support?ticket=${input.ticketId}`,
          ticketId: input.ticketId,
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not notify student ${input.userId} about ticket ${input.ticketId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    try {
      await this.mail.sendSupportReply({
        to: input.email,
        fullName: input.fullName,
        subject: input.subject,
        body: input.body,
        ticketId: input.ticketId,
      });
    } catch (error) {
      this.logger.error(
        `Could not email student ${input.userId} about ticket ${input.ticketId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
