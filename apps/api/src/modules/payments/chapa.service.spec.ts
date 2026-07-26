import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PaymentsService } from './payments.service';
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
  const create =
    jest.fn<(args: PaymentCreateArgs) => Promise<{ id: string }>>();
  const update = jest.fn<(args: PaymentUpdateArgs) => unknown>();
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
  const prisma = {
    subscriptionPlan: { findUnique: findPlan },
    payment: { findUnique, create, update, updateMany },
  } as unknown as PrismaService;
  const payments = {
    assertNoActiveSubscription,
    finalizeApproval,
  } as unknown as PaymentsService;
  const service = new ChapaService(config, prisma, payments);

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
    updateMany.mockReset();
    assertNoActiveSubscription.mockReset();
    finalizeApproval.mockReset();
    jest.restoreAllMocks();
  });

  it('creates a fresh Chapa transaction reference for every checkout attempt', async () => {
    findPlan.mockResolvedValue({
      id: 'plan-1',
      name: 'Semester',
      priceETB: '1000',
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
      data: {
        userId: 'student-1',
        planId: 'plan-1',
        method: 'CHAPA',
        amount: '1000',
        currency: 'ETB',
        txRef: first.txRef,
      },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: 'student-1',
        planId: 'plan-1',
        method: 'CHAPA',
        amount: '1000',
        currency: 'ETB',
        txRef: second.txRef,
      },
    });
  });

  it('rejects the local attempt when Chapa initialization fails', async () => {
    const reviewedAt = new Date('2026-07-26T09:00:00.000Z');
    jest.useFakeTimers().setSystemTime(reviewedAt);
    findPlan.mockResolvedValue({
      id: 'plan-1',
      name: 'Semester',
      priceETB: '1000',
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
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: 'PENDING' },
      data: {
        status: 'REJECTED',
        rejectionReason:
          'Chapa initialization failed: Transaction reference has been used before',
        reviewedAt,
      },
    });
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

  it('does not approve a successful but underpaid transaction', async () => {
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
        status: 'PENDING',
        receiptNumber: null,
      });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: 'success',
          data: { status: 'success', amount: '900' },
        }),
    } as Response);

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(finalizeApproval).not.toHaveBeenCalled();
  });

  it('rejects a terminally failed Chapa transaction so it can be retried', async () => {
    const reviewedAt = new Date('2026-07-22T09:00:00.000Z');
    jest.useFakeTimers().setSystemTime(reviewedAt);
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
        status: 'REJECTED',
        receiptNumber: null,
      });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: 'success',
          message: 'Payment details fetched successfully',
          data: {
            status: 'failed/cancelled',
            amount: '1000',
            reference: 'chapa-reference',
          },
        }),
    } as Response);

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'REJECTED' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        status: 'REJECTED',
        rejectionReason: 'Chapa reported failed/cancelled',
        chapaRef: 'chapa-reference',
        reviewedAt,
      },
    });
    expect(finalizeApproval).not.toHaveBeenCalled();
  });

  it('approves a verified transaction with the expected amount', async () => {
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
        status: 'APPROVED',
        receiptNumber: 'LM-0001',
      });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: 'success',
          data: {
            status: 'success',
            amount: '1000',
            reference: 'chapa-reference',
          },
        }),
    } as Response);

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
