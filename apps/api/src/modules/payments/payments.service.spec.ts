import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ReceiptService } from './receipt.service';
import type {
  NormalizedReceipt,
  ReceiptVerifierService,
  VerifierResult,
} from './receipt-verifier.service';
import { PaymentsService } from './payments.service';
import type { VerifyReceiptDto } from './dto/verify-receipt.dto';

describe('PaymentsService bank verification security', () => {
  interface PaymentCreateInput {
    data: Record<string, unknown>;
  }

  const findPlan = jest.fn();
  const findPending = jest.fn();
  const findPayment = jest.fn();
  const findSubscription = jest.fn();
  let createdData: Record<string, unknown> = {};
  const createPayment = jest.fn(
    (input: PaymentCreateInput): Promise<{ id: string }> => {
      createdData = input.data;
      return Promise.resolve({ id: 'payment-1' });
    },
  );
  const extract = jest.fn<(input: unknown) => Promise<VerifierResult>>();

  const prisma = {
    subscriptionPlan: { findUnique: findPlan },
    payment: {
      findFirst: findPending,
      findUnique: findPayment,
      create: createPayment,
    },
    subscription: { findUnique: findSubscription },
  } as unknown as PrismaService;

  const receipts = {
    buildReceiptNumber: jest.fn(),
    generate: jest.fn(),
  } as unknown as ReceiptService;

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'COMPANY_BANK_ACCOUNTS') return '1000123456789';
      return undefined;
    }),
  } as unknown as ConfigService;

  const verifier = {
    enabled: true,
    extract,
  } as unknown as ReceiptVerifierService;

  const service = new PaymentsService(prisma, receipts, config, verifier);

  const plan = {
    id: 'plan-1',
    name: 'Semester',
    priceETB: new Prisma.Decimal(1000),
    isActive: true,
  };

  const validReceipt: NormalizedReceipt = {
    bank: 'dashen',
    reference: 'TX-123',
    amount: 1000,
    receiverAccount: '1000123456789',
    receiverName: 'Lorcan Medical College',
    payerName: 'Student',
    payerAccount: null,
    status: null,
    statusKnown: false,
    statusOk: null,
    date: null,
    raw: {},
  };

  const dashenDto: VerifyReceiptDto = {
    planId: plan.id,
    bank: 'dashen',
    url: 'https://receipt.dashensuperapp.com/receipt/TX-123',
  };

  beforeEach(() => {
    findPlan.mockReset().mockResolvedValue(plan);
    findPending.mockReset().mockResolvedValue(null);
    findPayment.mockReset().mockResolvedValue(null);
    findSubscription.mockReset().mockResolvedValue(null);
    createdData = {};
    createPayment.mockClear();
    extract.mockReset();
  });

  it.each([
    [
      'wrong receiver',
      { receiverAccount: '9999123456789' },
      /not made to the college receiving account/,
    ],
    ['underpayment', { amount: 999 }, /less than the plan price/],
    [
      'failed bank status',
      { statusKnown: true, statusOk: false, status: 'FAILED' },
      /Bank reports transaction status "FAILED"/,
    ],
  ])('records and rejects a confirmed %s', async (_name, override, message) => {
    extract.mockResolvedValue({
      ok: true,
      receipt: { ...validReceipt, ...override },
    });

    await expect(
      service.verifyAndSubmit('student-1', dashenDto),
    ).rejects.toThrow(message);

    expect(createdData.status).toBe('REJECTED');
    expect(String(createdData.rejectionReason)).toMatch(message);
    expect(createdData.bankReference).toBe('TX-123');
  });

  it('preserves submitted evidence when the verifier is unreachable', async () => {
    extract.mockResolvedValue({
      ok: false,
      code: 'UNREACHABLE',
      message: 'timed out',
    });

    const result = await service.verifyAndSubmit('student-1', dashenDto);

    expect(result).toEqual(
      expect.objectContaining({ status: 'PENDING', needsReview: true }),
    );
    expect(createdData.verification).toMatchObject({
      verifierCode: 'UNREACHABLE',
      submittedUrl: dashenDto.url,
    });
  });

  it('routes incomplete extracted evidence to review instead of approving', async () => {
    extract.mockResolvedValue({
      ok: true,
      receipt: { ...validReceipt, receiverAccount: null },
    });

    const result = await service.verifyAndSubmit('student-1', dashenDto);

    expect(result).toEqual(
      expect.objectContaining({ status: 'PENDING', needsReview: true }),
    );
    const verification = createdData.verification as Record<string, unknown>;
    expect(String(verification.reviewNote)).toMatch(
      /Receiver account not present/,
    );
    expect(verification.amount).toBe(1000);
    expect(verification.submittedUrl).toBe(dashenDto.url);
  });

  it('restricts CBE lookup digits to a configured college account', async () => {
    const dto: VerifyReceiptDto = {
      planId: plan.id,
      bank: 'cbe',
      reference: 'FT123',
      account: '87654321',
    };

    await expect(service.verifyAndSubmit('student-1', dto)).rejects.toThrow(
      'The CBE account must match the college receiving account.',
    );
    expect(extract).not.toHaveBeenCalled();
  });

  it('requires at least eight digits for CBE lookup', async () => {
    const dto: VerifyReceiptDto = {
      planId: plan.id,
      bank: 'cbe',
      reference: 'FT123',
      account: '56789',
    };

    await expect(service.verifyAndSubmit('student-1', dto)).rejects.toThrow(
      'CBE verification requires at least 8 account digits.',
    );
    expect(extract).not.toHaveBeenCalled();
  });

  it('normalizes a Telebirr receipt URL as URL evidence, not a reference', async () => {
    const url = 'https://transactioninfo.ethiotelecom.et/receipt/CHQ0FJ403O';
    extract.mockResolvedValue({
      ok: false,
      code: 'UNREACHABLE',
      message: 'timed out',
    });

    await service.verifyAndSubmit('student-1', {
      planId: plan.id,
      bank: 'tele',
      reference: url,
    });

    expect(extract).toHaveBeenCalledWith({
      bank: 'tele',
      reference: undefined,
      url,
      account: undefined,
    });
    expect(createdData.bankReference).toBeNull();
    expect(createdData.verification).toMatchObject({ submittedUrl: url });
  });

  it('blocks admin approval when only a review note was stored', async () => {
    findPayment.mockResolvedValue({
      id: 'payment-1',
      status: 'PENDING',
      method: 'MANUAL',
      receiptPath: null,
      bankReference: null,
      verification: { reviewNote: 'Verifier unavailable' },
      chapaRef: null,
      plan,
      user: {
        id: 'student-1',
        fullName: 'Student',
        email: 'student@example.com',
        phoneNumber: null,
      },
    });

    await expect(service.approve('payment-1', 'admin-1')).rejects.toThrow(
      'This payment has no receipt or bank evidence and cannot be approved.',
    );
  });

  it('blocks manual admin approval of pending Chapa payments', async () => {
    findPayment.mockResolvedValue({
      id: 'payment-1',
      status: 'PENDING',
      method: 'CHAPA',
      receiptPath: null,
      bankReference: null,
      verification: null,
      chapaRef: null,
      plan,
      user: {
        id: 'student-1',
        fullName: 'Student',
        email: 'student@example.com',
        phoneNumber: null,
      },
    });

    await expect(service.approve('payment-1', 'admin-1')).rejects.toThrow(
      'Chapa payments can only be approved after successful Chapa verification.',
    );
  });

  it('blocks admin override of a legacy pending wrong-receiver receipt', async () => {
    findPayment.mockResolvedValue({
      id: 'payment-1',
      status: 'PENDING',
      method: 'MANUAL',
      receiptPath: null,
      bankReference: 'TX-123',
      verification: {
        ...validReceipt,
        receiverAccount: '9999123456789',
        reviewNote: 'Needs review',
      },
      chapaRef: null,
      plan,
      user: {
        id: 'student-1',
        fullName: 'Student',
        email: 'student@example.com',
        phoneNumber: null,
      },
    });

    await expect(service.approve('payment-1', 'admin-1')).rejects.toThrow(
      /cannot be approved: Payment was not made to the college receiving account/,
    );
  });

  it('uses domain exceptions rather than leaking internal errors', async () => {
    extract.mockResolvedValue({
      ok: true,
      receipt: { ...validReceipt, receiverAccount: '9999123456789' },
    });

    await expect(
      service.verifyAndSubmit('student-1', dashenDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
