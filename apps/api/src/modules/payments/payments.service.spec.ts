import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ReceiptService } from './receipt.service';
import type {
  NormalizedReceipt,
  ReceiptVerifierService,
  VerifierResult,
} from './receipt-verifier.service';
import type { ChekiService } from './cheki.service';
import { PaymentsService } from './payments.service';
import type { PaymentStateMachine } from './payment-state-machine';
import type { VerifyReceiptDto } from './dto/verify-receipt.dto';

// The upload path validates the file's magic bytes from disk; unit tests use
// fake paths. The validator itself is covered by its own util tests and the
// live E2E runs.
jest.mock('../../common/utils/image-magic-bytes', () => ({
  assertValidImageFile: jest.fn(),
}));

describe('PaymentsService bank verification security', () => {
  interface PaymentCreateInput {
    data: Record<string, unknown>;
  }

  const findPlan = jest.fn();
  const findPending = jest.fn();
  const findPayment = jest.fn();
  const findPayments = jest.fn();
  const findPaymentGroups = jest.fn();
  const findSubscription = jest.fn();
  const findBank = jest.fn();
  const findBanks = jest.fn();
  const findBankByAccount = jest.fn();
  const upsertBank = jest.fn();
  const updateBank = jest.fn();
  const deleteBanks = jest.fn();
  let createdData: Record<string, unknown> = {};
  const createPayment = jest.fn(
    (input: PaymentCreateInput): Promise<{ id: string }> => {
      createdData = input.data;
      return Promise.resolve({ id: 'payment-1' });
    },
  );
  const extract = jest.fn<Promise<VerifierResult>, [unknown]>();

  const prisma = {
    subscriptionPlan: { findUnique: findPlan },
    payment: {
      findFirst: findPending,
      findUnique: findPayment,
      findMany: findPayments,
      groupBy: findPaymentGroups,
      create: createPayment,
    },
    subscription: { findUnique: findSubscription },
    acceptedBank: {
      findUnique: findBank,
      findFirst: findBankByAccount,
      findMany: findBanks,
      upsert: upsertBank,
      update: updateBank,
      deleteMany: deleteBanks,
    },
    $transaction: jest.fn(
      (fn: (client: unknown) => Promise<unknown>): Promise<unknown> =>
        fn(txMock),
    ),
  } as unknown as PrismaService;

  const txMock = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    payment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    },
    notification: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };

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

  const cheki = {
    enabled: false,
    verify: jest.fn(),
  } as unknown as ChekiService;

  const states = {
    transition: jest.fn().mockResolvedValue(true),
    recordEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as PaymentStateMachine;

  const service = new PaymentsService(
    prisma,
    receipts,
    config,
    verifier,
    cheki,
    states,
  );

  // A second instance with Cheki acting as the primary source.
  const chekiEnabled = {
    enabled: true,
    verify: jest.fn(),
    scanReceiptImage: jest.fn(),
  } as unknown as ChekiService;

  const serviceWithCheki = new PaymentsService(
    prisma,
    receipts,
    config,
    verifier,
    chekiEnabled,
    states,
  );

  const plan = {
    id: 'plan-1',
    name: 'Semester',
    priceETB: new Prisma.Decimal(1000),
    durationMonths: 6,
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
    findPayments.mockReset().mockResolvedValue([]);
    findPaymentGroups.mockReset().mockResolvedValue([]);
    findSubscription.mockReset().mockResolvedValue(null);
    // Every catalog bank is enabled by default in these tests; individual
    // cases override this to exercise the disabled/unknown path.
    findBank
      .mockReset()
      .mockImplementation(({ where }: { where: { code: string } }) =>
        Promise.resolve({ code: where.code, isActive: true }),
      );
    // No admin-managed accounts by default; the env fallback in the config
    // mock still provides the standard college account.
    findBanks.mockReset().mockResolvedValue([]);
    findBankByAccount.mockReset().mockResolvedValue(null);
    upsertBank.mockReset();
    updateBank.mockReset();
    deleteBanks.mockReset();
    createdData = {};
    createPayment.mockClear();
    extract.mockReset();
  });

  it('keeps unconfirmed Chapa checkouts out of the admin review queue', async () => {
    await service.findAllAdmin();

    expect(findPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          NOT: {
            method: 'CHAPA',
            chapaRef: null,
            status: { not: 'APPROVED' },
          },
        },
      }),
    );
  });

  it('filters the admin queue by tab status and returns counts for every tab', async () => {
    findPaymentGroups.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 3 } },
      { status: 'APPROVED', _count: { _all: 5 } },
      { status: 'REVERSED', _count: { _all: 1 } },
    ]);
    findPayments.mockResolvedValue([{ id: 'pay-rejected' }]);

    const result = await service.findAllAdmin({ status: 'REJECTED' });

    expect(findPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          NOT: {
            method: 'CHAPA',
            chapaRef: null,
            status: { not: 'APPROVED' },
          },
          status: 'REJECTED',
        },
      }),
    );
    expect(result.payments).toEqual([{ id: 'pay-rejected' }]);
    expect(result.counts).toEqual({
      PENDING: 3,
      APPROVED: 5,
      REJECTED: 0,
      REVERSED: 1,
    });
  });

  it('ignores an unknown tab status instead of trusting it', async () => {
    await service.findAllAdmin({ status: 'ARCHIVED' });

    expect(findPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          NOT: {
            method: 'CHAPA',
            chapaRef: null,
            status: { not: 'APPROVED' },
          },
        },
      }),
    );
  });

  it('scopes the admin queue and the counts to the search term', async () => {
    findPayments.mockResolvedValue([]);
    findPaymentGroups.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 1 } },
    ]);

    const result = await service.findAllAdmin({
      status: 'PENDING',
      search: '  Wend ',
    });

    const userFilter = {
      OR: [
        { fullName: { contains: 'Wend', mode: 'insensitive' } },
        { email: { contains: 'Wend', mode: 'insensitive' } },
        { phoneNumber: { contains: 'Wend', mode: 'insensitive' } },
      ],
    };
    expect(findPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          user: userFilter,
        }),
      }),
    );
    expect(findPaymentGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: userFilter }),
      }),
    );
    expect(result.counts.PENDING).toBe(1);
  });

  it('drops a whitespace-only search term', async () => {
    await service.findAllAdmin({ search: '   ' });

    expect(findPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          NOT: {
            method: 'CHAPA',
            chapaRef: null,
            status: { not: 'APPROVED' },
          },
        },
      }),
    );
  });

  it('hides an unconfirmed Chapa checkout from the student payment history', async () => {
    await service.findMine('student-1');

    expect(findPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'student-1',
          NOT: {
            method: 'CHAPA',
            chapaRef: null,
            status: { not: 'APPROVED' },
          },
        },
      }),
    );
  });

  it('does not let an in-progress Chapa checkout block a manual payment', async () => {
    extract.mockResolvedValue({
      ok: true,
      receipt: { ...validReceipt, receiverAccount: null },
    });

    await service.verifyAndSubmit('student-1', dashenDto);

    expect(findPending).toHaveBeenCalledWith({
      where: { userId: 'student-1', status: 'PENDING', method: 'MANUAL' },
    });
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

  it('rejects an underpayment with the exact expected/received/shortfall amounts', async () => {
    extract.mockResolvedValue({
      ok: true,
      receipt: { ...validReceipt, amount: 850.5 },
    });

    await expect(
      service.verifyAndSubmit('student-1', dashenDto),
    ).rejects.toThrow(
      'Amount paid (850.50 ETB) is less than the plan price (1000.00 ETB); shortfall 149.50 ETB.',
    );

    expect(createdData.status).toBe('REJECTED');
    expect(String(createdData.rejectionReason)).toContain(
      'shortfall 149.50 ETB',
    );
    // no manual-review excess on a hard reject
    expect(createdData.excessAmount).toBeUndefined();
  });

  it('routes an overpayment to manual review, records the excess on the payment and tells the student', async () => {
    extract.mockResolvedValue({
      ok: true,
      receipt: { ...validReceipt, amount: 1001 },
    });

    const result = await service.verifyAndSubmit('student-1', dashenDto);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        autoApproved: false,
        needsReview: true,
      }),
    );
    expect(createdData.status).toBeUndefined(); // defaults to PENDING
    expect(createdData.bankReference).toBe('TX-123');
    // excess is recorded on the payment for the college to refund or credit
    expect((createdData.excessAmount as Prisma.Decimal).toString()).toBe('1');
    const verification = createdData.verification as Record<string, unknown>;
    expect(String(verification.reviewNote)).toContain('excess 1.00 ETB');
    expect(verification.amount).toBe(1001);
    // the plan is snapshotted on the payment at creation (not read live later)
    expect(createdData.planName).toBe('Semester');
    expect(createdData.planDurationMonths).toBe(6);
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

  it('cannot have its price altered by extra client-supplied fields', async () => {
    extract.mockResolvedValue({
      ok: true,
      receipt: { ...validReceipt, receiverAccount: null },
    });
    const tampered = {
      ...dashenDto,
      amount: 1,
      priceETB: 1,
      durationMonths: 120,
    } as VerifyReceiptDto;

    await service.verifyAndSubmit('student-1', tampered);

    // The stored amount always comes from the server-side plan row.
    expect(createdData.amount).toEqual(new Prisma.Decimal(1000));
  });

  // ── Cheki-primary path (mocked adapter) ──────────────────────────
  describe('Cheki-primary verification', () => {
    const chekiVerify = chekiEnabled.verify as unknown as jest.Mock;

    const chekiReceipt: NormalizedReceipt = {
      bank: 'dashen',
      reference: 'TX-123',
      amount: 1000,
      currency: 'ETB',
      receiverAccount: '1000123456789',
      receiverName: 'Lorcan Medical College',
      payerName: 'Student',
      payerAccount: null,
      status: null,
      statusKnown: false,
      statusOk: null,
      date: null,
      source: 'cheki',
      raw: { source: 'cheki', verified: true },
    };

    beforeEach(() => {
      chekiVerify.mockReset();
    });

    it('auto-approves a Cheki-verified receipt without calling the local verifier', async () => {
      chekiVerify.mockResolvedValue({
        kind: 'VERIFIED',
        receipt: chekiReceipt,
        cached: false,
      });
      findPayment
        .mockResolvedValueOnce(null) // assertReferenceUnused: not used yet
        .mockResolvedValueOnce({
          // finalizeApproval loads the payment
          id: 'payment-1',
          status: 'PENDING',
          userId: 'student-1',
          planId: 'plan-1',
          chapaRef: null,
          method: 'MANUAL',
          amount: new Prisma.Decimal(1000),
          currency: 'ETB',
          plan,
          user: {
            id: 'student-1',
            fullName: 'Student',
            email: 'student@example.com',
            phoneNumber: null,
          },
        });
      (receipts.buildReceiptNumber as jest.Mock).mockReturnValue('LM-TEST-1');

      const result = await serviceWithCheki.verifyAndSubmit(
        'student-1',
        dashenDto,
      );

      expect(extract).not.toHaveBeenCalled();
      expect(chekiVerify).toHaveBeenCalledTimes(1);
      expect(createdData.amount).toEqual(new Prisma.Decimal(1000));
      expect((createdData.verification as Record<string, unknown>).source).toBe(
        'cheki',
      );
      expect(result).toMatchObject({
        status: 'APPROVED',
        autoApproved: true,
        message: 'Payment verified and your subscription is now active.',
      });
      expect(txMock.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'student-1',
          planId: 'plan-1',
          status: 'ACTIVE',
        }),
      });
    });

    it('derives BOA lookup digits from the admin-configured receiving account', async () => {
      findBank.mockResolvedValueOnce({
        code: 'boa',
        isActive: true,
        accountNumber: '85802844',
      });
      chekiVerify.mockResolvedValue({
        kind: 'FAILED',
        code: 'RATE_LIMITED',
        message: 'rate limit hit',
      });
      extract.mockResolvedValue({
        ok: false,
        code: 'URL_REQUIRED',
        message: 'BOA lookups need a full receipt URL',
      });

      const dto: VerifyReceiptDto = {
        planId: plan.id,
        bank: 'boa',
        reference: 'BOA-TX-1',
      };

      const result = await serviceWithCheki.verifyAndSubmit('student-1', dto);

      expect(chekiVerify).toHaveBeenCalledWith({
        bank: 'boa',
        reference: 'BOA-TX-1',
        url: undefined,
        account: '02844',
      });
      expect(extract).toHaveBeenCalledWith({
        bank: 'boa',
        reference: 'BOA-TX-1',
        url: undefined,
        account: '02844',
      });
      expect(result).toMatchObject({ status: 'PENDING', needsReview: true });
    });

    it.each([
      ['underpayment', { amount: 999 }, /less than the plan price/],
      ['wrong currency', { currency: 'USD' }, /is not ETB/],
      [
        'wrong receiver',
        { receiverAccount: '9999123456789' },
        /not made to the college receiving account/,
      ],
    ])(
      'rejects a Cheki-verified receipt with %s',
      async (_name, override, message) => {
        chekiVerify.mockResolvedValue({
          kind: 'VERIFIED',
          receipt: { ...chekiReceipt, ...override },
          cached: false,
        });

        await expect(
          serviceWithCheki.verifyAndSubmit('student-1', dashenDto),
        ).rejects.toThrow(message);

        expect(createdData.status).toBe('REJECTED');
        expect(extract).not.toHaveBeenCalled();
      },
    );

    it('falls back to the local verifier when Cheki only decoded the receipt', async () => {
      chekiVerify.mockResolvedValue({
        kind: 'DECODED_ONLY',
        message: 'decoded only',
      });
      extract.mockResolvedValue({
        ok: true,
        receipt: { ...validReceipt, receiverAccount: null },
      });

      const result = await serviceWithCheki.verifyAndSubmit(
        'student-1',
        dashenDto,
      );

      expect(extract).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ status: 'PENDING', needsReview: true });
      expect(createdData.verification).toMatchObject({
        chekiCode: 'DECODED_ONLY',
        source: 'local',
      });
    });

    it('falls back to the local verifier when Cheki is unreachable', async () => {
      chekiVerify.mockResolvedValue({
        kind: 'FAILED',
        code: 'UNREACHABLE',
        message: 'timed out',
      });
      extract.mockResolvedValue({
        ok: true,
        receipt: { ...validReceipt, receiverAccount: null },
      });

      const result = await serviceWithCheki.verifyAndSubmit(
        'student-1',
        dashenDto,
      );

      expect(extract).toHaveBeenCalledTimes(1);
      expect(createdData.verification).toMatchObject({
        chekiCode: 'UNREACHABLE',
        source: 'local',
      });
      expect(result).toMatchObject({ status: 'PENDING' });
    });

    it('routes to manual review when both Cheki and the local verifier fail', async () => {
      chekiVerify.mockResolvedValue({
        kind: 'FAILED',
        code: 'RATE_LIMITED',
        message: 'rate limit hit',
      });
      extract.mockResolvedValue({
        ok: false,
        code: 'UNREACHABLE',
        message: 'timed out',
      });

      const result = await serviceWithCheki.verifyAndSubmit(
        'student-1',
        dashenDto,
      );

      expect(result).toMatchObject({ status: 'PENDING', needsReview: true });
      expect(createdData.verification).toMatchObject({
        verifierCode: 'UNREACHABLE',
        chekiCode: 'RATE_LIMITED',
      });
    });

    it('rejects duplicate Cheki-verified references before any approval', async () => {
      chekiVerify.mockResolvedValue({
        kind: 'VERIFIED',
        receipt: chekiReceipt,
        cached: false,
      });
      findPayment.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        serviceWithCheki.verifyAndSubmit('student-1', dashenDto),
      ).rejects.toThrow('This receipt has already been submitted.');
      expect(createPayment).not.toHaveBeenCalled();
    });

    it('survives a concurrent duplicate (P2002) without granting access', async () => {
      chekiVerify.mockResolvedValue({
        kind: 'VERIFIED',
        receipt: chekiReceipt,
        cached: false,
      });
      findPayment.mockResolvedValueOnce(null);
      createPayment.mockImplementationOnce(() =>
        Promise.reject({ code: 'P2002' }),
      );

      await expect(
        serviceWithCheki.verifyAndSubmit('student-1', dashenDto),
      ).rejects.toThrow('This receipt has already been submitted.');
    });
  });

  describe('upload QR auto-verification (Cheki OCR)', () => {
    const scan = chekiEnabled.scanReceiptImage as unknown as jest.Mock;
    const chekiVerify = chekiEnabled.verify as unknown as jest.Mock;
    let readFileSpy: jest.SpyInstance;

    const uploadFile = {
      path: 'uploads/receipts/upload-x.png',
      filename: 'upload-x.png',
      mimetype: 'image/png',
    } as unknown as Express.Multer.File;

    const verifiedCbeReceipt: NormalizedReceipt = {
      bank: 'cbe',
      reference: 'fHCxExampleRcpt01',
      amount: 1000,
      currency: 'ETB',
      receiverAccount: '1000123456789',
      receiverName: 'Lorcan Medical College',
      payerName: 'Student',
      payerAccount: null,
      status: null,
      statusKnown: false,
      statusOk: null,
      date: null,
      source: 'cheki',
      raw: { source: 'cheki', verified: true },
    };

    const mbrecieptScan = {
      kind: 'FOUND',
      bankCode: 'cbe',
      bank: 'cbe',
      reference: 'fHCxExampleRcpt01',
      text: 'https://mbreciept.cbe.com.et/fHCxExampleRcpt01',
    };

    beforeEach(() => {
      scan.mockReset();
      chekiVerify.mockReset();
      readFileSpy = jest
        .spyOn(fs.promises, 'readFile')
        .mockResolvedValue(Buffer.from('fake-image-bytes'));
    });

    afterEach(() => {
      readFileSpy.mockRestore();
    });

    it('auto-approves an uploaded screenshot whose QR the bank confirms', async () => {
      scan.mockResolvedValue(mbrecieptScan);
      chekiVerify.mockResolvedValue({
        kind: 'VERIFIED',
        receipt: verifiedCbeReceipt,
        cached: false,
      });
      (receipts.buildReceiptNumber as jest.Mock).mockReturnValue('LM-TEST-OCR');
      findPayment
        .mockResolvedValueOnce(null) // assertReferenceUnused: not used yet
        .mockResolvedValueOnce({
          // finalizeApproval loads the payment
          id: 'payment-1',
          status: 'PENDING',
          userId: 'student-1',
          planId: 'plan-1',
          chapaRef: null,
          method: 'MANUAL',
          amount: new Prisma.Decimal(1000),
          currency: 'ETB',
          plan,
          user: {
            id: 'student-1',
            fullName: 'Student',
            email: 'student@example.com',
            phoneNumber: null,
          },
        });

      const result = await serviceWithCheki.submit(
        'student-1',
        'plan-1',
        uploadFile,
      );

      expect(scan).toHaveBeenCalledWith(expect.any(Buffer), {
        filename: 'upload-x.png',
        mimeType: 'image/png',
      });
      expect(chekiVerify).toHaveBeenCalledWith({
        bank: 'cbe',
        reference: undefined,
        url: 'https://mbreciept.cbe.com.et/fHCxExampleRcpt01',
      });
      expect(extract).not.toHaveBeenCalled();
      expect(createdData.receiptPath).toBe('upload-x.png');
      expect((createdData.verification as Record<string, unknown>).ocr).toEqual(
        { via: 'cheki-ocr', bankCode: 'cbe' },
      );
      expect(result).toMatchObject({
        status: 'APPROVED',
        autoApproved: true,
        message: 'Payment verified and your subscription is now active.',
      });
      expect(txMock.subscription.create).toHaveBeenCalled();
    });

    it('keeps the screenshot in PENDING review when the QR cannot be bank-confirmed', async () => {
      scan.mockResolvedValue({
        kind: 'FOUND',
        bankCode: 'dashen',
        bank: 'dashen',
        reference: 'TX-123',
        text: 'https://receipt.dashensuperapp.com/receipt/TX-123',
      });
      chekiVerify.mockResolvedValue({
        kind: 'FAILED',
        code: 'RATE_LIMITED',
        message: 'rate limit',
      });
      extract.mockResolvedValue({
        ok: false,
        code: 'UNREACHABLE',
        message: 'verifier down',
      });

      const result = await serviceWithCheki.submit(
        'student-1',
        'plan-1',
        uploadFile,
      );

      expect(result).toMatchObject({
        status: 'PENDING',
        autoApproved: false,
        needsReview: true,
      });
      expect(createdData.receiptPath).toBe('upload-x.png');
      const verification = createdData.verification as Record<string, unknown>;
      expect(verification.chekiCode).toBe('RATE_LIMITED');
      expect(verification.verifierCode).toBe('UNREACHABLE');
      expect(verification.ocr).toEqual({
        via: 'cheki-ocr',
        bankCode: 'dashen',
      });
    });

    it('blocks a replayed QR receipt exactly like the reference flow', async () => {
      scan.mockResolvedValue(mbrecieptScan);
      chekiVerify.mockResolvedValue({
        kind: 'VERIFIED',
        receipt: verifiedCbeReceipt,
        cached: false,
      });
      findPayment.mockResolvedValueOnce({ id: 'existing-payment' });

      await expect(
        serviceWithCheki.submit('student-1', 'plan-1', uploadFile),
      ).rejects.toThrow('This receipt has already been submitted.');
      expect(createPayment).not.toHaveBeenCalled();
    });

    it('records a confirmed underpayment from a QR as REJECTED and keeps the image', async () => {
      scan.mockResolvedValue(mbrecieptScan);
      chekiVerify.mockResolvedValue({
        kind: 'VERIFIED',
        receipt: { ...verifiedCbeReceipt, amount: 999 },
        cached: false,
      });

      await expect(
        serviceWithCheki.submit('student-1', 'plan-1', uploadFile),
      ).rejects.toThrow(/less than the plan price/);

      expect(createdData.status).toBe('REJECTED');
      expect(createdData.receiptPath).toBe('upload-x.png');
      expect(extract).not.toHaveBeenCalled();
    });

    it('keeps an overpaid QR receipt in manual review instead of auto-approving', async () => {
      scan.mockResolvedValue(mbrecieptScan);
      chekiVerify.mockResolvedValue({
        kind: 'VERIFIED',
        receipt: { ...verifiedCbeReceipt, amount: 1001 },
        cached: false,
      });

      const result = await serviceWithCheki.submit(
        'student-1',
        'plan-1',
        uploadFile,
      );

      expect(result).toMatchObject({
        status: 'PENDING',
        autoApproved: false,
        needsReview: true,
      });
      expect(createdData.status).toBeUndefined();
      expect(createdData.receiptPath).toBe('upload-x.png');
      const verification = createdData.verification as Record<string, unknown>;
      expect(String(verification.reviewNote)).toMatch(
        /greater than the plan price/,
      );
      expect(verification.amount).toBe(1001);
      expect(verification.ocr).toEqual({ via: 'cheki-ocr', bankCode: 'cbe' });
    });

    it('falls back to the standard manual review when the image has no QR', async () => {
      scan.mockResolvedValue({ kind: 'NONE' });

      const result = await serviceWithCheki.submit(
        'student-1',
        'plan-1',
        uploadFile,
      );

      expect(chekiVerify).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'PENDING', needsReview: true });
      expect(createdData.receiptPath).toBe('upload-x.png');
      const verification = createdData.verification as Record<string, unknown>;
      expect(verification.reviewNote).toBe(
        'Uploaded receipt is awaiting manual review.',
      );
      expect(verification.ocr).toEqual({ via: 'cheki-ocr', result: 'no-qr' });
    });

    it('routes a bare CBE reference QR to review without any bank call', async () => {
      scan.mockResolvedValue({
        kind: 'FOUND',
        bankCode: 'cbe',
        bank: 'cbe',
        reference: 'FT26140P01YB',
        text: 'FT26140P01YB',
      });

      const result = await serviceWithCheki.submit(
        'student-1',
        'plan-1',
        uploadFile,
      );

      expect(chekiVerify).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'PENDING', needsReview: true });
      const verification = createdData.verification as Record<string, unknown>;
      expect(String(verification.reviewNote)).toMatch(/account digits/);
    });

    it('sends unsupported QR banks to review with the provider code recorded', async () => {
      scan.mockResolvedValue({
        kind: 'FOUND',
        bankCode: 'nib',
        bank: null,
        reference: 'NIB-REF-123',
        text: 'raw-qr',
      });

      const result = await serviceWithCheki.submit(
        'student-1',
        'plan-1',
        uploadFile,
      );

      expect(chekiVerify).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
      expect(createdData.bankName).toBe('nib');
      expect(result).toMatchObject({ status: 'PENDING', needsReview: true });
      const verification = createdData.verification as Record<string, unknown>;
      expect(String(verification.reviewNote)).toMatch(/nib/);
    });

    it('skips OCR entirely when the Cheki adapter is disabled', async () => {
      const result = await service.submit('student-1', 'plan-1', uploadFile);

      expect(scan).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'PENDING', needsReview: true });
      const verification = createdData.verification as Record<string, unknown>;
      expect(verification.ocr).toEqual({
        via: 'cheki-ocr',
        result: 'unavailable',
        code: 'NOT_CONFIGURED',
      });
    });
  });

  describe('admin-managed accepted banks', () => {
    it('rejects a bank that is not enabled for the college', async () => {
      findBank.mockResolvedValueOnce(null);

      await expect(
        service.verifyAndSubmit('student-1', dashenDto),
      ).rejects.toThrow(
        'This bank is not currently accepted for payment. Please contact the college.',
      );

      expect(extract).not.toHaveBeenCalled();
      expect(createPayment).not.toHaveBeenCalled();
    });

    it('queues a manual-review bank without calling any verifier', async () => {
      const dto: VerifyReceiptDto = {
        planId: plan.id,
        bank: 'abay',
        reference: 'ABY-123456',
      };

      const result = await service.verifyAndSubmit('student-1', dto);

      expect(result).toEqual(
        expect.objectContaining({ status: 'PENDING', needsReview: true }),
      );
      expect(extract).not.toHaveBeenCalled();
      expect(createdData.bankName).toBe('abay');
      expect(createdData.bankReference).toBe('ABY-123456');
      const verification = createdData.verification as Record<string, unknown>;
      expect(String(verification.reviewNote)).toMatch(/verified manually/);
    });

    it('returns only enabled adopted banks in catalog order', async () => {
      findBanks.mockResolvedValueOnce([{ code: 'dashen' }, { code: 'cbe' }]);

      const banks = await service.getAcceptedBanks();

      expect(banks.map((b) => b.code)).toEqual(['cbe', 'dashen']);
      expect(banks.every((b) => b.auto)).toBe(true);
    });

    it('refuses to add a bank outside the catalog', async () => {
      await expect(service.addBank('not-a-bank')).rejects.toThrow(
        'Unknown bank.',
      );
      expect(upsertBank).not.toHaveBeenCalled();
    });
  });

  describe('college receiving accounts', () => {
    it('stores a digit-only account with the bank-specific Cheki rule applied', async () => {
      await service.setBankAccount('cbe', {
        accountNumber: '1000-4239-23036',
        accountName: '  LOR MENTOR PLC  ',
      });

      expect(updateBank).toHaveBeenCalledWith({
        where: { code: 'cbe' },
        data: {
          accountNumber: '1000423923036',
          accountName: 'LOR MENTOR PLC',
        },
      });
    });

    it('rejects an account shorter than the full-account floor', async () => {
      await expect(
        service.setBankAccount('cbe', { accountNumber: '1234567' }),
      ).rejects.toThrow(/at least 8 digits/);
      expect(updateBank).not.toHaveBeenCalled();
    });

    it('rejects an account already assigned to another bank', async () => {
      findBankByAccount.mockResolvedValueOnce({ code: 'boa' });

      await expect(
        service.setBankAccount('cbe', { accountNumber: '1000123456789' }),
      ).rejects.toThrow(/already assigned to another bank/);
      expect(updateBank).not.toHaveBeenCalled();
    });

    it('clears a receiving account without deleting the bank', async () => {
      await service.clearBankAccount('cbe');

      expect(updateBank).toHaveBeenCalledWith({
        where: { code: 'cbe' },
        data: { accountNumber: null, accountName: null },
      });
      expect(deleteBanks).not.toHaveBeenCalled();
    });

    it('returns only admin-managed accounts to students', async () => {
      findBanks.mockResolvedValueOnce([
        { code: 'cbe', accountNumber: '1000123456789', accountName: 'Lorcan' },
        { code: 'boa', accountNumber: '85802844', accountName: null },
      ]);

      const accounts = await service.getBankAccounts();

      expect(accounts.map((account) => account.accountNumber)).toEqual([
        '1000123456789',
        '85802844',
      ]);
      expect(accounts[0]).toMatchObject({
        bankCode: 'cbe',
        label: 'Commercial Bank of Ethiopia (CBE)',
        accountName: 'Lorcan',
        source: 'database',
      });
    });

    it('does not list legacy env-only accounts as transfer destinations', async () => {
      const envOnlyConfig = {
        get: jest.fn((key: string) =>
          key === 'COMPANY_BANK_ACCOUNTS' ? '9999999999' : undefined,
        ),
      } as unknown as ConfigService;
      const envOnlyService = new PaymentsService(
        prisma,
        receipts,
        envOnlyConfig,
        verifier,
        cheki,
        states,
      );

      findBanks.mockResolvedValueOnce([]);

      await expect(envOnlyService.getBankAccounts()).resolves.toEqual([]);
    });
  });
});

describe('PaymentsService.reverse — super-admin payment reversal', () => {
  const findPayment = jest.fn<Promise<unknown>, [unknown]>();
  const countApproved = jest.fn<Promise<number>, [unknown]>();
  const transition = jest.fn<Promise<boolean>, [unknown, unknown, unknown]>();
  const cancelSubs = jest.fn<Promise<{ count: number }>, [unknown]>();
  const notify = jest.fn<Promise<unknown>, [unknown]>();
  const audit = jest.fn<Promise<unknown>, [unknown]>();

  const tx = {
    payment: { count: countApproved },
    subscription: { updateMany: cancelSubs },
    notification: { create: notify },
    auditLog: { create: audit },
  };

  const prisma = {
    payment: { findUnique: findPayment },
    $transaction: jest.fn((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;

  const states = {
    transition,
    recordEvent: jest.fn(),
  } as unknown as PaymentStateMachine;

  const service = new PaymentsService(
    prisma,
    {} as unknown as ReceiptService,
    {} as unknown as ConfigService,
    {} as unknown as ReceiptVerifierService,
    {} as unknown as ChekiService,
    states,
  );

  const approvedPayment = {
    id: 'pay-1',
    status: 'APPROVED',
    userId: 'student-1',
    receiptNumber: 'LMC-2026-0001',
    plan: { name: 'Semester' },
  };

  beforeEach(() => {
    findPayment.mockReset().mockResolvedValue(approvedPayment);
    transition.mockReset().mockResolvedValue(true);
    countApproved.mockReset().mockResolvedValue(0);
    cancelSubs.mockReset().mockResolvedValue({ count: 1 });
    notify.mockReset().mockResolvedValue({});
    audit.mockReset().mockResolvedValue({});
  });

  it('reverses an approved payment and cancels access when no other approval backs it', async () => {
    const result = await service.reverse(
      'pay-1',
      'super-1',
      'Refunded — duplicate payment',
    );

    expect(transition).toHaveBeenCalledTimes(1);
    const transitionArgs = transition.mock.calls[0][2] as {
      from: string[];
      to: string;
      data: Record<string, unknown>;
    };
    expect(transitionArgs.from).toEqual(['APPROVED']);
    expect(transitionArgs.to).toBe('REVERSED');
    expect(transitionArgs.data.reversalReason).toBe(
      'Refunded — duplicate payment',
    );
    expect(transitionArgs.data.reversedBy).toBe('super-1');
    expect(transitionArgs.data.reversedAt).toBeInstanceOf(Date);

    expect(cancelSubs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'student-1',
          status: { in: ['ACTIVE', 'PENDING'] },
        },
      }),
    );

    const notifyArgs = notify.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(notifyArgs.data.type).toBe('PAYMENT_REVERSED');

    const auditArgs = audit.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(auditArgs.data.action).toBe('PAYMENT_REVERSED');
    expect(auditArgs.data.actorId).toBe('super-1');
    expect(auditArgs.data.entityId).toBe('pay-1');

    expect(result.accessRemoved).toBe(true);
  });

  it('keeps access when another approved payment still backs the subscription', async () => {
    countApproved.mockResolvedValue(1);

    const result = await service.reverse('pay-1', 'super-1', 'Wrong student');

    expect(cancelSubs).not.toHaveBeenCalled();
    expect(result.accessRemoved).toBe(false);
  });

  it('requires a reason before touching the payment', async () => {
    await expect(service.reverse('pay-1', 'super-1', '   ')).rejects.toThrow(
      BadRequestException,
    );
    expect(transition).not.toHaveBeenCalled();
  });

  it('rejects reversing a payment that is not approved', async () => {
    findPayment.mockResolvedValue({ ...approvedPayment, status: 'PENDING' });

    await expect(service.reverse('pay-1', 'super-1', 'reason')).rejects.toThrow(
      BadRequestException,
    );
    expect(transition).not.toHaveBeenCalled();
  });

  it('reports an already-reversed payment without touching it again', async () => {
    findPayment.mockResolvedValue({ ...approvedPayment, status: 'REVERSED' });

    const result = await service.reverse('pay-1', 'super-1', 'again');

    expect(result).toEqual({
      message: 'Payment has already been reversed',
      alreadyReversed: true,
    });
    expect(transition).not.toHaveBeenCalled();
  });

  it('reports a concurrent reversal as already reversed (lost the race)', async () => {
    transition.mockResolvedValue(false);

    const result = await service.reverse('pay-1', 'super-1', 'race');

    expect(result.alreadyReversed).toBe(true);
    expect(cancelSubs).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('throws when the payment does not exist', async () => {
    findPayment.mockResolvedValue(null);

    await expect(service.reverse('pay-1', 'super-1', 'reason')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PaymentsService plan snapshots on approval', () => {
  const findPayment = jest.fn();
  const findSubscription = jest.fn();
  const transition = jest.fn();
  const txPaymentUpdate = jest.fn();
  const txSubscriptionCreate = jest.fn();
  const txSubscriptionUpdate = jest.fn();
  const txNotificationCreate = jest.fn();
  const txAuditCreate = jest.fn();
  const buildReceiptNumber = jest.fn();
  const generateReceipt = jest.fn();

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    payment: { update: txPaymentUpdate },
    subscription: {
      findUnique: findSubscription,
      create: txSubscriptionCreate,
      update: txSubscriptionUpdate,
    },
    notification: { create: txNotificationCreate },
    auditLog: { create: txAuditCreate },
  };

  const prisma = {
    payment: { findUnique: findPayment },
    $transaction: jest.fn((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;

  const states = {
    transition,
    recordEvent: jest.fn(),
  } as unknown as PaymentStateMachine;

  const service = new PaymentsService(
    prisma,
    {
      buildReceiptNumber,
      generate: generateReceipt,
    } as unknown as ReceiptService,
    {} as unknown as ConfigService,
    {} as unknown as ReceiptVerifierService,
    {} as unknown as ChekiService,
    states,
  );

  // A payment captured while the plan was called "Semester 2026" for 1 month,
  // priced 1000 ETB. The live plan has since been renamed, repriced to 1500
  // and lengthened to 12 months.
  const snapshotPayment = {
    id: 'pay-1',
    userId: 'student-1',
    planId: 'plan-1',
    status: 'PENDING',
    method: 'MANUAL',
    amount: new Prisma.Decimal('1000'),
    currency: 'ETB',
    chapaRef: null,
    receiptNumber: null,
    receiptPath: 'receipt.png',
    bankReference: 'TX-1',
    verification: null,
    planName: 'Semester 2026',
    planDurationMonths: 1,
    plan: {
      name: 'Semester 2027 (renamed)',
      durationMonths: 12,
      priceETB: new Prisma.Decimal('1500'),
    },
    user: {
      fullName: 'Test Student',
      email: 's@example.com',
      phoneNumber: null,
    },
  };

  const paidAt = new Date(Date.UTC(2026, 0, 31, 10, 0, 0));

  beforeEach(() => {
    jest.clearAllMocks();
    findPayment.mockResolvedValue(snapshotPayment);
    findSubscription.mockResolvedValue(null);
    transition.mockResolvedValue(true);
    buildReceiptNumber.mockReturnValue('LM-2026-1');
    generateReceipt.mockResolvedValue(undefined);
    txSubscriptionCreate.mockResolvedValue({ id: 'sub-1' });
  });

  it('uses the snapshot name/duration/amount when the live plan changed after payment', async () => {
    await service.finalizeApproval('pay-1', {
      reviewedBy: 'admin-1',
      paidAt,
    });

    // Jan 31 + the snapshot's 1 month, clamped to Feb 28 — not the live 12 months.
    const subArgs = txSubscriptionCreate.mock.calls[0][0] as {
      data: { startDate: Date; endDate: Date };
    };
    expect(subArgs.data.startDate.toISOString()).toBe(
      '2026-01-31T10:00:00.000Z',
    );
    expect(subArgs.data.endDate.toISOString()).toBe('2026-02-28T10:00:00.000Z');

    // Receipt uses the snapshot name/duration/amount, never the live plan.
    const receiptArgs = generateReceipt.mock.calls[0][1] as {
      amount: string;
      plan: { name: string; durationMonths: number };
    };
    expect(receiptArgs.amount).toBe('1000.00');
    expect(receiptArgs.plan).toEqual({
      name: 'Semester 2026',
      durationMonths: 1,
    });

    // Notification and audit carry the snapshot name too.
    const notif = txNotificationCreate.mock.calls[0][0] as {
      data: { message: string };
    };
    expect(notif.data.message).toBe(
      'Your Semester 2026 subscription is now active.',
    );
    const audit = txAuditCreate.mock.calls[0][0] as {
      data: { meta: { planName: string } };
    };
    expect(audit.data.meta.planName).toBe('Semester 2026');
  });

  it('falls back to the live plan for old rows with no snapshot (no backfill)', async () => {
    findPayment.mockResolvedValue({
      ...snapshotPayment,
      planName: null,
      planDurationMonths: null,
    });

    await service.finalizeApproval('pay-1', { reviewedBy: 'admin-1', paidAt });

    const subArgs = txSubscriptionCreate.mock.calls[0][0] as {
      data: { endDate: Date };
    };
    expect(subArgs.data.endDate.toISOString()).toBe('2027-01-31T10:00:00.000Z');

    const receiptArgs = generateReceipt.mock.calls[0][1] as {
      plan: { name: string; durationMonths: number };
    };
    expect(receiptArgs.plan).toEqual({
      name: 'Semester 2027 (renamed)',
      durationMonths: 12,
    });

    const audit = txAuditCreate.mock.calls[0][0] as {
      data: { meta: { planName: string } };
    };
    expect(audit.data.meta.planName).toBe('Semester 2027 (renamed)');
  });

  it('extends an ACTIVE subscription from its current endDate with UTC end-of-month clamping', async () => {
    findSubscription.mockResolvedValue({
      id: 'sub-existing',
      status: 'ACTIVE',
      startDate: new Date(Date.UTC(2025, 6, 31, 10, 0, 0)),
      endDate: new Date(Date.UTC(2026, 0, 31, 10, 0, 0)),
    });
    txSubscriptionUpdate.mockResolvedValue({ id: 'sub-existing' });

    await service.finalizeApproval('pay-1', {
      reviewedBy: 'admin-1',
      paidAt: new Date(Date.UTC(2026, 0, 10, 9, 0, 0)),
    });

    // Not overwritten from "now": the current endDate (Jan 31) is the base,
    // +1 snapshot month clamps to Feb 28 in a non-leap year.
    const updateArgs = txSubscriptionUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: { startDate: Date; endDate: Date; status: string };
    };
    expect(updateArgs.where).toEqual({ id: 'sub-existing' });
    expect(updateArgs.data.startDate.toISOString()).toBe(
      '2025-07-31T10:00:00.000Z',
    );
    expect(updateArgs.data.endDate.toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
    expect(updateArgs.data.status).toBe('ACTIVE');
    expect(txSubscriptionCreate).not.toHaveBeenCalled();
  });

  it('starts a new term from now when the existing subscription already expired', async () => {
    findSubscription.mockResolvedValue({
      id: 'sub-expired',
      status: 'ACTIVE',
      startDate: new Date(Date.UTC(2024, 0, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(2024, 6, 1, 0, 0, 0)),
    });
    txSubscriptionUpdate.mockResolvedValue({ id: 'sub-expired' });

    const now = new Date(Date.UTC(2026, 0, 15, 8, 0, 0));
    await service.finalizeApproval('pay-1', {
      reviewedBy: 'admin-1',
      paidAt: now,
    });

    const updateArgs = txSubscriptionUpdate.mock.calls[0][0] as {
      data: { endDate: Date };
    };
    expect(updateArgs.data.endDate.toISOString()).toBe(
      '2026-02-15T08:00:00.000Z',
    );
  });
});
