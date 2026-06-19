import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PaymentsService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'receipts');

  constructor(private readonly prisma: PrismaService) {}

  findAllAdmin() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            priceETB: true,
            durationMonths: true,
          },
        },
      },
    });
  }

  async submit(userId: string, planId: string, file: Express.Multer.File) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found or inactive');
    }

    const pending = await this.prisma.payment.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (pending) {
      throw new BadRequestException(
        'You already have a payment awaiting review',
      );
    }

    if (!file) {
      throw new BadRequestException('Receipt image is required');
    }

    return this.prisma.payment.create({
      data: {
        userId,
        planId,
        receiptPath: file.filename,
      },
      include: {
        plan: { select: { name: true, priceETB: true } },
      },
    });
  }

  async approve(paymentId: string, adminId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { plan: true },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') {
      throw new BadRequestException('Payment has already been reviewed');
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + payment.plan.durationMonths);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { userId: payment.userId },
      });

      let subscriptionId: string;

      if (existing) {
        const updated = await tx.subscription.update({
          where: { id: existing.id },
          data: {
            planId: payment.planId,
            status: 'ACTIVE',
            startDate: now,
            endDate,
          },
        });
        subscriptionId = updated.id;
      } else {
        const created = await tx.subscription.create({
          data: {
            userId: payment.userId,
            planId: payment.planId,
            status: 'ACTIVE',
            startDate: now,
            endDate,
          },
        });
        subscriptionId = created.id;
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'APPROVED',
          subscriptionId,
          reviewedBy: adminId,
          reviewedAt: now,
        },
      });
    });

    return { message: 'Payment approved and subscription activated' };
  }

  async reject(paymentId: string, adminId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') {
      throw new BadRequestException('Payment has already been reviewed');
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason ?? 'Receipt could not be verified',
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    return { message: 'Payment rejected' };
  }

  async getReceiptPath(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    const fullPath = path.join(this.uploadDir, payment.receiptPath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Receipt file no longer exists');
    }

    const ext = path.extname(payment.receiptPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };

    return {
      fullPath,
      mimeType: mimeTypes[ext] ?? 'image/jpeg',
    };
  }
}
