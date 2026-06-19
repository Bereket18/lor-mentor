import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            durationMonths: true,
            priceETB: true,
          },
        },
      },
    });

    if (!subscription) {
      return { subscription: null, isActive: false };
    }

    const isActive =
      subscription.status === 'ACTIVE' &&
      (!subscription.endDate || subscription.endDate > new Date());

    return { subscription, isActive };
  }

  async ensureActiveForStudent(userId: string, role: string) {
    if (['ADMIN', 'SUPER_ADMIN', 'TEACHER'].includes(role)) {
      return;
    }

    const { isActive } = await this.getForUser(userId);
    if (!isActive) {
      throw new ForbiddenException(
        'An active subscription is required to access materials',
      );
    }
  }
}
