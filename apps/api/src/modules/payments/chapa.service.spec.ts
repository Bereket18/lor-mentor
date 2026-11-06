import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PaymentsService } from './payments.service';
import type { PaymentStateMachine } from './payment-state-machine';
import { ChapaService } from './chapa.service';

interface PaymentUpdateArgs {
  where: { id: string };
  data: {
    status: string;
    rejectionReason: string;
    chapaRef?: string;
    reviewedAt: Date;
  };
}

interface PaymentCreateArgs {
  data: {
    txRef: string;
  };
}

describe('ChapaService', () => {
  const webhookSecret = 'webhook-test-secret';
  const findUnique = jest.fn();
  const findPlan = jest.fn();
  const create = jest.fn<Promise<{ id: string }>, [PaymentCreateArgs]>();
  const update = jest.fn<unknown, [PaymentUpdateArgs]>();
  const updateMany = jest.fn();
  const assertNoActiveSubscription = jest.fn();
  const finalizeApproval = jest.fn();
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        CHAPA_SECRET_KEY: 'chapa-test-secret',
        CHAPA_WEBHOOK_SECRET: webhookSecret,
        CHAPA_BASE_URL: 'https://chapa.test/v1',
        API_PUBLIC_URL: 'https://api.lormentor.test',
        WEB_PUBLIC_URL: 'https://lormentor.test',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const transition = jest.fn<Promise<boolean>, [unknown, unknown, unknown]>();
  const recordEvent = jest.fn<Promise<void>, [unknown]>();
  const states = {
    transition,
    recordEvent,
  } as unknown as PaymentStateMachine;

  const tx = { payment: { updateMany } };
  const prisma = {
    subscriptionPlan: { findUnique: findPlan },
    payment: { findUnique, create, update, updateMany },
    $transaction: jest.fn((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;
  const payments = {
    assertNoActiveSubscription,
    finalizeApproval,
  } as unknown as PaymentsService;
  const service = new ChapaService(config, prisma, payments, states);

  function signPayload(body: Buffer): string {
    return crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
  }

  function signSecret(): string {
    return crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookSecret)
      .digest('hex');
  }

  beforeEach(() => {
    jest.useRealTimers();
    findUnique.mockReset();
    findPlan.mockReset();
    create.mockReset();
    update.mockReset();
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    transition.mockReset().mockResolvedValue(true);
    recordEvent.mockReset().mockResolvedValue(undefined);
    assertNoActiveSubscription.mockReset();
    finalizeApproval.mockReset();
    jest.restoreAllMocks();
  });

  it('creates a fresh Chapa transaction reference for every checkout attempt', async () => {
    findPlan.mockResolvedValue({
      id: 'plan-1',
      name: 'Semester',
      priceETB: '1000',
      durationMonths: 6,
      isActive: true,
    });
    create
      .mockResolvedValueOnce({ id: 'payment-1' })
      .mockResolvedValueOnce({ id: 'payment-2' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: { checkout_url: 'https://checkout.chapa.test' },
        }),
    } as Response);
    const user = {
      id: 'student-1',
      email: 'student@example.com',
      fullName: 'Test Student',
    };

    const first = await service.initialize(user, 'plan-1');
    const second = await service.initialize(user, 'plan-1');

    expect(first.txRef).toMatch(/^lm-[0-9a-f-]{36}$/);
    expect(second.txRef).toMatch(/^lm-[0-9a-f-]{36}$/);
    expect(second.txRef).not.toBe(first.txRef);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        userId: 'student-1',
        planId: 'plan-1',
        method: 'CHAPA',
        amount: '1000',
        currency: 'ETB',
        txRef: first.txRef,
        planName: 'Semester',
        planDurationMonths: 6,
      }),
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        txRef: second.txRef,
        planName: 'Semester',
        planDurationMonths: 6,
      }),
    });
  });

  it('sends the amount to Chapa as an exact 2-decimal string from the plan price', async () => {
    findPlan.mockResolvedValue({
      id: 'plan-1',
      name: 'Semester',
      priceETB: '1000.5',
      durationMonths: 6,
      isActive: true,
    });
    create.mockResolvedValue({ id: 'payment-1' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: { checkout_url: 'https://checkout.chapa.test' },
        }),
    } as Response);

    await service.initialize(
      { id: 'student-1', email: 's@example.com', fullName: 'Test Student' },
      'plan-1',
    );

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.amount).toBe('1000.50');
    expect(body.currency).toBe('ETB');
  });

  it('fails a second concurrent checkout cleanly (one PENDING per user)', async () => {
    findPlan.mockResolvedValue({
      id: 'plan-1',
      name: 'Semester',
      priceETB: '1000',
      durationMonths: 6,
      isActive: true,
    });
    create.mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: 'P2002' }),
    );
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      service.initialize(
        { id: 'student-1', email: 's@example.com', fullName: 'Test Student' },
        'plan-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects the local attempt when Chapa initialization fails', async () => {
    const reviewedAt = new Date('2026-07-26T09:00:00.000Z');
    jest.useFakeTimers().setSystemTime(reviewedAt);
    findPlan.mockResolvedValue({
      id: 'plan-1',
      name: 'Semester',
      priceETB: '1000',
      durationMonths: 6,
      isActive: true,
    });
    create.mockResolvedValue({ id: 'payment-1' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: () =>
        Promise.resolve({
          status: 'failed',
          message: 'Transaction reference has been used before',
        }),
    } as Response);

    await expect(
      service.initialize(
        {
          id: 'student-1',
          email: 'student@example.com',
          fullName: 'Test Student',
        },
        'plan-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    // routed through the state machine: guarded PENDING → REJECTED + event
    expect(transition).toHaveBeenCalledWith(
      tx,
      'payment-1',
      expect.objectContaining({
        from: ['PENDING'],
        to: 'REJECTED',
        type: 'CHAPA_INIT_FAILED',
        data: expect.objectContaining({
          rejectionReason:
            'Chapa initialization failed: Transaction reference has been used before',
          reviewedAt,
        }),
      }),
    );
  });

  it('rejects an invalid webhook signature before parsing the payload', async () => {
    const body = Buffer.from('{"tx_ref":"lm-payment-1"}');

    await expect(
      service.handleWebhook(body, {
        chapaSignature: 'invalid-signature',
        payloadSignature: 'also-invalid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each(['not-json', '[]', '42', '{"tx_ref":123}'])(
    'rejects malformed webhook input: %s',
    async (payload) => {
      const body = Buffer.from(payload);

      await expect(
        service.handleWebhook(body, { payloadSignature: signPayload(body) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('acknowledges a signed event with no transaction reference', async () => {
    const body = Buffer.from('{"status":"success"}');

    await expect(
      service.handleWebhook(body, { payloadSignature: signPayload(body) }),
    ).resolves.toEqual({ received: true });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('accepts a valid payload signature when chapa-signature is invalid', async () => {
    const body = Buffer.from('{"status":"success"}');

    await expect(
      service.handleWebhook(body, {
        chapaSignature: 'invalid-signature',
        payloadSignature: signPayload(body),
      }),
    ).resolves.toEqual({ received: true });
  });

  it('accepts Chapa signature generated from the webhook secret', async () => {
    const body = Buffer.from('{"status":"success"}');

    await expect(
      service.handleWebhook(body, { chapaSignature: signSecret() }),
    ).resolves.toEqual({ received: true });
  });

  it('rejects a callback reference outside the application namespace', async () => {
    await expect(
      service.handleCallback('external-reference'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  function mockVerifyResponse(data: Record<string, unknown> | null) {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data,
        }),
    } as Response);
  }

  function mockPendingPaymentThen(statusAfter: string) {
    findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'student-1',
        status: 'PENDING',
        receiptNumber: null,
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        status: 'PENDING',
        amount: '1000',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        status: statusAfter,
        receiptNumber: statusAfter === 'APPROVED' ? 'LM-0001' : null,
      });
  }

  it('does not approve a successful but underpaid transaction — stays PENDING as an admin exception', async () => {
    mockPendingPaymentThen('PENDING');
    mockVerifyResponse({
      status: 'success',
      amount: '900',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      reference: 'chapa-reference',
    });

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(finalizeApproval).not.toHaveBeenCalled();
    // mismatch surfaced on the row (admin queue shows CHAPA rows with chapaRef)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: 'PENDING' },
      data: expect.objectContaining({
        chapaRef: 'chapa-reference',
        verification: expect.objectContaining({
          decision: 'REVIEW',
          exception: true,
          mismatchFields: ['amount'],
        }),
      }),
    });
    // and as an immutable PaymentEvent (no secrets in meta)
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_VERIFY_MISMATCH',
      expect.objectContaining({
        meta: expect.objectContaining({
          fields: ['amount'],
          expected: '1000',
          reported: '900',
        }),
      }),
    );
  });

  it('does not approve an overpaid transaction either — exact amount required', async () => {
    mockPendingPaymentThen('PENDING');
    mockVerifyResponse({
      status: 'success',
      amount: '1100',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      reference: 'chapa-reference',
    });

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_VERIFY_MISMATCH',
      expect.objectContaining({
        meta: expect.objectContaining({ fields: ['amount'], reported: '1100' }),
      }),
    );
  });

  it('keeps PENDING on tx_ref mismatch', async () => {
    mockPendingPaymentThen('PENDING');
    mockVerifyResponse({
      status: 'success',
      amount: '1000',
      currency: 'ETB',
      tx_ref: 'lm-someone-else',
    });

    await service.verifyByTxRef('lm-payment-1', 'student-1');

    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_VERIFY_MISMATCH',
      expect.objectContaining({
        meta: expect.objectContaining({ fields: ['tx_ref'] }),
      }),
    );
  });

  it('keeps PENDING on currency mismatch (non-ETB)', async () => {
    mockPendingPaymentThen('PENDING');
    mockVerifyResponse({
      status: 'success',
      amount: '1000',
      currency: 'USD',
      tx_ref: 'lm-payment-1',
    });

    await service.verifyByTxRef('lm-payment-1', 'student-1');

    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_VERIFY_MISMATCH',
      expect.objectContaining({
        meta: expect.objectContaining({ fields: ['currency'] }),
      }),
    );
  });

  it('keeps PENDING when the transaction is unknown / not paid yet (Chapa 404)', async () => {
    mockPendingPaymentThen('PENDING');
    // Chapa "payment not paid yet" / "Invalid transaction": 404, status failed, data null
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          status: 'failed',
          message: 'Payment not paid yet',
          data: null,
        }),
    } as unknown as Response);

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it('keeps PENDING and records an event when the verify call times out', async () => {
    mockPendingPaymentThen('PENDING');
    jest.spyOn(global, 'fetch').mockRejectedValue(
      Object.assign(new Error('The operation timed out'), {
        name: 'TimeoutError',
      }),
    );

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_VERIFY_UNREACHABLE',
      expect.objectContaining({ meta: { error: 'TimeoutError' } }),
    );
  });

  it('rejects a terminally failed Chapa transaction so it can be retried', async () => {
    const reviewedAt = new Date('2026-07-22T09:00:00.000Z');
    jest.useFakeTimers().setSystemTime(reviewedAt);
    mockPendingPaymentThen('REJECTED');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: 'success',
          message: 'Payment details fetched successfully',
          data: {
            status: 'failed/cancelled',
            amount: '1000',
            currency: 'ETB',
            tx_ref: 'lm-payment-1',
            reference: 'chapa-reference',
          },
        }),
    } as Response);

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'REJECTED' });
    // guarded transition through the state machine (never overwrites APPROVED)
    expect(transition).toHaveBeenCalledWith(
      tx,
      'payment-1',
      expect.objectContaining({
        from: ['PENDING'],
        to: 'REJECTED',
        type: 'CHAPA_PAYMENT_FAILED',
        data: expect.objectContaining({
          rejectionReason: 'Chapa reported failed/cancelled',
          chapaRef: 'chapa-reference',
          reviewedAt,
        }),
      }),
    );
    expect(finalizeApproval).not.toHaveBeenCalled();
  });

  it('a terminal-failure webhook cannot overwrite an already-approved payment (lost race)', async () => {
    // payment already APPROVED when the late webhook arrives
    findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'APPROVED',
      amount: '1000',
    });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: 'success',
          data: { status: 'failed/cancelled' },
        }),
    } as Response);

    await service.handleCallback('lm-payment-1');

    expect(transition).not.toHaveBeenCalled();
    expect(finalizeApproval).not.toHaveBeenCalled();
  });

  it('approves a verified transaction when amount equals the snapshot exactly', async () => {
    mockPendingPaymentThen('APPROVED');
    // Chapa reports the amount as a JSON number and the snapshot is '1000.00'
    findUnique
      .mockReset()
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'student-1',
        status: 'PENDING',
        receiptNumber: null,
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        status: 'PENDING',
        amount: '1000.00',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        status: 'APPROVED',
        receiptNumber: 'LM-0001',
      });
    mockVerifyResponse({
      status: 'success',
      amount: 1000,
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      reference: 'chapa-reference',
      charge: 35, // customer-paid fee is reported separately and must NOT be compared
    });

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({
      status: 'APPROVED',
      receiptNumber: 'LM-0001',
    });
    expect(finalizeApproval).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({ chapaRef: 'chapa-reference' }),
    );
  });

  it('rejects a 1-cent amount difference (no float tolerance)', async () => {
    mockPendingPaymentThen('PENDING');
    mockVerifyResponse({
      status: 'success',
      amount: '1000.01',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
    });

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_VERIFY_MISMATCH',
      expect.objectContaining({
        meta: expect.objectContaining({ fields: ['amount'] }),
      }),
    );
  });

  it('hides another user payment behind a not-found response', async () => {
    findUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'student-2',
      status: 'PENDING',
    });

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
