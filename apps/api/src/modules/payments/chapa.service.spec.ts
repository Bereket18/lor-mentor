import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
  const findFirst = jest.fn();
  const findEvents = jest.fn();
  const findPlan = jest.fn();
  const create = jest.fn<Promise<{ id: string }>, [PaymentCreateArgs]>();
  const update = jest.fn<Promise<unknown>, [PaymentUpdateArgs]>();
  const updateMany = jest.fn();
  const assertNoActiveSubscription = jest.fn();
  const finalizeApproval = jest.fn();
  const cancelOwn = jest.fn();
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
    payment: { findUnique, findFirst, create, update, updateMany },
    paymentEvent: { findMany: findEvents },
    $transaction: jest.fn((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;
  const payments = {
    assertNoActiveSubscription,
    finalizeApproval,
    cancelOwn,
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
    findFirst.mockReset().mockResolvedValue(null);
    findPlan.mockReset();
    create.mockReset();
    update.mockReset().mockResolvedValue({});
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    findEvents.mockReset().mockResolvedValue([]);
    transition.mockReset().mockResolvedValue(true);
    recordEvent.mockReset().mockResolvedValue(undefined);
    assertNoActiveSubscription.mockReset();
    finalizeApproval.mockReset();
    cancelOwn.mockReset().mockResolvedValue({ message: 'Payment cancelled' });
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
    // Hosted checkout page shows plan/amount, not "<plan> subscription".
    expect(body.customization.description).toBe('Semester - 1000.5');
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

  it('keeps a PENDING payment pending when Chapa reports one failed attempt', async () => {
    mockPendingPaymentThen('PENDING');
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
    ).resolves.toMatchObject({ status: 'PENDING' });
    // A single failed attempt is not terminal — no status change.
    expect(transition).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_ATTEMPT_FAILED',
      expect.objectContaining({
        fromStatus: 'PENDING',
        toStatus: 'PENDING',
        meta: expect.objectContaining({
          reportedStatus: 'failed/cancelled',
          chapaRef: 'chapa-reference',
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

  it('revives an EXPIRED row through the verified verify endpoint (allowExpiredOrCancelled)', async () => {
    findUnique
      .mockReset()
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'student-1',
        status: 'EXPIRED',
        receiptNumber: null,
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        status: 'EXPIRED',
        amount: '1000',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        status: 'APPROVED',
        receiptNumber: 'LM-0001',
      });
    mockVerifyResponse({
      status: 'success',
      amount: '1000.00',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      reference: 'chapa-reference',
    });

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'APPROVED', receiptNumber: 'LM-0001' });

    expect(finalizeApproval).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({
        chapaRef: 'chapa-reference',
        allowExpiredOrCancelled: true,
      }),
    );
  });

  it('keeps a REVERSED row terminal but logs the late exact payment', async () => {
    findUnique.mockReset().mockResolvedValueOnce({
      id: 'payment-1',
      status: 'REVERSED',
      amount: '1000',
    });
    mockVerifyResponse({
      status: 'success',
      amount: '1000.00',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      reference: 'chapa-reference',
    });

    const body = Buffer.from('{"tx_ref":"lm-payment-1"}');
    await expect(
      service.handleWebhook(body, { payloadSignature: signPayload(body) }),
    ).resolves.toEqual({ received: true });

    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_LATE_PAYMENT_TERMINAL',
      expect.objectContaining({
        fromStatus: 'REVERSED',
        toStatus: 'REVERSED',
        reason: expect.stringContaining('REVERSED'),
      }),
    );
  });

  it('stamps chapaRef and an admin exception when verified money lands on a terminal row', async () => {
    // A REJECTED row may have no gateway reference of its own (the checkout
    // failed to initialize), so the money only becomes visible to the admin
    // queue if we stamp the reference we did get and flag the exception.
    findUnique.mockReset().mockResolvedValueOnce({
      id: 'payment-1',
      status: 'REJECTED',
      amount: '1000',
      verification: { reviewNote: 'Receipt could not be verified' },
    });
    mockVerifyResponse({
      status: 'success',
      amount: '1000.00',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      reference: 'chapa-reference',
    });

    const body = Buffer.from('{"tx_ref":"lm-payment-1"}');
    await expect(
      service.handleWebhook(body, { payloadSignature: signPayload(body) }),
    ).resolves.toEqual({ received: true });

    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_LATE_PAYMENT_TERMINAL',
      expect.objectContaining({ fromStatus: 'REJECTED', toStatus: 'REJECTED' }),
    );
    // Without this write the admin queue hides a CHAPA/REJECTED row with no
    // chapaRef entirely: the money would appear nowhere.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expect.objectContaining({
        chapaRef: 'chapa-reference',
        verification: expect.objectContaining({
          exception: true,
          reviewNote: expect.stringContaining('REJECTED'),
        }),
      }),
    });
  });

  describe('verified money that could not be approved in the same pass', () => {
    /**
     * Chapa confirmed the exact payment; finalizeApprorove could not claim the
     * row (a concurrent cancel closed it). Each entry point reads the payment
     * a different number of times, so the rig is built per entry point.
     */
    function mockVerifiedButUnapproved(entry: 'callback' | 'verify') {
      const confirmRow = {
        id: 'payment-1',
        status: 'CANCELLED',
        amount: '1000',
        verification: null,
      };
      const freshRow = {
        id: 'payment-1',
        status: 'CANCELLED',
        receiptNumber: null,
      };
      findUnique.mockReset();
      if (entry === 'verify') {
        findUnique
          .mockResolvedValueOnce({
            id: 'payment-1',
            userId: 'student-1',
            status: 'CANCELLED',
            receiptNumber: null,
          })
          .mockResolvedValueOnce(confirmRow)
          .mockResolvedValueOnce(freshRow);
      } else {
        findUnique
          .mockResolvedValueOnce(confirmRow)
          .mockResolvedValueOnce(freshRow);
      }
      finalizeApproval.mockReset().mockResolvedValue({
        message: 'Payment is CANCELLED',
        approved: false,
        status: 'CANCELLED',
      });
      mockVerifyResponse({
        status: 'success',
        amount: '1000.00',
        currency: 'ETB',
        tx_ref: 'lm-payment-1',
        reference: 'chapa-reference',
      });
    }

    it('records CHAPA_VERIFY_NOT_APPROVED and flags an admin exception', async () => {
      mockVerifiedButUnapproved('callback');

      const body = Buffer.from('{"tx_ref":"lm-payment-1"}');
      await expect(
        service.handleWebhook(body, { payloadSignature: signPayload(body) }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        'CHAPA_VERIFY_NOT_APPROVED',
        expect.objectContaining({
          fromStatus: 'CANCELLED',
          toStatus: 'CANCELLED',
        }),
      );
      // Money is real: the row must be visible to an admin.
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: { not: 'APPROVED' } },
        data: expect.objectContaining({
          verification: expect.objectContaining({
            exception: true,
          }),
        }),
      });
    });

    it('the browser verify endpoint says the confirmation is pending instead of a stale status', async () => {
      mockVerifiedButUnapproved('verify');

      const result = await service.verifyByTxRef('lm-payment-1', 'student-1');

      expect(result).toMatchObject({
        paymentId: 'payment-1',
        status: 'CANCELLED',
        confirmationPending: true,
      });
      // The message the UI shows must tell the student not to pay again.
      expect(result.message).toMatch(/do not pay again/i);
    });

    it('the browser callback endpoint reports the same pending confirmation', async () => {
      mockVerifiedButUnapproved('callback');

      const result = await service.handleCallback('lm-payment-1');

      expect(result).toMatchObject({
        paymentId: 'payment-1',
        status: 'CANCELLED',
        confirmationPending: true,
      });
      expect(result.message).toMatch(/do not pay again/i);
    });

    it('does not flag an exception when Chapa itself could not be reached', async () => {
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
          amount: '1000',
          verification: null,
        })
        .mockResolvedValueOnce({
          id: 'payment-1',
          status: 'PENDING',
          receiptNumber: null,
        });
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.verifyByTxRef('lm-payment-1', 'student-1');

      // The student still gets "wait, do not pay again"...
      expect(result).toMatchObject({
        status: 'PENDING',
        confirmationPending: true,
      });
      // ...but no money was confirmed, so nothing is flagged for review.
      expect(updateMany).not.toHaveBeenCalled();
      expect(recordEvent).not.toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        'CHAPA_VERIFY_NOT_APPROVED',
        expect.anything(),
      );
    });

    it('an approved payment is never reported as pending', async () => {
      findUnique
        .mockReset()
        .mockResolvedValueOnce({
          id: 'payment-1',
          userId: 'student-1',
          status: 'APPROVED',
          receiptNumber: 'LM-0001',
        })
        .mockResolvedValueOnce({
          id: 'payment-1',
          status: 'APPROVED',
          receiptNumber: 'LM-0001',
        });

      const result = await service.verifyByTxRef('lm-payment-1', 'student-1');

      expect(result).toMatchObject({
        status: 'APPROVED',
        receiptNumber: 'LM-0001',
        confirmationPending: false,
      });
    });
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

  function serviceWithEnv(nodeEnv: string) {
    const envConfig = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          CHAPA_SECRET_KEY: 'chapa-test-secret',
          CHAPA_WEBHOOK_SECRET: webhookSecret,
          CHAPA_BASE_URL: 'https://chapa.test/v1',
          API_PUBLIC_URL: 'https://api.lormentor.test',
          WEB_PUBLIC_URL: 'https://lormentor.test',
          NODE_ENV: nodeEnv,
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    return new ChapaService(envConfig, prisma, payments, states);
  }

  it('approves a test-mode payment in a non-production environment', async () => {
    mockPendingPaymentThen('APPROVED');
    mockVerifyResponse({
      status: 'success',
      amount: '1000',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      mode: 'test',
    });

    await expect(
      service.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    expect(finalizeApproval).toHaveBeenCalled();
  });

  it('does not approve a live-mode payment in a non-production environment', async () => {
    mockPendingPaymentThen('PENDING');
    mockVerifyResponse({
      status: 'success',
      amount: '1000',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      mode: 'live',
    });

    await service.verifyByTxRef('lm-payment-1', 'student-1');

    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_VERIFY_MISMATCH',
      expect.objectContaining({
        meta: expect.objectContaining({ fields: ['mode'], mode: 'live' }),
      }),
    );
  });

  it('does not approve a test-mode payment in production', async () => {
    const prod = serviceWithEnv('production');
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
    mockVerifyResponse({
      status: 'success',
      amount: '1000',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      mode: 'test',
    });

    await prod.verifyByTxRef('lm-payment-1', 'student-1');

    expect(finalizeApproval).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      'payment-1',
      'CHAPA_VERIFY_MISMATCH',
      expect.objectContaining({
        meta: expect.objectContaining({ fields: ['mode'] }),
      }),
    );
  });

  it('approves in production when the verified mode is live', async () => {
    const prod = serviceWithEnv('production');
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
    mockVerifyResponse({
      status: 'success',
      amount: '1000',
      currency: 'ETB',
      tx_ref: 'lm-payment-1',
      mode: 'live',
    });

    await expect(
      prod.verifyByTxRef('lm-payment-1', 'student-1'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    expect(finalizeApproval).toHaveBeenCalled();
  });

  describe('webhook status codes', () => {
    function signed(event: Record<string, unknown>) {
      const body = Buffer.from(JSON.stringify(event));
      return { body, signatures: { payloadSignature: signPayload(body) } };
    }

    it('returns 200 for a deterministically ignorable "not paid yet" event', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        amount: '1000',
      });
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
      const { body, signatures } = signed({
        event: 'charge.success',
        tx_ref: 'lm-payment-1',
      });

      await expect(service.handleWebhook(body, signatures)).resolves.toEqual({
        received: true,
      });
      expect(finalizeApproval).not.toHaveBeenCalled();
    });

    it('returns 200 (no retry) for an unknown tx_ref', async () => {
      findUnique.mockResolvedValue(null);
      const { body, signatures } = signed({ tx_ref: 'lm-unknown' });

      await expect(service.handleWebhook(body, signatures)).resolves.toEqual({
        received: true,
      });
    });

    it('returns 5xx when the Chapa verify call times out', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        amount: '1000',
      });
      jest.spyOn(global, 'fetch').mockRejectedValue(
        Object.assign(new Error('The operation timed out'), {
          name: 'TimeoutError',
        }),
      );
      const { body, signatures } = signed({ tx_ref: 'lm-payment-1' });

      await expect(
        service.handleWebhook(body, signatures),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        'CHAPA_VERIFY_UNREACHABLE',
        expect.anything(),
      );
    });

    it('returns 5xx when the database fails during approval', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        amount: '1000',
      });
      mockVerifyResponse({
        status: 'success',
        amount: '1000',
        currency: 'ETB',
        tx_ref: 'lm-payment-1',
        mode: 'test',
      });
      finalizeApproval.mockRejectedValueOnce(new Error('database is down'));
      const { body, signatures } = signed({ tx_ref: 'lm-payment-1' });

      await expect(
        service.handleWebhook(body, signatures),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns 5xx when the row moved and could not be claimed (never a false 200)', async () => {
      // The money is real, but a concurrent cancel closed the row before the
      // approval could claim it. A false 200 would lose the event for good, so
      // ask Chapa to redeliver; the retry re-verifies and revives it.
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        amount: '1000',
      });
      mockVerifyResponse({
        status: 'success',
        amount: '1000',
        currency: 'ETB',
        tx_ref: 'lm-payment-1',
        mode: 'test',
      });
      finalizeApproval.mockResolvedValueOnce({
        message: 'Payment is CANCELLED',
        approved: false,
        status: 'CANCELLED',
      });
      const { body, signatures } = signed({ tx_ref: 'lm-payment-1' });

      await expect(
        service.handleWebhook(body, signatures),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns 200 for a mismatch (durably recorded, manual review)', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        amount: '1000',
      });
      mockVerifyResponse({
        status: 'success',
        amount: '900',
        currency: 'ETB',
        tx_ref: 'lm-payment-1',
      });
      const { body, signatures } = signed({ tx_ref: 'lm-payment-1' });

      await expect(service.handleWebhook(body, signatures)).resolves.toEqual({
        received: true,
      });
      expect(finalizeApproval).not.toHaveBeenCalled();
    });

    it('returns 200 when the payment is approved', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        amount: '1000',
      });
      mockVerifyResponse({
        status: 'success',
        amount: '1000',
        currency: 'ETB',
        tx_ref: 'lm-payment-1',
      });
      const { body, signatures } = signed({ tx_ref: 'lm-payment-1' });

      await expect(service.handleWebhook(body, signatures)).resolves.toEqual({
        received: true,
      });
      expect(finalizeApproval).toHaveBeenCalled();
    });
  });

  describe('refund, reversal and failed webhook events', () => {
    function signed(event: Record<string, unknown>) {
      const body = Buffer.from(JSON.stringify(event));
      return { body, signatures: { payloadSignature: signPayload(body) } };
    }

    it('records a refund on an APPROVED payment and flags an admin exception without cancelling access', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'APPROVED',
        verification: { source: 'chapa' },
        chapaRef: 'chapa-reference',
      });
      const { body, signatures } = signed({
        event: 'charge.refunded',
        status: 'refunded',
        tx_ref: 'lm-payment-1',
        amount: 1000,
        currency: 'ETB',
        mode: 'live',
      });

      await expect(service.handleWebhook(body, signatures)).resolves.toEqual({
        received: true,
      });

      expect(recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        'CHAPA_REFUND_RECEIVED',
        expect.objectContaining({
          fromStatus: 'APPROVED',
          toStatus: 'APPROVED',
        }),
      );
      expect(transition).not.toHaveBeenCalled();
      expect(finalizeApproval).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: {
          verification: expect.objectContaining({
            source: 'chapa',
            exception: true,
            decision: 'REVIEW',
          }),
        },
      });
    });

    it('records a refunding status as a refund', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        verification: null,
        chapaRef: null,
      });
      const { body, signatures } = signed({
        event: 'charge.refunded',
        status: 'refunding',
        tx_ref: 'lm-payment-1',
      });

      await service.handleWebhook(body, signatures);

      expect(recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        'CHAPA_REFUND_RECEIVED',
        expect.anything(),
      );
      // Not approved: event only, no admin exception write.
      expect(updateMany).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
    });

    it('records a reversal on an APPROVED payment and flags an admin exception', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'APPROVED',
        verification: null,
        chapaRef: 'chapa-reference',
      });
      const { body, signatures } = signed({
        event: 'charge.reversed',
        status: 'reversed',
        tx_ref: 'lm-payment-1',
      });

      await service.handleWebhook(body, signatures);

      expect(recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        'CHAPA_REVERSAL_RECEIVED',
        expect.anything(),
      );
      expect(transition).not.toHaveBeenCalled();
      expect(finalizeApproval).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalled();
    });

    it('records a failed/cancelled event without changing state', async () => {
      findUnique.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        verification: null,
        chapaRef: null,
      });
      const { body, signatures } = signed({
        event: 'charge.failed',
        status: 'failed',
        tx_ref: 'lm-payment-1',
      });

      await service.handleWebhook(body, signatures);

      expect(recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        'CHAPA_FAILED_OR_CANCELLED',
        expect.objectContaining({
          fromStatus: 'PENDING',
          toStatus: 'PENDING',
        }),
      );
      expect(transition).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
      expect(finalizeApproval).not.toHaveBeenCalled();
    });

    it('acknowledges a lifecycle event for an unknown tx_ref', async () => {
      findUnique.mockResolvedValue(null);
      const { body, signatures } = signed({
        event: 'charge.refunded',
        tx_ref: 'lm-unknown',
      });

      await expect(service.handleWebhook(body, signatures)).resolves.toEqual({
        received: true,
      });
      expect(recordEvent).not.toHaveBeenCalled();
    });

    // Chapa redelivers a webhook every ~10 minutes for up to 72 hours until it
    // sees a 2xx, so every lifecycle event can arrive many times.
    describe('redelivery of the same lifecycle event', () => {
      const refund = {
        event: 'charge.refunded',
        status: 'refunded',
        tx_ref: 'lm-payment-1',
        amount: 1000,
        currency: 'ETB',
        reference: 'chapa-refund-1',
      };
      const approved = {
        id: 'payment-1',
        status: 'APPROVED',
        verification: { source: 'chapa' },
        chapaRef: 'chapa-reference',
      };

      function redeliver(event: Record<string, unknown>) {
        const body = Buffer.from(JSON.stringify(event));
        // The retry is signed with the OTHER accepted header: deduplication
        // must not depend on rejecting a valid signature.
        return service.handleWebhook(body, {
          chapaSignature: signSecret(),
        });
      }

      it('records a redelivered refund only once and flags the payment once', async () => {
        findUnique.mockResolvedValue(approved);
        findEvents
          .mockResolvedValueOnce([])
          .mockResolvedValue([
            {
              id: 'event-1',
              meta: { txRef: 'lm-payment-1', reference: 'chapa-refund-1' },
            },
          ]);

        const first = signed(refund);
        await expect(service.handleWebhook(first.body, first.signatures)).resolves.toEqual({
          received: true,
        });
        await expect(redeliver(refund)).resolves.toEqual({ received: true });

        expect(recordEvent).toHaveBeenCalledTimes(1);
        expect(updateMany).toHaveBeenCalledTimes(1);
      });

      it('records a redelivered reversal only once', async () => {
        findUnique.mockResolvedValue(approved);
        const reversal = {
          event: 'charge.reversed',
          status: 'reversed',
          tx_ref: 'lm-payment-1',
          reference: 'chapa-reversal-1',
        };
        findEvents
          .mockResolvedValueOnce([])
          .mockResolvedValue([
            { id: 'event-1', meta: { reference: 'chapa-reversal-1' } },
          ]);

        const first = signed(reversal);
        await service.handleWebhook(first.body, first.signatures);
        await redeliver(reversal);

        expect(recordEvent).toHaveBeenCalledTimes(1);
        expect(updateMany).toHaveBeenCalledTimes(1);
      });

      it('records a redelivered failed/cancelled event only once', async () => {
        findUnique.mockResolvedValue({ ...approved, status: 'PENDING' });
        const failed = {
          event: 'charge.failed',
          status: 'failed',
          tx_ref: 'lm-payment-1',
          reference: 'chapa-failed-1',
        };
        findEvents
          .mockResolvedValueOnce([])
          .mockResolvedValue([
            { id: 'event-1', meta: { reference: 'chapa-failed-1' } },
          ]);

        const first = signed(failed);
        await service.handleWebhook(first.body, first.signatures);
        await redeliver(failed);

        expect(recordEvent).toHaveBeenCalledTimes(1);
      });

      it('still records a second refund that carries a different gateway reference', async () => {
        findUnique.mockResolvedValue(approved);
        findEvents.mockResolvedValue([
          { id: 'event-1', meta: { reference: 'chapa-refund-1' } },
        ]);

        const second = signed({ ...refund, reference: 'chapa-refund-2' });
        await service.handleWebhook(second.body, second.signatures);

        expect(recordEvent).toHaveBeenCalledTimes(1);
        expect(recordEvent).toHaveBeenCalledWith(
          expect.anything(),
          'payment-1',
          'CHAPA_REFUND_RECEIVED',
          expect.objectContaining({
            meta: expect.objectContaining({ reference: 'chapa-refund-2' }),
          }),
        );
      });

      it('does not treat a reversal as a duplicate of an earlier refund', async () => {
        findUnique.mockResolvedValue(approved);
        findEvents.mockResolvedValue([]);

        const reversal = signed({
          event: 'charge.reversed',
          status: 'reversed',
          tx_ref: 'lm-payment-1',
          reference: 'chapa-refund-1',
        });
        await service.handleWebhook(reversal.body, reversal.signatures);

        expect(recordEvent).toHaveBeenCalledWith(
          expect.anything(),
          'payment-1',
          'CHAPA_REVERSAL_RECEIVED',
          expect.anything(),
        );
      });

      it('deduplicates a redelivery that carries no gateway reference either', async () => {
        findUnique.mockResolvedValue(approved);
        const noRef = {
          event: 'charge.refunded',
          status: 'refunded',
          tx_ref: 'lm-payment-1',
          amount: 1000,
        };
        findEvents
          .mockResolvedValueOnce([])
          .mockResolvedValue([{ id: 'event-1', meta: { txRef: 'lm-payment-1' } }]);

        const first = signed(noRef);
        await service.handleWebhook(first.body, first.signatures);
        await redeliver(noRef);

        expect(recordEvent).toHaveBeenCalledTimes(1);
        expect(updateMany).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('cancel at Chapa', () => {
    const pending = {
      id: 'payment-1',
      userId: 'student-1',
      status: 'PENDING',
      method: 'CHAPA',
      txRef: 'lm-payment-1',
    };

    function mockCancelThenVerify(
      cancel: { ok: boolean; status: number; json: unknown },
      verify?: { ok: boolean; status: number; json: unknown },
    ) {
      jest.spyOn(global, 'fetch').mockImplementation((url) => {
        const u = String(url);
        if (u.includes('/transaction/cancel/')) {
          return Promise.resolve({
            ok: cancel.ok,
            status: cancel.status,
            json: () => Promise.resolve(cancel.json),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: verify?.ok ?? false,
          status: verify?.status ?? 404,
          json: () => Promise.resolve(verify?.json ?? {}),
        } as unknown as Response);
      });
    }

    it('cancels locally only after Chapa confirms the link is dead', async () => {
      findUnique.mockResolvedValue(pending);
      mockCancelThenVerify({
        ok: true,
        status: 200,
        json: {
          message: 'Checkout link expired successfully',
          status: 'success',
          data: {},
        },
      });

      await expect(
        service.cancelByStudent('payment-1', 'student-1'),
      ).resolves.toEqual({ message: 'Payment cancelled' });
      expect(cancelOwn).toHaveBeenCalledWith('payment-1', 'student-1');
    });

    it('runs the normal approval path when Chapa says the checkout is already paid', async () => {
      findUnique
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce({
          id: 'payment-1',
          status: 'PENDING',
          amount: '1000',
        });
      mockCancelThenVerify(
        {
          ok: false,
          status: 400,
          json: { message: 'Payment link cannot be cancelled', status: 'failed' },
        },
        {
          ok: true,
          status: 200,
          json: {
            status: 'success',
            data: {
              status: 'success',
              amount: '1000',
              currency: 'ETB',
              tx_ref: 'lm-payment-1',
              reference: 'chapa-reference',
              mode: 'test',
            },
          },
        },
      );

      const res = await service.cancelByStudent('payment-1', 'student-1');

      expect(cancelOwn).not.toHaveBeenCalled();
      expect(finalizeApproval).toHaveBeenCalledWith(
        'payment-1',
        expect.objectContaining({ allowExpiredOrCancelled: true }),
      );
      expect(res.message).toMatch(/already paid/i);
    });

    it('changes nothing and asks for a retry when Chapa is unreachable', async () => {
      findUnique.mockResolvedValue(pending);
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(
        service.cancelByStudent('payment-1', 'student-1'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(cancelOwn).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
    });

    it('treats the documented "already expired" cancel failure as a dead link', async () => {
      findUnique.mockResolvedValue(pending);
      mockCancelThenVerify(
        {
          ok: false,
          status: 400,
          json: { message: 'Payment link already expired', status: 'failed' },
        },
        {
          ok: false,
          status: 404,
          json: { status: 'failed', message: 'Payment not paid yet', data: null },
        },
      );

      await expect(
        service.cancelByStudent('payment-1', 'student-1'),
      ).resolves.toEqual({ message: 'Payment cancelled' });
      expect(cancelOwn).toHaveBeenCalledWith('payment-1', 'student-1');
    });

    it('refuses (and changes nothing) when Chapa cannot cancel an unpaid checkout', async () => {
      findUnique.mockResolvedValue(pending);
      mockCancelThenVerify(
        {
          ok: false,
          status: 400,
          json: { message: 'Card checkout cannot be cancelled', status: 'failed' },
        },
        {
          ok: false,
          status: 404,
          json: { status: 'failed', data: null },
        },
      );

      await expect(
        service.cancelByStudent('payment-1', 'student-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(cancelOwn).not.toHaveBeenCalled();
    });
  });

  describe('lazy resolution of an existing PENDING payment at initialize', () => {
    const user = {
      id: 'student-1',
      email: 's@example.com',
      fullName: 'Test Student',
    };
    const plan = {
      id: 'plan-1',
      name: 'Semester',
      priceETB: '1000',
      durationMonths: 6,
      isActive: true,
    };

    function pendingChapa(overrides: Record<string, unknown> = {}) {
      return {
        id: 'old-payment',
        method: 'CHAPA',
        status: 'PENDING',
        txRef: 'lm-old',
        planId: 'plan-1',
        checkoutUrl: 'https://checkout.chapa.test/old',
        amount: '1000',
        // abandoned: older than the default 60-minute retry window
        createdAt: new Date(Date.now() - 61 * 60 * 1000),
        ...overrides,
      };
    }

    function mockVerifyThenInitialize(
      verifyPayload: unknown,
      verifyOk = false,
    ) {
      jest.spyOn(global, 'fetch').mockImplementation((url) => {
        const u = String(url);
        if (u.includes('/transaction/verify/')) {
          return Promise.resolve({
            ok: verifyOk,
            status: verifyOk ? 200 : 404,
            json: () => Promise.resolve(verifyPayload),
          } as unknown as Response);
        }
        if (u.includes('/transaction/cancel/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                status: 'success',
                message: 'Checkout link expired successfully',
                data: {},
              }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'success',
              data: { checkout_url: 'https://checkout.chapa.test/new' },
            }),
        } as unknown as Response);
      });
    }

    beforeEach(() => {
      findPlan.mockResolvedValue(plan);
      create.mockResolvedValue({ id: 'new-payment' });
    });

    it('expires an abandoned checkout (>60 min, Chapa unpaid and cancel confirmed) via PAYMENT_EXPIRED and starts a fresh one', async () => {
      findFirst.mockResolvedValue(pendingChapa());
      mockVerifyThenInitialize({
        status: 'failed',
        message: 'Payment not paid yet',
        data: null,
      });

      const res = await service.initialize(user, 'plan-1');

      expect(transition).toHaveBeenCalledWith(
        tx,
        'old-payment',
        expect.objectContaining({
          from: ['PENDING'],
          to: 'EXPIRED',
          type: 'PAYMENT_EXPIRED',
          reason: expect.stringContaining('lm-old'),
        }),
      );
      expect(create).toHaveBeenCalledTimes(1);
      expect(res).toMatchObject({ checkoutUrl: 'https://checkout.chapa.test/new' });
      expect(finalizeApproval).not.toHaveBeenCalled();
    });

    it('never expires a stale checkout when Chapa cancel is unreachable', async () => {
      findFirst.mockResolvedValue(pendingChapa());
      jest.spyOn(global, 'fetch').mockImplementation((url) => {
        const u = String(url);
        if (u.includes('/transaction/cancel/')) {
          return Promise.reject(new Error('connect ECONNREFUSED'));
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () =>
            Promise.resolve({ status: 'failed', data: null }),
        } as unknown as Response);
      });

      await expect(service.initialize(user, 'plan-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(transition).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        'old-payment',
        'CHAPA_CANCEL_FAILED',
        expect.objectContaining({
          meta: expect.objectContaining({ context: 'initialize-retry' }),
        }),
      );
    });

    it('approves a paid-but-webhook-lost checkout instead of creating a duplicate', async () => {
      findFirst.mockResolvedValue(pendingChapa());
      mockVerifyThenInitialize(
        {
          status: 'success',
          data: {
            status: 'success',
            amount: '1000',
            currency: 'ETB',
            tx_ref: 'lm-old',
            reference: 'chapa-ref-1',
          },
        },
        true,
      );

      const res = await service.initialize(user, 'plan-1');

      expect(finalizeApproval).toHaveBeenCalledWith(
        'old-payment',
        expect.objectContaining({ chapaRef: 'chapa-ref-1' }),
      );
      expect(create).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
      expect(res).toMatchObject({ approved: true, txRef: 'lm-old' });
    });

    it('resumes a still-open checkout (<60 min) for the same plan', async () => {
      findFirst.mockResolvedValue(
        pendingChapa({ createdAt: new Date(Date.now() - 5 * 60 * 1000) }),
      );
      mockVerifyThenInitialize({ status: 'failed', data: null });

      const res = await service.initialize(user, 'plan-1');

      expect(res).toMatchObject({
        checkoutUrl: 'https://checkout.chapa.test/old',
        txRef: 'lm-old',
        resumed: true,
      });
      expect(create).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
    });

    it('tells the student the remaining wait when the open checkout is for another plan', async () => {
      findFirst.mockResolvedValue(
        pendingChapa({
          planId: 'plan-2',
          createdAt: new Date(Date.now() - 5 * 60 * 1000),
        }),
      );
      mockVerifyThenInitialize({ status: 'failed', data: null });

      await expect(service.initialize(user, 'plan-1')).rejects.toThrow(
        /still open — complete it within about \d+ min/,
      );
      expect(create).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
    });

    it('never expires when Chapa is unreachable — clear retry message, row untouched', async () => {
      findFirst.mockResolvedValue(pendingChapa());
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(service.initialize(user, 'plan-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(service.initialize(user, 'plan-1')).rejects.toThrow(
        /could not reach the payment gateway/i,
      );
      expect(transition).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        'old-payment',
        'CHAPA_VERIFY_UNREACHABLE',
        expect.objectContaining({
          meta: expect.objectContaining({ context: 'initialize-retry' }),
        }),
      );
    });

    it('names a PENDING bank-receipt payment (id, method, status) instead of blocking silently', async () => {
      findFirst.mockResolvedValue({
        id: 'receipt-1',
        method: 'MANUAL',
        status: 'PENDING',
        txRef: null,
        planId: 'plan-1',
        checkoutUrl: null,
        amount: '1000',
        createdAt: new Date(),
      });

      await expect(service.initialize(user, 'plan-1')).rejects.toThrow(
        /MANUAL bank-receipt payment \(id receipt-1, status PENDING\) awaiting admin review/,
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('lost race on expiry: if the concurrent request approved the payment, report approval', async () => {
      findFirst.mockResolvedValue(pendingChapa());
      mockVerifyThenInitialize({ status: 'failed', data: null });
      transition.mockResolvedValue(false); // guarded update matched 0 rows
      findUnique.mockResolvedValue({ status: 'APPROVED' });

      const res = await service.initialize(user, 'plan-1');

      expect(res).toMatchObject({ approved: true, txRef: 'lm-old' });
      expect(create).not.toHaveBeenCalled();
    });

    it('lost race on expiry: if the row moved to a non-approved status, ask for a retry', async () => {
      findFirst.mockResolvedValue(pendingChapa());
      mockVerifyThenInitialize({ status: 'failed', data: null });
      transition.mockResolvedValue(false);
      findUnique.mockResolvedValue({ status: 'EXPIRED' });

      await expect(service.initialize(user, 'plan-1')).rejects.toThrow(
        /just resolved by another request/,
      );
      expect(create).not.toHaveBeenCalled();
    });
  });
});
