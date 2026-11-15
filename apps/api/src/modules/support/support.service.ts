import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
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
import {
  OPEN_TICKET_STATUSES,
  MAX_OPEN_TICKETS,
  MAX_TICKETS_PER_DAY,
  RESOLVE_REOPEN_WINDOW_DAYS,
  RESOLVED_AUTO_CLOSE_DAYS,
  formatTicketNumber,
  parseTicketNumber,
} from './support.constants';
import { CANNED_REPLIES } from './canned-replies';
import type { StoredImage } from './support-attachments.service';

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

function daysBetween(now: Date, then: Date): number {
  return (now.getTime() - then.getTime()) / 86_400_000;
}

/** The one shape every list uses. */
const TICKET_SUMMARY = {
  id: true,
  number: true,
  subject: true,
  category: true,
  status: true,
  reference: true,
  paymentId: true,
  assignedToId: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  lastStudentReadAt: true,
  lastStaffReadAt: true,
  resolvedAt: true,
  closedAt: true,
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketSelect;

const MESSAGE_AUTHOR = {
  select: { id: true, fullName: true, role: true },
} satisfies Prisma.SupportMessageInclude['author'];

const MESSAGE_INCLUDE = {
  author: MESSAGE_AUTHOR,
  attachments: {
    select: {
      id: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.SupportMessageInclude;

/** Fields a student must never receive, stripped before the response. */
const STAFF_ONLY_FIELDS = [
  'assignedToId',
  'lastStaffReadAt',
  'internalNotes',
] as const;

const PAYMENT_SUMMARY = {
  select: {
    id: true,
    status: true,
    amount: true,
    currency: true,
    method: true,
    planName: true,
    receiptNumber: true,
    createdAt: true,
  },
} satisfies { select: Prisma.PaymentSelect };

/**
 * What a student may see about their own ticket. Written out instead of
 * reusing the Prisma row type so a column added later stays private until it
 * is deliberately added here.
 */
export interface StudentTicketView {
  id: string;
  number: number;
  ticketNumber: string;
  subject: string;
  category: string;
  status: string;
  reference: string | null;
  paymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  /** A staff message has arrived since the student last opened the thread. */
  unread: boolean;
  /** False once the thread is read-only (closed, or resolved > 14 days). */
  canReply: boolean;
  reopenUntil: Date | null;
  messages?: unknown[];
  payment?: unknown;
  _count?: unknown;
}

/**
 * In-app support tickets.
 *
 * The college answers from the admin inbox; the student's own list is scoped
 * by `userId` from the JWT, never by a query parameter. Staff replies are
 * ordinary SupportMessage rows with `isStaff = true`, so a thread is one
 * ordered list; staff-only notes live in SupportInternalNote and are only
 * queried by the admin endpoints.
 *
 * Lifecycle: OPEN → RESOLVED (student or staff) → CLOSED (staff, or the
 * 7-day bulk close). A reply on a RESOLVED ticket within 14 days reopens it;
 * after that, or once CLOSED, the thread is read-only and the student files a
 * new ticket that references the old number.
 *
 * Email and in-app notifications are best-effort by design: a mail outage must
 * not lose the ticket the student just wrote, so failures are logged and the
 * ticket is still saved. Attachments are never emailed.
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

  async create(user: RequestUser, dto: CreateTicketDto, files?: StoredImage[]) {
    const subject = dto.subject.trim();
    const body = this.cleanBody(dto.body, 10, 'Describe the problem');
    const payment = await this.requireOwnPayment(user.id, dto.paymentId);

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Limits are checked in one place, before anything is written, so a
    // rejected request never leaves a half-created ticket behind.
    const [openCount, todayCount] = await Promise.all([
      this.prisma.supportTicket.count({
        where: { userId: user.id, status: { in: [...OPEN_TICKET_STATUSES] } },
      }),
      this.prisma.supportTicket.count({
        where: { userId: user.id, createdAt: { gte: since } },
      }),
    ]);
    if (openCount >= MAX_OPEN_TICKETS) {
      throw new HttpException(
        `You already have ${MAX_OPEN_TICKETS} open tickets. Please reply on one of them, or wait for a reply before opening another.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (todayCount >= MAX_TICKETS_PER_DAY) {
      throw new HttpException(
        `You can open at most ${MAX_TICKETS_PER_DAY} tickets a day. Please continue on an existing ticket.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      return tx.supportTicket.create({
        data: {
          userId: user.id,
          subject,
          category: dto.category ?? 'OTHER',
          reference: dto.reference?.trim() || null,
          paymentId: payment?.id ?? null,
          // The student has obviously read their own first message.
          lastStudentReadAt: now,
          messages: {
            create: {
              authorId: user.id,
              body,
              isStaff: false,
              ...(files?.length ? { attachments: { create: files } } : {}),
            },
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: MESSAGE_INCLUDE,
          },
        },
      });
    });

    await this.notifyAdminsOfNewTicket({
      ticketId: ticket.id,
      ticketNumber: ticket.number,
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
        ticketId: ticket.id,
        ticketNumber: formatTicketNumber(ticket.number),
      });
    } catch (error) {
      this.logger.error(
        `Could not email the support address about ticket ${ticket.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return this.forStudent(ticket);
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

    return {
      // Same student-facing shape as the detail view, so the list carries the
      // unread flag and the reply window the UI needs, and never the
      // staff-only columns (assignee, staff read marker).
      items: items.map((item) => this.forStudent(item)),
      total,
      take,
      skip,
      hasMore: skip + items.length < total,
    };
  }

  async findOne(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      include: {
        payment: PAYMENT_SUMMARY,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: MESSAGE_INCLUDE,
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.forStudent(ticket);
  }

  /**
   * A student reply brings a ticket back into the queue, but only while the
   * conversation is still live:
   *
   *  - OPEN / AWAITING_STUDENT: normal reply, status becomes OPEN.
   *  - RESOLVED within 14 days: reopened (the same problem came back).
   *  - RESOLVED older than 14 days, or CLOSED: read-only. A new problem is a
   *    new ticket, which keeps each resolution with its own history.
   */
  async reply(
    userId: string,
    ticketId: string,
    dto: ReplyTicketDto,
    files?: StoredImage[],
  ) {
    const body = this.cleanBody(dto.body, 1, 'Write a message');
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        resolvedAt: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    this.assertReplyAllowed(ticket);

    const reopening = ticket.status === 'RESOLVED';

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          ticketId,
          authorId: userId,
          body,
          isStaff: false,
          ...(files?.length ? { attachments: { create: files } } : {}),
        },
        include: MESSAGE_INCLUDE,
      });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: 'OPEN',
          lastMessageAt: created.createdAt,
          lastStudentReadAt: created.createdAt,
          ...(reopening ? { resolvedAt: null } : {}),
        },
      });
      return created;
    });

    // Only nudge the college when the ball was in their court. A second
    // message on an already-OPEN ticket is part of the same unread thread.
    if (ticket.status !== 'OPEN') {
      await this.notifyAdminsOfNewTicket({
        ticketId,
        ticketNumber: ticket.number,
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

  /** "Mark as resolved": the student says their problem is handled. */
  async resolve(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true, status: true, resolvedAt: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.status === 'CLOSED') {
      throw new ConflictException(
        'This ticket is closed. Open a new ticket if you still need help.',
      );
    }
    if (ticket.status === 'RESOLVED') {
      return { status: 'RESOLVED' as const, resolvedAt: ticket.resolvedAt };
    }

    const now = new Date();
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED', resolvedAt: now, lastStudentReadAt: now },
    });
    return { status: 'RESOLVED' as const, resolvedAt: now };
  }

  /** Marks the thread read for whichever side is looking. */
  async markRead(userId: string, ticketId: string) {
    const now = new Date();
    const result = await this.prisma.supportTicket.updateMany({
      where: { id: ticketId, userId },
      data: { lastStudentReadAt: now },
    });
    if (result.count === 0) throw new NotFoundException('Ticket not found');
    return { lastStudentReadAt: now };
  }

  async markReadAsStaff(ticketId: string) {
    const now = new Date();
    const result = await this.prisma.supportTicket.updateMany({
      where: { id: ticketId },
      data: { lastStaffReadAt: now },
    });
    if (result.count === 0) throw new NotFoundException('Ticket not found');
    return { lastStaffReadAt: now };
  }

  /** The student's own payments, for the "related payment" picker. */
  async listOwnPayments(userId: string) {
    const items = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        method: true,
        planName: true,
        receiptNumber: true,
        txRef: true,
        bankReference: true,
        createdAt: true,
      },
    });
    return { items };
  }

  // ── Admin inbox ────────────────────────────────────────────────────

  async findAllAdmin(query: AdminListTicketsDto, viewerId: string) {
    const { take, skip } = pageWindow(query);
    const where: Prisma.SupportTicketWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.assignedTo === 'me') where.assignedToId = viewerId;
    else if (query.assignedTo === 'unassigned') where.assignedToId = null;
    else if (query.assignedTo) where.assignedToId = query.assignedTo;

    if (query.search?.trim()) {
      const search = query.search.trim();
      const number = parseTicketNumber(search);
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        ...(number ? [{ number }] : []),
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
          assignedTo: { select: { id: true, fullName: true } },
          payment: PAYMENT_SUMMARY,
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    const mapped = items.map((item) => ({
      ...this.withNumber(item),
      unread: this.staffUnread(item),
    }));
    const filtered = query.unreadOnly
      ? mapped.filter((item) => item.unread)
      : mapped;

    return {
      items: filtered,
      total: query.unreadOnly ? filtered.length : total,
      take,
      skip,
      hasMore: skip + items.length < total,
    };
  }

  async findOneAdmin(ticketId: string, options: { markRead?: boolean } = {}) {
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
            createdAt: true,
            isActive: true,
          },
        },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        payment: {
          select: {
            id: true,
            status: true,
            amount: true,
            currency: true,
            method: true,
            planName: true,
            receiptNumber: true,
            txRef: true,
            bankReference: true,
            rejectionReason: true,
            createdAt: true,
            paidAt: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: MESSAGE_INCLUDE,
        },
        internalNotes: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (options.markRead) {
      await this.prisma.supportTicket
        .update({
          where: { id: ticketId },
          data: { lastStaffReadAt: new Date() },
        })
        .catch(() => undefined);
    }

    return {
      ...this.withNumber(ticket),
      unread: false,
      canReply: ticket.status !== 'CLOSED',
      internalNotes: ticket.internalNotes ?? [],
    };
  }

  async replyAsStaff(
    admin: RequestUser,
    ticketId: string,
    dto: ReplyTicketDto,
    files?: StoredImage[],
  ) {
    const body = this.cleanBody(dto.body, 1, 'Write a reply');
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
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
          ...(files?.length ? { attachments: { create: files } } : {}),
        },
        include: MESSAGE_INCLUDE,
      });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: 'AWAITING_STUDENT',
          lastMessageAt: created.createdAt,
          lastStaffReadAt: created.createdAt,
          resolvedAt: null,
        },
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
      ticketNumber: ticket.number,
    });

    return message;
  }

  async updateStatus(ticketId: string, status: SupportStatus) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const now = new Date();
    const data: Prisma.SupportTicketUpdateInput = { status };
    if (status === 'RESOLVED') data.resolvedAt = now;
    if (status === 'CLOSED') {
      data.closedAt = now;
      if (!ticket || ticket.status !== 'RESOLVED') data.resolvedAt = now;
    }
    if (status === 'OPEN' || status === 'AWAITING_STUDENT') {
      data.resolvedAt = null;
      data.closedAt = null;
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data,
      select: TICKET_SUMMARY,
    });
    return this.withNumber(updated);
  }

  async assign(ticketId: string, assignedToId: string | null) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (assignedToId) {
      const staff = await this.prisma.user.findFirst({
        where: {
          id: assignedToId,
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          isActive: true,
        },
        select: { id: true },
      });
      if (!staff) {
        throw new BadRequestException(
          'Tickets can only be assigned to an active administrator.',
        );
      }
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedToId },
      select: TICKET_SUMMARY,
    });
    return this.withNumber(updated);
  }

  /** Staff-only note. Never returned to a student, never emailed. */
  async addInternalNote(admin: RequestUser, ticketId: string, rawBody: string) {
    const body = this.cleanBody(rawBody, 1, 'Write a note');
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    return this.prisma.supportInternalNote.create({
      data: { ticketId, authorId: admin.id, body },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  /** "Close resolved tickets older than N days" - one admin click. */
  async closeStaleResolved(olderThanDays = RESOLVED_AUTO_CLOSE_DAYS) {
    const cutoff = new Date(
      Date.now() - Math.max(olderThanDays, 1) * 24 * 60 * 60 * 1000,
    );
    const where: Prisma.SupportTicketWhereInput = {
      status: 'RESOLVED',
      // Pre-migration RESOLVED rows have no resolvedAt; fall back to activity.
      OR: [
        { resolvedAt: { lt: cutoff } },
        { resolvedAt: null, lastMessageAt: { lt: cutoff } },
      ],
    };

    const candidates = await this.prisma.supportTicket.findMany({
      where,
      select: { id: true, number: true },
      take: 500,
    });
    if (!candidates.length) return { closed: 0, numbers: [] as number[] };

    const result = await this.prisma.supportTicket.updateMany({
      where: { id: { in: candidates.map((row) => row.id) } },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    return {
      closed: result.count,
      numbers: candidates.map((row) => row.number),
    };
  }

  cannedReplies() {
    return CANNED_REPLIES;
  }

  /** Active admins, for the assign control. */
  async assignableStaff() {
    const items = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    return { items };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  /**
   * A reply is refused only when the conversation is genuinely over. The
   * 14-day window is measured from `resolvedAt`; a legacy RESOLVED row with no
   * timestamp is treated as still reopenable (the status change is recent
   * enough that the timestamp simply predates this column).
   */
  private assertReplyAllowed(ticket: {
    number: number;
    status: string;
    resolvedAt: Date | null;
  }): void {
    if (ticket.status === 'CLOSED') {
      throw new ConflictException(
        `This ticket is closed. Open a new ticket and quote ${formatTicketNumber(
          ticket.number,
        )} if you still need help.`,
      );
    }
    if (ticket.status === 'RESOLVED' && ticket.resolvedAt) {
      const age = daysBetween(new Date(), ticket.resolvedAt);
      if (age > RESOLVE_REOPEN_WINDOW_DAYS) {
        throw new ConflictException(
          `This ticket was resolved more than ${RESOLVE_REOPEN_WINDOW_DAYS} days ago and is read-only. Open a new ticket and quote ${formatTicketNumber(
            ticket.number,
          )} if you still need help.`,
        );
      }
    }
  }

  /** The student's payment, or 400. Never reports *whose* payment it is. */
  private async requireOwnPayment(userId: string, paymentId?: string) {
    if (!paymentId) return null;
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
      select: { id: true },
    });
    if (!payment) {
      throw new BadRequestException(
        'That payment was not found on your account.',
      );
    }
    return payment;
  }

  private cleanBody(raw: string, min: number, label: string): string {
    const body = raw.trim();
    if (body.length < min) {
      throw new BadRequestException(
        `${label} in at least ${min} character${min === 1 ? '' : 's'}.`,
      );
    }
    return body;
  }

  /** Every ticket leaving the API carries its display number. */
  private withNumber<T extends { number: number }>(ticket: T) {
    return { ...ticket, ticketNumber: formatTicketNumber(ticket.number) };
  }

  /**
   * Student responses never include staff-only columns. The shape is asserted
   * by the return type and staff-only keys are also deleted at runtime, so a
   * future column cannot be exposed by accident.
   */
  private forStudent<T extends Record<string, unknown>>(ticket: T) {
    const copy: Record<string, unknown> = { ...ticket };
    for (const field of STAFF_ONLY_FIELDS) delete copy[field];

    const resolvedAt = copy.resolvedAt as Date | null;
    const status = copy.status as string;
    const reopenUntil = resolvedAt
      ? new Date(resolvedAt.getTime() + RESOLVE_REOPEN_WINDOW_DAYS * 86_400_000)
      : null;

    const view: StudentTicketView = {
      id: copy.id as string,
      number: copy.number as number,
      ticketNumber: formatTicketNumber(copy.number as number),
      subject: copy.subject as string,
      category: copy.category as string,
      status,
      reference: (copy.reference as string | null) ?? null,
      paymentId: (copy.paymentId as string | null) ?? null,
      createdAt: copy.createdAt as Date,
      updatedAt: copy.updatedAt as Date,
      lastMessageAt: copy.lastMessageAt as Date,
      resolvedAt,
      closedAt: (copy.closedAt as Date | null) ?? null,
      unread: this.studentUnread({
        lastMessageAt: copy.lastMessageAt as Date,
        lastStudentReadAt:
          (copy.lastStudentReadAt as Date | null | undefined) ?? null,
        createdAt: copy.createdAt as Date,
      }),
      canReply:
        status !== 'CLOSED' &&
        !(
          status === 'RESOLVED' &&
          reopenUntil !== null &&
          reopenUntil.getTime() < Date.now()
        ),
      reopenUntil,
      messages: copy.messages as unknown[] | undefined,
      payment: copy.payment,
      _count: copy._count,
    };
    return view;
  }

  /** True when a student message is newer than the last staff read. */
  private staffUnread(ticket: {
    lastMessageAt: Date;
    lastStaffReadAt: Date | null;
    status: string;
  }): boolean {
    if (ticket.status === 'CLOSED') return false;
    if (!ticket.lastStaffReadAt) return true;
    return ticket.lastMessageAt > ticket.lastStaffReadAt;
  }

  /** True when a staff message is newer than the last student read. */
  private studentUnread(ticket: {
    lastMessageAt: Date;
    lastStudentReadAt: Date | null;
    createdAt: Date;
  }): boolean {
    // Legacy rows predate the read marker. Treat the creation as "read": only
    // a later message (which must be a staff reply, since the student's first
    // message is the creation) makes the ticket unread.
    if (!ticket.lastStudentReadAt) {
      return ticket.lastMessageAt > ticket.createdAt;
    }
    return ticket.lastMessageAt > ticket.lastStudentReadAt;
  }

  /** In-app bell entry for every active admin. Never fails the request. */
  private async notifyAdminsOfNewTicket(input: {
    ticketId: string;
    ticketNumber: number;
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
          href: `/admin/support/${input.ticketId}`,
          ticketId: input.ticketId,
          ticketNumber: formatTicketNumber(input.ticketNumber),
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
    ticketNumber: number;
  }): Promise<void> {
    try {
      await this.notifications.notifyUsers({
        userIds: [input.userId],
        title: `Support replied: ${input.subject}`,
        message: excerpt(input.body),
        type: 'SUPPORT_REPLY',
        meta: {
          href: `/support/tickets/${input.ticketId}`,
          ticketId: input.ticketId,
          ticketNumber: formatTicketNumber(input.ticketNumber),
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
        ticketNumber: formatTicketNumber(input.ticketNumber),
      });
    } catch (error) {
      this.logger.error(
        `Could not email student ${input.userId} about ticket ${input.ticketId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
