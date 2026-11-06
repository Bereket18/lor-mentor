import type { Prisma } from '@prisma/client';
import { PaymentStateMachine } from './payment-state-machine';

describe('PaymentStateMachine', () => {
  const makeTx = (claimCount: number) => {
    const updateMany = jest.fn().mockResolvedValue({ count: claimCount });
    const eventCreate = jest.fn().mockResolvedValue({});
    const tx = {
      payment: { updateMany },
      paymentEvent: { create: eventCreate },
    } as unknown as Parameters<PaymentStateMachine['transition']>[0];
    return { tx, updateMany, eventCreate };
  };

  const prisma = {} as never;
  const sm = new PaymentStateMachine(prisma);

  it('performs a guarded update and writes the event in the same transaction when it wins', async () => {
    const { tx, updateMany, eventCreate } = makeTx(1);

    const won = await sm.transition(tx, 'pay-1', {
      from: ['PENDING'],
      to: 'APPROVED',
      type: 'PAYMENT_APPROVED',
      actorId: 'admin-1',
      reason: null,
      data: { receiptNumber: 'LM-2026-1' },
      meta: { auto: false } as Prisma.InputJsonValue,
    });

    expect(won).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: { in: ['PENDING'] } },
      data: { status: 'APPROVED', receiptNumber: 'LM-2026-1' },
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: 'pay-1',
        type: 'PAYMENT_APPROVED',
        fromStatus: 'PENDING',
        toStatus: 'APPROVED',
        actorId: 'admin-1',
        meta: { auto: false },
      }),
    });
  });

  it('returns false and writes no event when the row is in another status (lost race)', async () => {
    const { tx, updateMany, eventCreate } = makeTx(0);

    const won = await sm.transition(tx, 'pay-1', {
      from: ['PENDING'],
      to: 'APPROVED',
    });

    expect(won).toBe(false);
    expect(updateMany).toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('recordEvent inserts without a status change', async () => {
    const { tx, eventCreate } = makeTx(1);

    await sm.recordEvent(tx, 'pay-1', 'CHAPA_VERIFY_MISMATCH', {
      fromStatus: 'PENDING',
      toStatus: 'PENDING',
      meta: { fields: ['amount'] } as Prisma.InputJsonValue,
    });

    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: 'pay-1',
        type: 'CHAPA_VERIFY_MISMATCH',
        fromStatus: 'PENDING',
        toStatus: 'PENDING',
        meta: { fields: ['amount'] },
      }),
    });
  });
});
