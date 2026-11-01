import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an in-app notification for several users at once.
   *
   * Duplicate unread notices with the same title are skipped so repeated saves
   * of one structure do not flood every teacher. Once a notice is read, a new
   * edit can produce a fresh one.
   */
  async notifyUsers(input: {
    userIds: string[];
    title: string;
    message: string;
    type?: NotificationType;
    meta?: Prisma.InputJsonValue;
  }): Promise<number> {
    const userIds = [...new Set(input.userIds.filter(Boolean))];
    if (userIds.length === 0) return 0;

    const type = input.type ?? NotificationType.NEW_CONTENT;
    const existing = await this.prisma.notification.findMany({
      where: {
        userId: { in: userIds },
        type,
        title: input.title,
        isRead: false,
      },
      select: { userId: true },
    });
    const alreadyNotified = new Set(existing.map((row) => row.userId));
    const data = userIds
      .filter((userId) => !alreadyNotified.has(userId))
      .map((userId) => ({
        userId,
        type,
        title: input.title,
        message: input.message,
        meta: input.meta,
      }));

    if (data.length === 0) return 0;

    const result = await this.prisma.notification.createMany({ data });
    return result.count;
  }

  /** A user's most recent notifications (newest first, capped). */
  findMine(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        isRead: true,
        meta: true,
        createdAt: true,
      },
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  /** Mark one notification read — scoped to the owner. */
  async markRead(userId: string, id: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return { updated: res.count };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: res.count };
  }
}
