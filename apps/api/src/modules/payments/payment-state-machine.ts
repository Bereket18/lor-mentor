import { Injectable } from '@nestjs/common';
import type { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface TransitionOptions {
  /** Allowed current statuses. The update only fires when the row is in one of them. */
  from: PaymentStatus[];
  to: PaymentStatus;
  /** Event type; defaults to `STATUS_<to>`. */
  type?: string;
  actorId?: string | null;
  reason?: string | null;
  meta?: Prisma.InputJsonValue;
  /** Extra columns to stamp on the payment row (reviewedAt, receiptNumber, …). */
  data?: Prisma.PaymentUpdateInput;
}

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Single source of truth for payment status writes. Every transition is a
 * guarded UPDATE (WHERE id AND status IN (from…)) plus an immutable
 * PaymentEvent row, both in the caller's transaction — so a lost race matches
 * 0 rows, writes no event, and can never overwrite a newer status.
 */
@Injectable()
export class PaymentStateMachine {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt a transition inside an existing transaction.
   * Returns true when this caller performed the transition, false when the
   * row was already in another status (lost race).
   */
  async transition(
    tx: Db,
    paymentId: string,
    opts: TransitionOptions,
  ): Promise<boolean> {
    const claim = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: opts.from } },
      data: { status: opts.to, ...opts.data },
    });
    if (claim.count === 0) return false;
    await tx.paymentEvent.create({
      data: {
        paymentId,
        type: opts.type ?? `STATUS_${opts.to}`,
        fromStatus: opts.from.length === 1 ? opts.from[0] : null,
        toStatus: opts.to,
        actorId: opts.actorId ?? null,
        reason: opts.reason ?? null,
        meta: opts.meta ?? undefined,
      },
    });
    return true;
  }

  /**
   * Record an event without changing status (e.g. a Chapa verify mismatch
   * that keeps the payment PENDING). Pass a tx to make it atomic with other
   * writes; omit it for a standalone insert.
   */
  async recordEvent(
    db: Db,
    paymentId: string,
    type: string,
    opts: {
      actorId?: string | null;
      reason?: string | null;
      fromStatus?: string | null;
      toStatus?: string | null;
      meta?: Prisma.InputJsonValue;
    } = {},
  ): Promise<void> {
    await db.paymentEvent.create({
      data: {
        paymentId,
        type,
        fromStatus: opts.fromStatus ?? null,
        toStatus: opts.toStatus ?? null,
        actorId: opts.actorId ?? null,
        reason: opts.reason ?? null,
        meta: opts.meta ?? undefined,
      },
    });
  }
}
