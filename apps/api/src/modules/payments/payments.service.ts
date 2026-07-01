import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptService } from './receipt.service';
import { assertValidImageFile } from '../../common/utils/image-magic-bytes';
import { isPrivileged } from '../../common/constants/roles';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PaymentsService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'receipts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ReceiptService,
  ) {}

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

  /** A student's own payment history (newest first). */
  findMine(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        method: true,
        amount: true,
        currency: true,
        status: true,
        receiptNumber: true,
        rejectionReason: true,
        paidAt: true,
        createdAt: true,
        plan: { select: { name: true, priceETB: true, durationMonths: true } },
      },
    });
  }

  /** MANUAL flow: student uploads a bank-transfer receipt for admin review. */
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

    await this.assertNoActiveSubscription(userId);

    if (!file) {
      throw new BadRequestException('Receipt image is required');
    }

    // Verify the upload is genuinely an image (not just a spoofed MIME type).
    assertValidImageFile(file.path);

    return this.prisma.payment.create({
      data: {
        userId,
        planId,
        method: 'MANUAL',
        amount: plan.priceETB,
        receiptPath: file.filename,
      },
      include: {
        plan: { select: { name: true, priceETB: true } },
      },
    });
  }

  /**
   * Guard against paying twice: if the user already has an ACTIVE subscription
   * that hasn't expired, block a new payment. They can renew once it lapses.
   * Shared by the manual and Chapa entry points.
   */
  async assertNoActiveSubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { status: true, endDate: true },
    });
    if (sub?.status === 'ACTIVE' && sub.endDate && sub.endDate > new Date()) {
      throw new BadRequestException(
        'You already have an active subscription. You can renew once it expires.',
      );
    }
  }

  /** MANUAL flow: an admin approves a pending receipt. */
  async approve(paymentId: string, adminId: string) {
    return this.finalizeApproval(paymentId, { reviewedBy: adminId });
  }

  /**
   * Single source of truth for turning a PENDING payment into an ACTIVE
   * subscription. Used by both the manual admin approval and the Chapa webhook.
   *
   * Idempotent: if the payment is already APPROVED it returns the existing
   * record without re-activating anything (Chapa retries webhooks, and an admin
   * might double-click). The subscription activation + payment update happen in
   * one transaction; the PDF receipt and notification are produced afterwards.
   */
  async finalizeApproval(
    paymentId: string,
    opts: { reviewedBy?: string; chapaRef?: string; paidAt?: Date } = {},
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { plan: true, user: true },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'APPROVED') {
      return { message: 'Payment already approved', alreadyApproved: true };
    }
    if (payment.status === 'REJECTED') {
      throw new BadRequestException('Payment has already been rejected');
    }

    const now = opts.paidAt ?? new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + payment.plan.durationMonths);
    const receiptNumber = this.receipts.buildReceiptNumber(payment.id, now);

    const { startDate } = await this.prisma.$transaction(async (tx) => {
      const subscriptionId = await this.activateSubscription(
        tx,
        payment.userId,
        payment.planId,
        now,
        endDate,
      );

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'APPROVED',
          subscriptionId,
          receiptNumber,
          chapaRef: opts.chapaRef ?? payment.chapaRef,
          paidAt: now,
          reviewedBy: opts.reviewedBy ?? null,
          reviewedAt: now,
        },
      });

      await tx.notification.create({
        data: {
          userId: payment.userId,
          type: 'PAYMENT_APPROVED',
          title: 'Payment approved',
          message: `Your ${payment.plan.name} subscription is now active.`,
          meta: { paymentId, receiptNumber },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: opts.reviewedBy ?? payment.userId,
          action: 'PAYMENT_APPROVED',
          entityType: 'Payment',
          entityId: paymentId,
          meta: {
            method: payment.method,
            receiptNumber,
            auto: !opts.reviewedBy,
          },
        },
      });

      return { startDate: now };
    });

    // Generate the PDF outside the DB transaction — a slow/failed file write
    // must never roll back an activated subscription.
    await this.receipts.generate(paymentId, {
      receiptNumber,
      paidAt: now,
      method: payment.method,
      amount: Number(payment.amount ?? payment.plan.priceETB),
      currency: payment.currency,
      chapaRef: opts.chapaRef ?? payment.chapaRef,
      payer: {
        fullName: payment.user.fullName,
        email: payment.user.email,
        phoneNumber: payment.user.phoneNumber,
      },
      plan: {
        name: payment.plan.name,
        durationMonths: payment.plan.durationMonths,
      },
      subscription: { startDate, endDate },
    });

    return {
      message: 'Payment approved and subscription activated',
      receiptNumber,
    };
  }

  /** Upsert a user's subscription to ACTIVE within a transaction. */
  private async activateSubscription(
    tx: Prisma.TransactionClient,
    userId: string,
    planId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const existing = await tx.subscription.findUnique({ where: { userId } });
    if (existing) {
      const updated = await tx.subscription.update({
        where: { id: existing.id },
        data: { planId, status: 'ACTIVE', startDate, endDate },
      });
      return updated.id;
    }
    const created = await tx.subscription.create({
      data: { userId, planId, status: 'ACTIVE', startDate, endDate },
    });
    return created.id;
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

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PAYMENT_REJECTED',
        entityType: 'Payment',
        entityId: paymentId,
        meta: { reason: reason ?? null },
      },
    });

    return { message: 'Payment rejected' };
  }

  /** Path to a MANUAL upload (the student's bank receipt image). Admin only. */
  async getReceiptPath(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.receiptPath) {
      throw new NotFoundException('This payment has no uploaded receipt');
    }

    if (!payment.receiptPath) {
      throw new NotFoundException('No receipt file for this payment');
    }

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

  /**
   * Path to the generated PDF receipt for an APPROVED payment. The owner (the
   * student who paid) or any admin may download it.
   */
  async getReceiptDocumentPath(
    paymentId: string,
    requester: { id: string; role: string },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, userId: true, status: true },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    const isOwner = payment.userId === requester.id;
    if (!isOwner && !isPrivileged(requester.role)) {
      throw new ForbiddenException('You cannot access this receipt');
    }

    if (payment.status !== 'APPROVED') {
      throw new BadRequestException('Receipt is only available once approved');
    }

    return this.receipts.resolveExisting(paymentId);
  }
}
