import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptService } from './receipt.service';
import {
  ReceiptVerifierService,
  type NormalizedReceipt,
} from './receipt-verifier.service';
import type { VerifyReceiptDto } from './dto/verify-receipt.dto';
import { assertValidImageFile } from '../../common/utils/image-magic-bytes';
import { isCompanyAccount } from '../../common/utils/bank-account-match';
import { isPrivileged } from '../../common/constants/roles';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PaymentsService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'receipts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ReceiptService,
    private readonly config: ConfigService,
    private readonly verifier: ReceiptVerifierService,
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
   * BANK-TRANSFER flow: student submits a transaction reference (or receipt
   * URL). We fetch the receipt from the bank via the receipt-verifier service
   * and decide:
   *   - all checks pass  → create the Payment and auto-approve it (instant
   *                         subscription) via the shared finalizeApproval path.
   *   - anything unclear → create a PENDING payment for manual admin review,
   *                         with the reason recorded.
   *
   * The checks that gate auto-approval (see assertReceiptSatisfiesPlan):
   *   1. receiver account is one of OURS (COMPANY_BANK_ACCOUNTS)
   *   2. amount paid ≥ the plan price
   *   3. status is success, OR the bank exposes no status at all
   * BOA (no receiver account in its receipts) therefore always falls to review.
   */
  async verifyAndSubmit(userId: string, dto: VerifyReceiptDto) {
    if (!this.verifier.enabled) {
      throw new BadRequestException(
        'Automated bank verification is not available. Please upload your receipt image instead.',
      );
    }
    if (!dto.reference && !dto.url) {
      throw new BadRequestException(
        'Provide the transaction reference or the receipt URL',
      );
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found or inactive');
    }

    const pending = await this.prisma.payment.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (pending) {
      throw new BadRequestException('You already have a payment awaiting review');
    }

    await this.assertNoActiveSubscription(userId);

    // Cheap pre-check: reject an already-used reference before we scrape the
    // bank. (The DB @unique constraint is the real guard against races below.)
    const submittedRef = dto.reference?.trim();
    if (submittedRef) {
      await this.assertReferenceUnused(submittedRef);
    }

    const result = await this.verifier.extract({
      bank: dto.bank,
      reference: submittedRef,
      url: dto.url?.trim(),
      account: dto.account?.trim(),
    });

    // Verifier could not give us a trustworthy answer → manual review.
    if (!result.ok) {
      if (result.code === 'NOT_FOUND') {
        throw new BadRequestException(
          'No receipt was found for that reference. Please double-check it.',
        );
      }
      if (['BAD_INPUT', 'MISSING_ACCOUNT', 'URL_REQUIRED'].includes(result.code)) {
        throw new BadRequestException(result.message);
      }
      // BLOCKED / EXTRACT_FAILED / UNREACHABLE → fall back to admin queue.
      return this.createPendingForReview(userId, dto, plan, null, {
        reason: `Automated verification unavailable (${result.code}). Sent for manual review.`,
        bankReference: submittedRef,
      });
    }

    const receipt = result.receipt;
    const bankRef = receipt.reference ?? submittedRef ?? null;

    // Re-check uniqueness against the reference the BANK reports (it may differ
    // from what the student typed, e.g. normalized casing).
    if (bankRef) {
      await this.assertReferenceUnused(bankRef);
    }

    const failure = this.assertReceiptSatisfiesPlan(receipt, Number(plan.priceETB));
    if (failure) {
      // Extracted fine, but a check failed (wrong account, too little, etc.).
      // Route to admin with the extracted data attached so they can decide.
      return this.createPendingForReview(userId, dto, plan, receipt, {
        reason: failure,
        bankReference: bankRef,
      });
    }

    // All checks passed → create + auto-approve in the same idempotent path
    // used by admin approval and Chapa. Guard the unique reference against a
    // concurrent duplicate submission.
    let payment: { id: string };
    try {
      payment = await this.prisma.payment.create({
        data: {
          userId,
          planId: dto.planId,
          method: 'MANUAL',
          amount: plan.priceETB,
          bankName: dto.bank,
          bankReference: bankRef,
          verification: receipt as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new BadRequestException(
          'This receipt has already been submitted.',
        );
      }
      throw err;
    }

    const paidAt = this.parseReceiptDate(receipt.date);
    await this.finalizeApproval(payment.id, paidAt ? { paidAt } : {});

    return {
      status: 'APPROVED' as const,
      autoApproved: true,
      paymentId: payment.id,
      message: 'Payment verified and your subscription is now active.',
    };
  }

  /** Throws if a payment already carries this bank reference. */
  private async assertReferenceUnused(reference: string) {
    const existing = await this.prisma.payment.findUnique({
      where: { bankReference: reference },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('This receipt has already been submitted.');
    }
  }

  /**
   * Returns null when the receipt satisfies the plan (safe to auto-approve),
   * or a human-readable reason string when it does not.
   */
  private assertReceiptSatisfiesPlan(
    receipt: NormalizedReceipt,
    planPrice: number,
  ): string | null {
    if (!receipt.receiverAccount) {
      // e.g. BOA, whose receipts never expose the beneficiary account.
      return 'Receiver account not present on this receipt; needs manual review.';
    }
    if (!this.isCompanyAccount(receipt.receiverAccount)) {
      return 'Payment was not made to our account.';
    }
    if (receipt.amount == null) {
      return 'Could not read the paid amount from the receipt.';
    }
    if (receipt.amount + 0.01 < planPrice) {
      return `Amount paid (${receipt.amount} ETB) is less than the plan price (${planPrice} ETB).`;
    }
    // statusKnown === false (CBE/Dashen/Awash) is acceptable: a matching
    // account + amount is our success signal. Only fail on an explicit non-OK.
    if (receipt.statusKnown && receipt.statusOk === false) {
      return `Bank reports transaction status "${receipt.status}".`;
    }
    return null;
  }

  /** Does the receipt's receiver account match one of ours (masking-tolerant)? */
  private isCompanyAccount(receiverAccount: string): boolean {
    const accounts = (this.config.get<string>('COMPANY_BANK_ACCOUNTS') ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    return isCompanyAccount(accounts, receiverAccount);
  }

  /** Best-effort parse of a receipt date (ISO from the normalizer) → Date. */
  private parseReceiptDate(value: string | null): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'P2002'
    );
  }

  /** Create a PENDING bank-transfer payment for an admin to review. */
  private async createPendingForReview(
    userId: string,
    dto: VerifyReceiptDto,
    plan: { id: string; priceETB: Prisma.Decimal; name: string },
    receipt: NormalizedReceipt | null,
    opts: { reason: string; bankReference: string | null | undefined },
  ) {
    try {
      const payment = await this.prisma.payment.create({
        data: {
          userId,
          planId: plan.id,
          method: 'MANUAL',
          amount: plan.priceETB,
          bankName: dto.bank,
          bankReference: opts.bankReference ?? null,
          rejectionReason: null,
          verification: (receipt
            ? { ...receipt, reviewNote: opts.reason }
            : { reviewNote: opts.reason }) as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        status: 'PENDING' as const,
        autoApproved: false,
        needsReview: true,
        paymentId: payment.id,
        message: `${opts.reason} Our team will review it shortly.`,
      };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new BadRequestException(
          'This receipt has already been submitted.',
        );
      }
      throw err;
    }
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

    const result = await this.prisma.$transaction(async (tx) => {
      // Atomically CLAIM the PENDING → APPROVED transition. Under READ
      // COMMITTED a second concurrent caller (Chapa retries its webhook while
      // the browser callback also fires) blocks here, then matches 0 rows and
      // bails — so activation, the notification, the audit log and the PDF are
      // produced exactly once. This is the real idempotency guard; the early
      // status check above is just a fast path.
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          receiptNumber,
          chapaRef: opts.chapaRef ?? payment.chapaRef,
          paidAt: now,
          reviewedBy: opts.reviewedBy ?? null,
          reviewedAt: now,
        },
      });
      if (claim.count === 0) {
        // Lost the race — another transaction already approved this payment.
        return null;
      }

      const subscriptionId = await this.activateSubscription(
        tx,
        payment.userId,
        payment.planId,
        now,
        endDate,
      );

      await tx.payment.update({
        where: { id: paymentId },
        data: { subscriptionId },
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

    // Another concurrent caller won the race and already finalized everything.
    if (!result) {
      return { message: 'Payment already approved', alreadyApproved: true };
    }
    const { startDate } = result;

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

    // Defence in depth: receiptPath is a server-generated random filename, but
    // never build a path from a stored value without confirming it's a bare
    // basename — a poisoned row must not be able to traverse out of uploadDir.
    if (path.basename(payment.receiptPath) !== payment.receiptPath) {
      throw new NotFoundException('Receipt file no longer exists');
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
