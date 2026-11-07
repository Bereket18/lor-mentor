import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { PaymentStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptService } from './receipt.service';
import {
  ReceiptVerifierService,
  type NormalizedReceipt,
} from './receipt-verifier.service';
import { ChekiService } from './cheki.service';
import type { ChekiScanOutcome } from './cheki.service';
import type { VerifyReceiptDto } from './dto/verify-receipt.dto';
import type { SetBankAccountDto } from './dto/manage-bank.dto';
import { BANK_CATALOG, catalogBank } from './bank-catalog';
import { PaymentStateMachine } from './payment-state-machine';
import { PaymentEventType } from './payment-event.types';
import { addMonthsUtc } from './date-math';
import { formatETB, toDecimal } from './money';
import { assertValidImageFile } from '../../common/utils/image-magic-bytes';
import {
  extractLegacyCbeLinkDigits,
  isCompanyAccount,
} from '../../common/utils/bank-account-match';
import { isPrivileged } from '../../common/constants/roles';
import * as fs from 'fs';
import * as path from 'path';

type ReceiptDecision =
  | { outcome: 'APPROVE' }
  | { outcome: 'REVIEW' | 'REJECT'; reason: string; excess?: Prisma.Decimal };

export interface BankAccountView {
  bankCode: string | null;
  label: string;
  accountName: string | null;
  accountNumber: string;
  source: 'database';
}

@Injectable()
export class PaymentsService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'receipts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ReceiptService,
    private readonly config: ConfigService,
    private readonly verifier: ReceiptVerifierService,
    private readonly cheki: ChekiService,
    private readonly states: PaymentStateMachine,
  ) {}

  /** Statuses the admin payment queue can be filtered by (tab mapping). */
  private static readonly ADMIN_PAYMENT_STATUSES = [
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REVERSED',
    'EXPIRED',
    'CANCELLED',
  ] as const;

  /**
   * Admin-visible payment filter. A CHAPA row is created when the checkout is
   * initialized, before the student has paid: an unconfirmed Chapa attempt (no
   * `chapaRef`) is not an admin-review item — Chapa payments can only be
   * approved through Chapa verification — so abandoned, failed-initialization
   * and not-yet-completed checkouts stay out of the queue.
   *
   * Everything else is always listed, which matters: a row the money already
   * reached must never be filtered out by its status. Two signals keep that
   * true — a stamped `chapaRef` (Chapa confirmed this transaction) and the
   * review `exception` flag on `verification` (set on every verified-but-not-
   * approved outcome, including a late exact payment on a REJECTED/REVERSED
   * row and a reported refund).
   */
  private adminPaymentWhere(
    opts: { status?: string; search?: string; exceptions?: boolean } = {},
  ): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};

    if (opts.exceptions) {
      // The Exceptions tab: every payment an admin must look at, whatever its
      // status or method.
      where.verification = { path: ['exception'], equals: true };
    } else {
      where.OR = [
        { method: { not: 'CHAPA' } },
        { chapaRef: { not: null } },
        { verification: { path: ['exception'], equals: true } },
        { status: { notIn: ['PENDING', 'REJECTED'] } },
      ];
    }

    if (
      opts.status &&
      (PaymentsService.ADMIN_PAYMENT_STATUSES as readonly string[]).includes(
        opts.status,
      )
    ) {
      where.status =
        opts.status as (typeof PaymentsService.ADMIN_PAYMENT_STATUSES)[number];
    }
    // Free-text search over the student identity. Trimmed and length-capped so
    // a pathological query string never reaches the database verbatim.
    const term = opts.search?.trim().slice(0, 100);
    if (term) {
      where.user = {
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phoneNumber: { contains: term, mode: 'insensitive' } },
        ],
      };
    }
    return where;
  }

  /**
   * Admin moderation queue: payments for the selected tab plus per-status
   * counts. The list and the counts run on the same base filter and the same
   * search term, so the select's counts always match what a status change
   * would show. `EXCEPTIONS` counts every flagged payment, so a refund or a
   * late verified payment can never slip past the admin silently.
   */
  async findAllAdmin(
    opts: { status?: string; search?: string; exceptions?: boolean } = {},
  ) {
    const [payments, grouped, exceptionCount] = await Promise.all([
      this.prisma.payment.findMany({
        where: this.adminPaymentWhere(opts),
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
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        where: this.adminPaymentWhere({ search: opts.search }),
        _count: { _all: true },
      }),
      this.prisma.payment.count({
        where: this.adminPaymentWhere({
          search: opts.search,
          exceptions: true,
        }),
      }),
    ]);

    const counts = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      REVERSED: 0,
      EXPIRED: 0,
      CANCELLED: 0,
      EXCEPTIONS: exceptionCount,
    };
    for (const group of grouped) {
      counts[group.status] = group._count._all;
    }

    return { payments, counts };
  }

  /** A student's own payment history (newest first). */
  findMine(userId: string) {
    return this.prisma.payment.findMany({
      // Do not show an online checkout the student opened but never completed,
      // or an initialization that failed before a bank confirmation. A
      // Chapa-confirmed row (including an underpayment) has a chapaRef and
      // remains visible; an approved row is always visible.
      where: {
        userId,
        NOT: {
          method: 'CHAPA',
          chapaRef: null,
          // A failed initialization is noise for the student, but an open or
          // expired checkout is theirs to see (and to cancel).
          status: 'REJECTED',
        },
      },
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
        // The profile page polls the verify endpoint for a Chapa payment whose
        // confirmation is pending, so the student is never left guessing (or
        // paying twice).
        txRef: true,
        plan: { select: { name: true, priceETB: true, durationMonths: true } },
      },
    });
  }

  /**
   * College receiving accounts for direct bank transfers, shown on the
   * student payment page (audit finding F-12: the page never displayed them,
   * so the bank-transfer method was not completable from the app alone).
   *
   * Only admin-managed rows are listed. The legacy COMPANY_BANK_ACCOUNTS
   * entries remain available to receipt matching (so old receipts still
   * verify) but are deliberately not shown as transfer destinations until an
   * admin explicitly sets the receiving account on the payment-banks screen.
   */
  async getBankAccounts(): Promise<BankAccountView[]> {
    const rows = await this.prisma.acceptedBank.findMany({
      where: { isActive: true, accountNumber: { not: null } },
      select: { code: true, accountNumber: true, accountName: true },
    });
    const catalogOrder = new Map(
      BANK_CATALOG.map((bank, index) => [bank.code, index]),
    );
    return rows
      .slice()
      .sort(
        (a, b) =>
          (catalogOrder.get(a.code) ?? Number.MAX_SAFE_INTEGER) -
          (catalogOrder.get(b.code) ?? Number.MAX_SAFE_INTEGER),
      )
      .flatMap((row) => {
        if (!row.accountNumber) return [];
        const catalog = catalogBank(row.code);
        return [
          {
            bankCode: row.code,
            label: catalog?.label ?? row.code,
            accountName: row.accountName,
            accountNumber: row.accountNumber,
            source: 'database' as const,
          },
        ];
      });
  }

  /**
   * Banks the college currently accepts, in catalog order — drives the
   * student payment picker. Only enabled entries are returned.
   */
  async getAcceptedBanks() {
    const rows = await this.prisma.acceptedBank.findMany({
      where: { isActive: true },
      select: { code: true },
    });
    const active = new Set(rows.map((r) => r.code));
    return BANK_CATALOG.filter((b) => active.has(b.code)).map(
      ({ code, label, input, auto }) => ({ code, label, input, auto }),
    );
  }

  /** Admin view: full catalog annotated with adoption/enabled/account state. */
  async listBankCatalog() {
    const rows = await this.prisma.acceptedBank.findMany({
      select: {
        code: true,
        isActive: true,
        accountNumber: true,
        accountName: true,
      },
    });
    const byCode = new Map(rows.map((r) => [r.code, r]));
    return BANK_CATALOG.map((bank) => {
      const row = byCode.get(bank.code);
      return {
        ...bank,
        adopted: Boolean(row),
        isActive: row?.isActive === true,
        accountNumber: row?.accountNumber ?? null,
        accountName: row?.accountName ?? null,
      };
    });
  }

  /** Add (or re-enable) a catalog bank for this college. */
  async addBank(code: string) {
    if (!catalogBank(code)) {
      throw new BadRequestException('Unknown bank.');
    }
    await this.prisma.acceptedBank.upsert({
      where: { code },
      create: { code },
      update: { isActive: true },
    });
    return this.listBankCatalog();
  }

  /** Show/hide an adopted bank without deleting its history. */
  async updateBank(code: string, isActive: boolean) {
    const row = await this.prisma.acceptedBank.findUnique({ where: { code } });
    if (!row) {
      throw new NotFoundException('Bank is not in the accepted list.');
    }
    await this.prisma.acceptedBank.update({
      where: { code },
      data: { isActive },
    });
    return this.listBankCatalog();
  }

  /** Remove a bank from the accepted list (payments keep their bankName). */
  async removeBank(code: string) {
    await this.prisma.acceptedBank.deleteMany({ where: { code } });
    return this.listBankCatalog();
  }

  /**
   * Set/replace the college receiving account for an adopted bank. The
   * account is stored digit-only (the transfer panel shows it verbatim) and
   * is validated against the bank's Cheki lookup rule. Full account numbers
   * are required: students must be able to transfer to the number shown, and
   * matching the receipt receiver is stronger with the full number.
   */
  async setBankAccount(code: string, dto: SetBankAccountDto) {
    const catalog = catalogBank(code);
    if (!catalog) {
      throw new BadRequestException('Unknown bank.');
    }

    const row = await this.prisma.acceptedBank.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!row) {
      throw new NotFoundException(
        'Add this bank to the accepted list before setting its account.',
      );
    }

    const digits = dto.accountNumber.replace(/\D/g, '');
    if (digits.length < 8) {
      throw new BadRequestException(
        'Enter the full receiving account number (at least 8 digits).',
      );
    }
    if (digits.length > 30) {
      throw new BadRequestException('Account number is too long.');
    }
    if (catalog.accountDigits && digits.length < catalog.accountDigits) {
      throw new BadRequestException(
        `${catalog.label} lookups require at least ${catalog.accountDigits} account digits.`,
      );
    }

    const duplicate = await this.prisma.acceptedBank.findFirst({
      where: { accountNumber: digits, NOT: { code } },
      select: { code: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        'This receiving account is already assigned to another bank.',
      );
    }

    await this.prisma.acceptedBank.update({
      where: { code },
      data: {
        accountNumber: digits,
        accountName: dto.accountName?.trim() || null,
      },
    });
    return this.listBankCatalog();
  }

  /** Remove the receiving account from a bank without deleting the bank. */
  async clearBankAccount(code: string) {
    const row = await this.prisma.acceptedBank.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!row) {
      throw new NotFoundException('Bank is not in the accepted list.');
    }
    await this.prisma.acceptedBank.update({
      where: { code },
      data: { accountNumber: null, accountName: null },
    });
    return this.listBankCatalog();
  }

  /** MANUAL flow: student uploads a bank-transfer receipt for admin review. */
  async submit(userId: string, planId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Receipt image is required');
    }

    // Set once a Payment row references the uploaded file (any status) so the
    // cleanup below keeps the image as evidence.
    let paymentCreated = false;
    try {
      const plan = await this.prisma.subscriptionPlan.findUnique({
        where: { id: planId },
      });
      if (!plan || !plan.isActive) {
        throw new NotFoundException('Plan not found or inactive');
      }

      const pending = await this.prisma.payment.findFirst({
        where: { userId, status: 'PENDING', method: 'MANUAL' },
      });
      if (pending) {
        throw new BadRequestException(this.pendingPaymentMessage(pending));
      }

      await this.assertNoActiveSubscription(userId);

      // Verify the upload is genuinely an image (not a spoofed MIME type).
      assertValidImageFile(file.path);

      // Scan the screenshot for a receipt QR code (Cheki OCR) and try to
      // confirm what it points at with the bank. The QR alone never approves
      // anything — only the same bank-confirmed checks used by the reference
      // flow can (see attemptExtractedReceipt). Anything short of that falls
      // back to the standard manual review below.
      const scan: ChekiScanOutcome = this.cheki.enabled
        ? await this.cheki.scanReceiptImage(
            await fs.promises.readFile(file.path),
            { filename: file.filename, mimeType: file.mimetype },
          )
        : {
            kind: 'FAILED',
            code: 'NOT_CONFIGURED',
            message: 'Cheki is disabled',
          };

      if (scan.kind === 'FOUND') {
        const attempt = await this.attemptExtractedReceipt(plan, scan);

        if (attempt.outcome === 'APPROVED') {
          const payment = await this.prisma.payment.create({
            data: {
              userId,
              planId: plan.id,
              method: 'MANUAL',
              amount: plan.priceETB,
              planName: plan.name,
              planDurationMonths: plan.durationMonths,
              receiptPath: file.filename,
              bankName: attempt.dto.bank,
              bankReference: attempt.bankRef,
              verification: this.buildVerification(
                attempt.receipt,
                attempt.dto,
                {
                  bankReference: attempt.bankRef,
                  ocr: this.ocrMeta(scan),
                },
              ),
            },
          });
          paymentCreated = true;

          const paidAt = this.parseReceiptDate(attempt.receipt.date);
          await this.finalizeApproval(payment.id, paidAt ? { paidAt } : {});

          return {
            status: 'APPROVED' as const,
            autoApproved: true,
            paymentId: payment.id,
            message: 'Payment verified and your subscription is now active.',
          };
        }

        if (attempt.outcome === 'REJECTED') {
          await this.prisma.payment.create({
            data: {
              userId,
              planId: plan.id,
              method: 'MANUAL',
              amount: plan.priceETB,
              planName: plan.name,
              planDurationMonths: plan.durationMonths,
              receiptPath: file.filename,
              bankName: attempt.dto.bank,
              bankReference: attempt.bankRef,
              status: 'REJECTED',
              rejectionReason: attempt.reason,
              reviewedAt: new Date(),
              verification: this.buildVerification(
                attempt.receipt,
                attempt.dto,
                {
                  reviewNote: attempt.reason,
                  decision: 'REJECTED',
                  bankReference: attempt.bankRef,
                  ocr: this.ocrMeta(scan),
                },
              ),
            },
          });
          paymentCreated = true;
          throw new BadRequestException(attempt.reason);
        }

        if (attempt.outcome === 'REVIEW') {
          const result = await this.createPendingForReview(
            userId,
            attempt.dto,
            plan,
            attempt.receipt,
            {
              reason: attempt.reason,
              bankReference: attempt.bankRef,
              chekiCode: attempt.chekiCode,
              verifierCode: attempt.verifierCode,
              receiptPath: file.filename,
              ocr: this.ocrMeta(scan),
              excess: attempt.excess ?? null,
            },
          );
          paymentCreated = true;
          return result;
        }
      }

      // No usable QR (or OCR unavailable) — keep the existing behavior: a
      // PENDING payment with the uploaded image for manual review. The OCR
      // outcome is recorded so admins can see what was attempted.
      const payment = await this.prisma.payment.create({
        data: {
          userId,
          planId,
          method: 'MANUAL',
          amount: plan.priceETB,
          planName: plan.name,
          planDurationMonths: plan.durationMonths,
          receiptPath: file.filename,
          verification: {
            reviewNote: 'Uploaded receipt is awaiting manual review.',
            ocr: this.ocrMeta(scan),
          } as Prisma.InputJsonValue,
        },
      });
      paymentCreated = true;

      return {
        status: 'PENDING' as const,
        autoApproved: false,
        needsReview: true,
        paymentId: payment.id,
        message: 'Receipt submitted. Our team will review it shortly.',
      };
    } catch (error) {
      if (!paymentCreated) {
        fs.rm(file.path, { force: true }, () => undefined);
      }
      throw error;
    }
  }

  /**
   * BANK-TRANSFER flow: student submits a transaction reference (or receipt
   * URL). The receipt is fetched from the bank — Cheki (primary) first, then
   * the local receipt-verifier service as fallback — and we decide:
   *   - all checks pass  → create the Payment and auto-approve it (instant
   *                         subscription) via the shared finalizeApproval path.
   *   - incomplete/unavailable evidence → create a PENDING payment for manual
   *                                       admin review.
   *   - a confirmed security failure → record it as REJECTED and deny access.
   *
   * The checks that gate auto-approval (see assessReceipt):
   *   1. the data is bank-confirmed (Cheki `verified === true`, or the local
   *      verifier's official-endpoint extraction — never a decoded-only QR,
   *      a fallback URL, or client-supplied data)
   *   2. receiver account is one of OURS (admin-managed accounts, with the
   *      legacy COMPANY_BANK_ACCOUNTS list as fallback)
   *   3. amount paid matches the selected plan price (underpay → reject;
   *      overpay → manual review, never auto-approval); currency is ETB when
   *      exposed
   *   4. status is success, OR the bank exposes no status at all
   * BOA (no receiver account in its receipts) therefore always falls to review.
   */
  async verifyAndSubmit(userId: string, dto: VerifyReceiptDto) {
    // Banks are admin-managed (add/remove on the payment-banks screen). A
    // disabled or unknown bank is rejected before any external lookup — the
    // picker is not a security boundary.
    const catalog = catalogBank(dto.bank);
    if (!catalog) {
      throw new BadRequestException('Unknown bank.');
    }
    const accepted = await this.prisma.acceptedBank.findUnique({
      where: { code: dto.bank },
      select: { isActive: true, accountNumber: true },
    });
    if (!accepted?.isActive) {
      throw new BadRequestException(
        'This bank is not currently accepted for payment. Please contact the college.',
      );
    }

    if (catalog.auto && !this.verifier.enabled && !this.cheki.enabled) {
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
      where: { userId, status: 'PENDING', method: 'MANUAL' },
    });
    if (pending) {
      throw new BadRequestException(this.pendingPaymentMessage(pending));
    }

    await this.assertNoActiveSubscription(userId);

    // Cheap pre-check: reject an already-used reference before we scrape the
    // bank. (The DB @unique constraint is the real guard against races below.)
    let submittedRef = dto.reference?.trim();
    let submittedUrl = dto.url?.trim();
    const submittedAccount = dto.account?.trim();
    if (
      (dto.bank === 'tele' || dto.bank === 'cbe') &&
      submittedRef &&
      /^https:\/\//i.test(submittedRef)
    ) {
      submittedUrl = submittedRef;
      submittedRef = undefined;
    }
    if (submittedRef) {
      await this.assertReferenceUnused(submittedRef);
    }

    // Manual-review banks have no automated lookup in our stack. The student's
    // evidence is recorded and queued; nothing is approved from client data.
    if (!catalog.auto) {
      return this.createPendingForReview(userId, dto, plan, null, {
        reason: `Payments from ${catalog.label} are verified manually.`,
        bankReference: submittedRef ?? null,
      });
    }

    // CBE's FT lookup needs account digits. Restrict that lookup to the
    // college's configured receiving accounts so this endpoint cannot be used
    // as a general-purpose scraper for unrelated CBE transactions. The
    // extracted receiver account remains the authoritative approval check.
    // Pasted receipt links follow the same rule: a legacy apps.cbe.com.et
    // link embeds the digits inside its ?id= value and is checked here;
    // new-style mbreciept short links carry a signed token (nothing to
    // guess), and the verifier separately restricts the accepted CBE hosts.
    if (dto.bank === 'cbe') {
      const linkDigits = submittedUrl
        ? extractLegacyCbeLinkDigits(submittedUrl)
        : null;
      const needsDigits = !submittedUrl || linkDigits !== null;
      if (needsDigits) {
        const digitsToCheck = submittedUrl ? linkDigits : submittedAccount;
        if (!digitsToCheck) {
          throw new BadRequestException(
            'CBE verification requires the last 8 digits of the college receiving account.',
          );
        }
        if (digitsToCheck.replace(/\D/g, '').length < 8) {
          throw new BadRequestException(
            'CBE verification requires at least 8 account digits.',
          );
        }
        if (!(await this.isCompanyAccount(digitsToCheck))) {
          throw new BadRequestException(
            'The CBE account must match the college receiving account.',
          );
        }
      }
    }

    // BOA's Cheki reference lookup needs the last five digits of the college
    // receiving account. The student only types the transaction reference; the
    // digits are derived server-side from the admin-configured BOA account.
    // If no account has been set, the lookup is left to manual review.
    let lookupAccount = submittedAccount;
    if (dto.bank === 'boa' && !submittedUrl && !lookupAccount) {
      const digits = catalog.accountDigits ?? 5;
      const configured = accepted.accountNumber?.replace(/\D/g, '') ?? '';
      if (configured.length >= digits) {
        lookupAccount = configured.slice(-digits);
      }
    }

    // Primary path: Cheki (fetches the bank's own record). Only a
    // bank-confirmed (`verified === true`) answer is used. Anything else —
    // decoded-only QR, fallback URL required, rate limit, outage, malformed
    // response — falls through to the local verifier below and can never
    // auto-approve on its own.
    let receipt: NormalizedReceipt | null = null;
    let chekiCode: string | null = null;
    if (this.cheki.enabled) {
      const outcome = await this.cheki.verify({
        bank: dto.bank,
        reference: submittedRef,
        url: submittedUrl,
        account: lookupAccount,
      });
      if (outcome.kind === 'VERIFIED') {
        receipt = outcome.receipt;
      } else {
        chekiCode =
          outcome.kind === 'DECODED_ONLY' ? 'DECODED_ONLY' : outcome.code;
      }
    }

    // Fallback path: the local receipt-verifier service (same official bank
    // endpoints; keeps the flow working when Cheki is unreachable/unrated for
    // a receipt). A local extraction is itself bank-sourced, so it passes the
    // same assessment rules before anything can be approved.
    if (!receipt) {
      const result = await this.verifier.extract({
        bank: dto.bank,
        reference: submittedRef,
        url: submittedUrl,
        account: lookupAccount,
      });

      // Verifier could not give us a trustworthy answer → manual review.
      if (!result.ok) {
        if (result.code === 'NOT_FOUND') {
          throw new BadRequestException(
            'No receipt was found for that reference. Please double-check it.',
          );
        }
        if (
          ['BAD_INPUT', 'MISSING_ACCOUNT', 'URL_REQUIRED'].includes(result.code)
        ) {
          // BOA accepts a bare reference in the UI, but the local fallback
          // can only read a full receipt link. A reference that Cheki could
          // not confirm is still valid evidence for an admin to check — do
          // not turn it into a hard input error.
          if (
            dto.bank === 'boa' &&
            submittedRef &&
            !submittedUrl &&
            result.code === 'URL_REQUIRED'
          ) {
            return this.createPendingForReview(userId, dto, plan, null, {
              reason:
                'We could not confirm this BOA reference automatically. Our team will review it.',
              bankReference: submittedRef,
              verifierCode: result.code,
              chekiCode: chekiCode ?? undefined,
            });
          }
          throw new BadRequestException(result.message);
        }
        // BLOCKED / EXTRACT_FAILED / UNREACHABLE → fall back to admin queue.
        return this.createPendingForReview(userId, dto, plan, null, {
          reason: `Automated verification unavailable (${result.code}). Sent for manual review.`,
          bankReference: submittedRef,
          verifierCode: result.code,
          chekiCode: chekiCode ?? undefined,
        });
      }

      receipt = { ...result.receipt, source: 'local' };
    }

    const bankRef = receipt.reference ?? submittedRef ?? null;

    // Re-check uniqueness against the reference the BANK reports (it may differ
    // from what the student typed, e.g. normalized casing).
    if (bankRef) {
      await this.assertReferenceUnused(bankRef);
    }

    const decision = await this.assessReceipt(receipt, plan.priceETB);
    if (decision.outcome === 'REJECT') {
      await this.createRejectedVerification(userId, dto, plan, receipt, {
        reason: decision.reason,
        bankReference: bankRef,
      });
      throw new BadRequestException(decision.reason);
    }
    if (decision.outcome === 'REVIEW') {
      // The bank did not expose enough data to make a safe automatic decision.
      return this.createPendingForReview(userId, dto, plan, receipt, {
        reason: decision.reason,
        bankReference: bankRef,
        chekiCode: chekiCode ?? undefined,
        excess: decision.excess ?? null,
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
          planName: plan.name,
          planDurationMonths: plan.durationMonths,
          bankName: dto.bank,
          bankReference: bankRef,
          verification: this.buildVerification(receipt, dto, {
            bankReference: bankRef,
          }),
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
   * Turn a QR code read from an uploaded screenshot into a decision. Mirrors
   * verifyAndSubmit's bank-confirmation rules, with one deliberate difference:
   * everything short of a confirmed bad receipt becomes a REVIEW — the
   * student typed nothing to correct, so 400-style input errors are not
   * appropriate here. Approval still requires the reference to be confirmed
   * by the bank (Cheki `verified`, or the local verifier's official-endpoint
   * extraction) and to pass assessReceipt; the QR itself is never evidence.
   */
  private async attemptExtractedReceipt(
    plan: { id: string; priceETB: Prisma.Decimal; name: string },
    scan: {
      bank: string | null;
      bankCode: string;
      reference: string;
      text: string;
    },
  ): Promise<
    | {
        outcome: 'APPROVED';
        dto: VerifyReceiptDto;
        receipt: NormalizedReceipt;
        bankRef: string | null;
      }
    | {
        outcome: 'REJECTED';
        dto: VerifyReceiptDto;
        receipt: NormalizedReceipt;
        bankRef: string | null;
        reason: string;
      }
    | {
        outcome: 'REVIEW';
        dto: VerifyReceiptDto;
        receipt: NormalizedReceipt | null;
        bankRef?: string | null;
        chekiCode?: string;
        verifierCode?: string;
        reason: string;
        excess?: Prisma.Decimal | null;
      }
  > {
    if (!scan.bank) {
      // Storage-only dto (never sent to a bank check): keep the real provider
      // code visible in the payment row so admins see what the QR identified.
      const dto = { planId: plan.id, bank: scan.bankCode } as VerifyReceiptDto;
      return {
        outcome: 'REVIEW',
        dto,
        receipt: null,
        reason: `The receipt QR identifies a ${scan.bankCode} receipt, which is not supported for automatic verification yet.`,
      };
    }

    // Prefer the raw QR text when it is a receipt URL — it carries the full
    // link (incl. legacy CBE account digits); otherwise use the reference.
    const url = /^https?:\/\//i.test(scan.text) ? scan.text : undefined;
    const dto: VerifyReceiptDto = {
      planId: plan.id,
      bank: scan.bank as VerifyReceiptDto['bank'],
      ...(url ? { url } : { reference: scan.reference }),
    };

    if (scan.bank === 'cbe') {
      if (!url) {
        // A bare FT in a QR has no account digits; legacy CBE lookups need
        // them, so this can only go to manual review.
        return {
          outcome: 'REVIEW',
          dto,
          receipt: null,
          reason:
            'The CBE receipt QR contains only a reference; the account digits are required for verification.',
        };
      }
      const digits = extractLegacyCbeLinkDigits(url);
      if (digits !== null && !(await this.isCompanyAccount(digits))) {
        // Same scraper guard as the reference flow, softened to REVIEW: the
        // digits come from a client-supplied image, so this is not a
        // confirmed failure — but the lookup must not run for other accounts.
        return {
          outcome: 'REVIEW',
          dto,
          receipt: null,
          reason:
            'The CBE account embedded in the receipt link does not match the college receiving account.',
        };
      }
    }

    let receipt: NormalizedReceipt | null = null;
    let chekiCode: string | undefined;
    if (this.cheki.enabled) {
      const outcome = await this.cheki.verify({
        bank: scan.bank,
        reference: url ? undefined : scan.reference,
        url,
      });
      if (outcome.kind === 'VERIFIED') {
        receipt = outcome.receipt;
      } else {
        chekiCode =
          outcome.kind === 'DECODED_ONLY' ? 'DECODED_ONLY' : outcome.code;
      }
    }

    if (!receipt) {
      const result = await this.verifier.extract({
        bank: scan.bank,
        reference: url ? undefined : scan.reference,
        url,
      });
      if (!result.ok) {
        if (result.code === 'NOT_FOUND') {
          return {
            outcome: 'REVIEW',
            dto,
            receipt: null,
            chekiCode,
            verifierCode: result.code,
            reason: 'No receipt was found for the QR code in the image.',
          };
        }
        return {
          outcome: 'REVIEW',
          dto,
          receipt: null,
          chekiCode,
          verifierCode: result.code,
          reason: `Automated verification of the scanned QR was not possible (${result.code}).`,
        };
      }
      receipt = { ...result.receipt, source: 'local' };
    }

    const bankRef = receipt.reference ?? (url ? null : scan.reference);
    if (bankRef) {
      // Replayed receipts are blocked exactly like the reference flow.
      await this.assertReferenceUnused(bankRef);
    }

    const decision = await this.assessReceipt(receipt, plan.priceETB);
    if (decision.outcome === 'REJECT') {
      return {
        outcome: 'REJECTED',
        dto,
        receipt,
        bankRef,
        reason: decision.reason,
      };
    }
    if (decision.outcome === 'REVIEW') {
      return {
        outcome: 'REVIEW',
        dto,
        receipt,
        bankRef,
        chekiCode,
        reason: decision.reason,
        excess: decision.excess ?? null,
      };
    }
    return { outcome: 'APPROVED', dto, receipt, bankRef };
  }

  /** Compact OCR provenance for the payment verification JSON. */
  private ocrMeta(scan: ChekiScanOutcome): Prisma.InputJsonValue {
    if (scan.kind === 'FOUND') {
      return { via: 'cheki-ocr', bankCode: scan.bankCode };
    }
    if (scan.kind === 'NONE') {
      return { via: 'cheki-ocr', result: 'no-qr' };
    }
    return { via: 'cheki-ocr', result: 'unavailable', code: scan.code };
  }

  /**
   * Distinguish hard failures from incomplete evidence. Confirmed wrong
   * receiver, underpayment, or failed bank status must never be overridable by
   * an admin. An overpayment is not auto-approved either: the college has
   * received more money than the selected plan costs, so a human must decide
   * whether to apply it to another plan or refund the difference.
   *
   * Missing fields can still be reviewed against submitted evidence.
   */
  private async assessReceipt(
    receipt: NormalizedReceipt,
    planPrice: Prisma.Decimal,
  ): Promise<ReceiptDecision> {
    if (receipt.statusKnown && receipt.statusOk === false) {
      return {
        outcome: 'REJECT',
        reason: `Bank reports transaction status "${receipt.status}".`,
      };
    }
    if (receipt.currency && receipt.currency.toUpperCase() !== 'ETB') {
      return {
        outcome: 'REJECT',
        reason: `Receipt currency "${receipt.currency}" is not ETB.`,
      };
    }
    if (
      receipt.receiverAccount &&
      !(await this.isCompanyAccount(receipt.receiverAccount))
    ) {
      return {
        outcome: 'REJECT',
        reason: 'Payment was not made to the college receiving account.',
      };
    }
    // Decimal-safe comparison: no float arithmetic, no tolerance band.
    const paid = toDecimal(receipt.amount);
    if (paid && paid.lt(planPrice)) {
      const shortfall = planPrice.minus(paid);
      return {
        outcome: 'REJECT',
        reason: `Amount paid (${paid.toFixed(2)} ETB) is less than the plan price (${planPrice.toFixed(2)} ETB); shortfall ${shortfall.toFixed(2)} ETB. Please pay the full plan amount or contact the college.`,
      };
    }
    if (paid && paid.gt(planPrice)) {
      const excess = paid.minus(planPrice);
      return {
        outcome: 'REVIEW',
        excess,
        reason: `Amount paid (${paid.toFixed(2)} ETB) is greater than the plan price (${planPrice.toFixed(2)} ETB); excess ${excess.toFixed(2)} ETB recorded for the college to refund or credit. This receipt needs manual review.`,
      };
    }
    if (!receipt.receiverAccount) {
      // e.g. BOA, whose receipts never expose the beneficiary account.
      return {
        outcome: 'REVIEW',
        reason:
          'Receiver account not present on this receipt; needs manual review.',
      };
    }
    if (receipt.amount == null) {
      return {
        outcome: 'REVIEW',
        reason: 'Could not read the paid amount from the receipt.',
      };
    }
    return { outcome: 'APPROVE' };
  }

  /** Does the receipt's receiver account match one of ours (masking-tolerant)? */
  private async isCompanyAccount(receiverAccount: string): Promise<boolean> {
    return isCompanyAccount(await this.allCompanyAccounts(), receiverAccount);
  }

  /**
   * Every college receiving account: admin-managed rows first, then the
   * legacy COMPANY_BANK_ACCOUNTS fallback. Hidden banks are included because
   * the upload/OCR path is deliberately not gated by the accepted-bank list;
   * a bank-confirmed receipt paid into a college account remains valid.
   */
  private async allCompanyAccounts(): Promise<string[]> {
    const rows = await this.prisma.acceptedBank.findMany({
      where: { accountNumber: { not: null } },
      select: { accountNumber: true },
    });
    const dbAccounts = rows.flatMap((row) =>
      row.accountNumber ? [row.accountNumber] : [],
    );
    return Array.from(
      new Set([
        ...dbAccounts,
        ...this.envAccountRows().map((account) => account.accountNumber),
      ]),
    );
  }

  /** Legacy env-configured accounts, normalised to digits. */
  private envAccountRows(): { accountNumber: string; label: string }[] {
    const labels = (
      this.config.get<string>('COMPANY_BANK_ACCOUNT_LABELS') ?? ''
    )
      .split(',')
      .map((label) => label.trim());
    return (this.config.get<string>('COMPANY_BANK_ACCOUNTS') ?? '')
      .split(',')
      .map((value, index) => ({
        accountNumber: value.replace(/\D/g, ''),
        label: labels[index] || `Account ${index + 1}`,
      }))
      .filter((account) => account.accountNumber.length > 0);
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
    plan: {
      id: string;
      priceETB: Prisma.Decimal;
      name: string;
      durationMonths: number;
    },
    receipt: NormalizedReceipt | null,
    opts: {
      reason: string;
      bankReference: string | null | undefined;
      verifierCode?: string;
      chekiCode?: string;
      /** Kept as evidence when the review was triggered by an uploaded image. */
      receiptPath?: string;
      /** OCR provenance (e.g. which QR was read) for the verification JSON. */
      ocr?: Prisma.InputJsonValue;
      /** Overpayment excess recorded on the payment (manual review, never auto-approved). */
      excess?: Prisma.Decimal | null;
    },
  ) {
    try {
      const payment = await this.prisma.payment.create({
        data: {
          userId,
          planId: plan.id,
          method: 'MANUAL',
          amount: plan.priceETB,
          planName: plan.name,
          planDurationMonths: plan.durationMonths,
          bankName: dto.bank,
          bankReference: opts.bankReference ?? null,
          excessAmount: opts.excess ?? null,
          rejectionReason: null,
          ...(opts.receiptPath ? { receiptPath: opts.receiptPath } : {}),
          verification: this.buildVerification(receipt, dto, {
            reviewNote: opts.reason,
            verifierCode: opts.verifierCode,
            chekiCode: opts.chekiCode,
            bankReference: opts.bankReference,
            ocr: opts.ocr,
          }),
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

  /** Record a confirmed bad receipt so its reference cannot be replayed. */
  private async createRejectedVerification(
    userId: string,
    dto: VerifyReceiptDto,
    plan: {
      id: string;
      priceETB: Prisma.Decimal;
      name: string;
      durationMonths: number;
    },
    receipt: NormalizedReceipt,
    opts: { reason: string; bankReference: string | null | undefined },
  ) {
    try {
      await this.prisma.payment.create({
        data: {
          userId,
          planId: plan.id,
          method: 'MANUAL',
          amount: plan.priceETB,
          planName: plan.name,
          planDurationMonths: plan.durationMonths,
          bankName: dto.bank,
          bankReference: opts.bankReference ?? null,
          status: 'REJECTED',
          rejectionReason: opts.reason,
          reviewedAt: new Date(),
          verification: this.buildVerification(receipt, dto, {
            reviewNote: opts.reason,
            decision: 'REJECTED',
            bankReference: opts.bankReference,
          }),
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
  }

  /**
   * Persist both extracted bank data and the student's submitted lookup
   * evidence. Never persist the raw CBE account digits; only record that the
   * lookup was restricted to a configured college account.
   */
  private buildVerification(
    receipt: NormalizedReceipt | null,
    dto: VerifyReceiptDto,
    opts: {
      reviewNote?: string;
      verifierCode?: string;
      chekiCode?: string;
      decision?: string;
      bankReference?: string | null;
      ocr?: Prisma.InputJsonValue;
    },
  ): Prisma.InputJsonValue {
    const rawReference = dto.reference?.trim();
    const referenceIsUrl = Boolean(
      rawReference && /^https:\/\//i.test(rawReference),
    );
    const submittedReference = referenceIsUrl ? undefined : rawReference;
    const submittedUrl =
      dto.url?.trim() ?? (referenceIsUrl ? rawReference : undefined);
    return {
      ...(receipt ?? {}),
      ...(opts.reviewNote ? { reviewNote: opts.reviewNote } : {}),
      ...(opts.verifierCode ? { verifierCode: opts.verifierCode } : {}),
      ...(opts.chekiCode ? { chekiCode: opts.chekiCode } : {}),
      ...(opts.ocr ? { ocr: opts.ocr } : {}),
      ...(opts.decision ? { decision: opts.decision } : {}),
      ...(submittedReference ? { submittedReference } : {}),
      ...(submittedUrl ? { submittedUrl } : {}),
      ...(dto.bank === 'cbe' && dto.account?.trim()
        ? { submittedAccountMatched: true }
        : {}),
      ...(!receipt?.reference && opts.bankReference
        ? { reference: opts.bankReference }
        : {}),
    } as Prisma.InputJsonObject;
  }

  /**
   * One-PENDING-per-user rule message: never block silently — name the
   * payment, its method and its status, and say what the student should do.
   */
  private pendingPaymentMessage(payment: {
    id: string;
    method: string;
    status: string;
  }): string {
    if (payment.method === 'MANUAL') {
      return (
        `You already have a MANUAL bank-receipt payment (id ${payment.id}, status ${payment.status}) awaiting admin review. ` +
        'You will be notified when it is approved or rejected; you cannot start another payment until then.'
      );
    }
    return (
      `You already have a ${payment.method} payment (id ${payment.id}, status ${payment.status}) in progress. ` +
      'Complete it, cancel it, or wait for it to expire before starting a new one.'
    );
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

  /**
   * Student-facing cancel of their OWN pending online (Chapa) payment.
   * Owner-checked, and the PENDING → CANCELLED move goes through the state
   * machine (guarded update + PAYMENT_CANCELLED event) inside one transaction
   * with the audit row, so a concurrent approval can never be overwritten.
   * Bank-receipt (MANUAL) payments are admin-review items and cannot be
   * cancelled here.
   */
  async cancelOwn(paymentId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, userId: true, status: true, method: true, txRef: true },
      });
      if (!payment || payment.userId !== userId) {
        throw new NotFoundException('Payment not found');
      }
      if (payment.status !== 'PENDING') {
        throw new BadRequestException('Only a pending payment can be cancelled');
      }
      if (payment.method !== 'CHAPA') {
        throw new BadRequestException(
          'Bank-receipt payments are reviewed by an admin and cannot be cancelled here',
        );
      }

      const won = await this.states.transition(tx, paymentId, {
        from: ['PENDING'],
        to: 'CANCELLED',
        type: PaymentEventType.PAYMENT_CANCELLED,
        actorId: userId,
        reason: 'Cancelled by the student before completing the checkout',
      });
      if (!won) {
        throw new BadRequestException('Payment is no longer pending');
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'PAYMENT_CANCELLED',
          entityType: 'Payment',
          entityId: paymentId,
          meta: { method: payment.method, txRef: payment.txRef ?? null },
        },
      });

      return { message: 'Payment cancelled' };
    });
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
   *
   * Late Chapa payments: a checkout may already be closed as EXPIRED (abandoned
   * lazily) or CANCELLED (student cancelled) when Chapa confirms the money did
   * move. `allowExpiredOrCancelled` is set ONLY by the verified gateway paths
   * (webhook, callback, verify endpoint, lazy resolution) after an exact
   * tx_ref/ETB/amount check. Admin manual approval never sets it, so a closed
   * checkout can never be reopened from the dashboard. REJECTED and REVERSED
   * stay fully terminal.
   */
  async finalizeApproval(
    paymentId: string,
    opts: {
      reviewedBy?: string;
      chapaRef?: string;
      paidAt?: Date;
      /** Verified-gateway only: revive EXPIRED/CANCELLED. Never for admins. */
      allowExpiredOrCancelled?: boolean;
    } = {},
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
    if (payment.status === 'REVERSED') {
      throw new BadRequestException('Payment has been reversed');
    }
    const closed =
      payment.status === 'EXPIRED' || payment.status === 'CANCELLED';
    if (closed && !opts.allowExpiredOrCancelled) {
      throw new BadRequestException(
        `Payment is ${payment.status} and can only be approved by a verified gateway confirmation`,
      );
    }
    // Defence in depth: even if a caller passed both flags, an admin review
    // must never reopen a closed checkout.
    if (closed && opts.reviewedBy) {
      throw new BadRequestException(
        'A closed payment cannot be approved by an admin',
      );
    }
    if (opts.reviewedBy) {
      await this.assertAdminApprovalAllowed(payment);
    }

    const now = opts.paidAt ?? new Date();
    // Plan snapshot: values captured at payment creation (all new rows);
    // fall back to the live plan only for pre-migration rows.
    const planName = payment.planName ?? payment.plan.name;
    const durationMonths =
      payment.planDurationMonths ?? payment.plan.durationMonths;
    const receiptNumber = this.receipts.buildReceiptNumber(payment.id, now);

    let result: { startDate: Date; endDate: Date } | null;
    for (let attempt = 0; ; attempt++) {
      result = await this.prisma.$transaction(async (tx) => {
        // Re-read inside the transaction: the status may have moved since the
        // fast-path read above (an abandoned checkout can be expired by a
        // concurrent initialize). The guarded update below only fires for the
        // status we just observed, so a late transition can never overwrite a
        // newer one.
      const current = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { status: true },
      });
      if (!current) return null;
      const late =
        current.status === 'EXPIRED' || current.status === 'CANCELLED';
      if (late && !opts.allowExpiredOrCancelled) return null;
      if (current.status !== 'PENDING' && !late) return null;
      const fromStatus = current.status as PaymentStatus;

      // Atomically CLAIM the transition through the state machine: guarded
      // update (WHERE status = fromStatus) + immutable PaymentEvent in the
      // same transaction. Under READ COMMITTED a second concurrent caller
      // (Chapa webhook retry while the browser callback also fires) blocks
      // here, then matches 0 rows and bails — so activation, the
      // notification, the audit log and the PDF are produced exactly once.
      // This is the real idempotency guard; the early status checks above are
      // just a fast path.
      const won = await this.states.transition(tx, paymentId, {
        from: [fromStatus],
        to: 'APPROVED',
        type: late
          ? PaymentEventType.PAYMENT_APPROVED_AFTER_EXPIRY
          : PaymentEventType.PAYMENT_APPROVED,
        actorId: opts.reviewedBy ?? null,
        reason: late
          ? `Chapa verified the exact payment after it was ${fromStatus}`
          : null,
        data: {
          receiptNumber,
          chapaRef: opts.chapaRef ?? payment.chapaRef,
          paidAt: now,
          reviewedBy: opts.reviewedBy ?? null,
          reviewedAt: now,
          ...(late ? { recoveredFromStatus: fromStatus } : {}),
        },
        meta: {
          method: payment.method,
          receiptNumber,
          auto: !opts.reviewedBy,
          planName,
          ...(late ? { recoveredFromStatus: fromStatus } : {}),
        },
      });
      if (!won) {
        // Lost the race — another transaction already changed this payment.
        return null;
      }

      // Serialize subscription activation per user: two different paid
      // payments for the same user finalized at the same moment must extend
      // one subscription in sequence, not race the unique userId index.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payment-activation'), hashtext(${payment.userId}))`;

      const sub = await this.activateSubscription(
        tx,
        payment.userId,
        payment.planId,
        now,
        durationMonths,
      );

      await tx.payment.update({
        where: { id: paymentId },
        data: { subscriptionId: sub.id },
      });

      await tx.notification.create({
        data: {
          userId: payment.userId,
          type: 'PAYMENT_APPROVED',
          title: 'Payment approved',
          // Plan names already include the word "subscription" (e.g.
          // "6-month subscription"), so appending it again produced
          // "Your 6-month subscription subscription is now active."
          // Show plan/amount instead - it also tells the student what
          // they paid for.
          message: `Your ${planName.trim()}/${Number(payment.amount)} is now active.`,
          meta: {
            paymentId,
            receiptNumber,
            ...(late ? { recoveredFromStatus: fromStatus } : {}),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: opts.reviewedBy ?? payment.userId,
          action: late
            ? PaymentEventType.PAYMENT_APPROVED_AFTER_EXPIRY
            : 'PAYMENT_APPROVED',
          entityType: 'Payment',
          entityId: paymentId,
          meta: {
            method: payment.method,
            receiptNumber,
            auto: !opts.reviewedBy,
            planName,
            ...(late ? { recoveredFromStatus: fromStatus } : {}),
          },
        },
      });

      return { startDate: sub.startDate, endDate: sub.endDate };
      });

      // Claimed: activate the receipt/PDF path below exactly once.
      if (result) break;

      // Lost the guarded claim: another transaction moved this row first. If a
      // concurrent student/lazy cancel closed it as EXPIRED/CANCELLED *after*
      // we read `current.status`, the money Chapa just confirmed would be
      // dropped silently — so re-read and revive on the next pass instead.
      const after = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: { status: true },
      });
      if (after?.status === 'APPROVED') {
        return { message: 'Payment already approved', alreadyApproved: true };
      }
      const revivable =
        after?.status === 'EXPIRED' || after?.status === 'CANCELLED';
      if (!revivable || !opts.allowExpiredOrCancelled || attempt >= 2) break;
    }

    // Another concurrent caller won the race and already finalized everything.
    if (!result) {
      const fresh = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: { status: true },
      });
      if (fresh?.status === 'APPROVED') {
        return { message: 'Payment already approved', alreadyApproved: true };
      }
      return {
        message: `Payment is ${fresh?.status ?? 'no longer approvable'}`,
        approved: false,
        status: fresh?.status ?? null,
      };
    }
    const { startDate, endDate } = result;

    // Generate the PDF outside the DB transaction — a slow/failed file write
    // must never roll back an activated subscription.
    await this.receipts.generate(paymentId, {
      receiptNumber,
      paidAt: now,
      method: payment.method,
      amount: formatETB(payment.amount ?? payment.plan.priceETB),
      currency: payment.currency,
      chapaRef: opts.chapaRef ?? payment.chapaRef,
      payer: {
        fullName: payment.user.fullName,
        email: payment.user.email,
        phoneNumber: payment.user.phoneNumber,
      },
      plan: {
        name: planName,
        durationMonths,
      },
      subscription: { startDate, endDate },
    });

    return {
      message: 'Payment approved and subscription activated',
      receiptNumber,
    };
  }

  /**
   * Admin approval is intentionally limited to manual payments with evidence.
   * Chapa payments must be finalized by Chapa verification, and extracted hard
   * failures cannot be overridden from the dashboard.
   */
  private async assertAdminApprovalAllowed(payment: {
    method: string;
    receiptPath: string | null;
    bankReference: string | null;
    verification: Prisma.JsonValue | null;
    plan: { priceETB: Prisma.Decimal };
  }) {
    if (payment.method === 'CHAPA') {
      throw new BadRequestException(
        'Chapa payments can only be approved after successful Chapa verification.',
      );
    }

    const verification = this.asVerificationRecord(payment.verification);
    const hasEvidence = Boolean(
      payment.receiptPath ||
      payment.bankReference ||
      verification?.submittedReference ||
      verification?.submittedUrl ||
      verification?.reference ||
      verification?.amount != null ||
      verification?.receiverAccount,
    );
    if (!hasEvidence) {
      throw new BadRequestException(
        'This payment has no receipt or bank evidence and cannot be approved.',
      );
    }

    if (this.looksLikeNormalizedReceipt(verification)) {
      const decision = await this.assessReceipt(
        verification,
        payment.plan.priceETB,
      );
      if (decision.outcome === 'REJECT') {
        throw new BadRequestException(
          `This payment cannot be approved: ${decision.reason}`,
        );
      }
    }
  }

  private asVerificationRecord(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value
      : null;
  }

  private looksLikeNormalizedReceipt(
    value: Record<string, unknown> | null,
  ): value is Record<string, unknown> & NormalizedReceipt {
    return Boolean(
      value &&
      ('receiverAccount' in value ||
        'amount' in value ||
        'statusKnown' in value),
    );
  }

  /**
   * Upsert a user's subscription to ACTIVE within a transaction.
   * Renewal while ACTIVE extends from the current endDate (never shortens
   * it); month maths is done in UTC with end-of-month clamping
   * (Jan 31 + 1 month = Feb 28/29).
   */
  private async activateSubscription(
    tx: Prisma.TransactionClient,
    userId: string,
    planId: string,
    now: Date,
    durationMonths: number,
  ): Promise<{ id: string; startDate: Date; endDate: Date }> {
    const existing = await tx.subscription.findUnique({ where: { userId } });
    if (existing) {
      const stillActive =
        existing.status === 'ACTIVE' &&
        existing.endDate !== null &&
        existing.endDate > now;
      const base = stillActive && existing.endDate ? existing.endDate : now;
      const startDate = existing.startDate ?? now;
      const endDate = addMonthsUtc(base, durationMonths);
      const updated = await tx.subscription.update({
        where: { id: existing.id },
        data: { planId, status: 'ACTIVE', startDate, endDate },
      });
      return { id: updated.id, startDate, endDate };
    }
    const endDate = addMonthsUtc(now, durationMonths);
    const created = await tx.subscription.create({
      data: { userId, planId, status: 'ACTIVE', startDate: now, endDate },
    });
    return { id: created.id, startDate: now, endDate };
  }

  async reject(paymentId: string, adminId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') {
      throw new BadRequestException('Payment has already been reviewed');
    }

    // Guarded transition + audit row in one transaction: an admin reject
    // racing a webhook approval can no longer overwrite APPROVED → REJECTED.
    const rejectionReason = reason ?? 'Receipt could not be verified';
    const reviewedAt = new Date();
    const won = await this.prisma.$transaction(async (tx) => {
      const ok = await this.states.transition(tx, paymentId, {
        from: ['PENDING'],
        to: 'REJECTED',
        type: PaymentEventType.PAYMENT_REJECTED,
        actorId: adminId,
        reason: rejectionReason,
        data: { rejectionReason, reviewedBy: adminId, reviewedAt },
      });
      if (!ok) return false;
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'PAYMENT_REJECTED',
          entityType: 'Payment',
          entityId: paymentId,
          meta: { reason: rejectionReason ?? null },
        },
      });
      return true;
    });
    if (!won) {
      throw new BadRequestException('Payment has already been reviewed');
    }

    return { message: 'Payment rejected' };
  }

  /**
   * SUPER_ADMIN: invalidate a previously approved payment. This is the only
   * way an APPROVED row can be invalidated — reject() works on PENDING only,
   * and overwriting an approval would destroy the review trail. The original
   * approval fields (receiptNumber, reviewedBy/At, paidAt) stay intact; a
   * reversal stamps who reversed it, when, and the mandatory reason.
   *
   * Access removal: the student's subscription is cancelled ONLY when no other
   * APPROVED payment still backs it. Reversing one of several approved
   * payments must never lock a student out while a valid payment remains.
   * After a cancellation the student can pay again (the active-subscription
   * guard no longer triggers), which is the intended recovery path.
   */
  async reverse(paymentId: string, adminId: string, reason?: string) {
    const trimmedReason = (reason ?? '').trim();
    if (!trimmedReason) {
      throw new BadRequestException(
        'A reason is required to reverse a payment',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        userId: true,
        receiptNumber: true,
        plan: { select: { name: true } },
      },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'REVERSED') {
      return {
        message: 'Payment has already been reversed',
        alreadyReversed: true,
      };
    }
    if (payment.status !== 'APPROVED') {
      throw new BadRequestException('Only an approved payment can be reversed');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      // Atomically CLAIM APPROVED → REVERSED via the state machine (guarded
      // update + immutable event) so two concurrent reversals can never both
      // cancel access or double-notify. The second caller matches 0 rows and
      // reports the payment as already reversed.
      const won = await this.states.transition(tx, paymentId, {
        from: ['APPROVED'],
        to: 'REVERSED',
        type: PaymentEventType.PAYMENT_REVERSED,
        actorId: adminId,
        reason: trimmedReason,
        data: {
          reversalReason: trimmedReason,
          reversedBy: adminId,
          reversedAt: now,
        },
      });
      if (!won) return null;

      // Take the same per-user advisory lock finalizeApproval takes before it
      // touches the subscription. Without it, a concurrent verified approval
      // can commit between the count below and the cancel: the student has
      // paid, the row is APPROVED, and this reversal still removes the access
      // that payment bought. The lock is released with the transaction, so the
      // two operations serialize instead of interleaving.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payment-activation'), hashtext(${payment.userId}))`;

      // Remove access only when this was the student's last approved payment.
      const otherApproved = await tx.payment.count({
        where: { userId: payment.userId, status: 'APPROVED' },
      });
      let accessRemoved = false;
      if (otherApproved === 0) {
        const cancelled = await tx.subscription.updateMany({
          where: {
            userId: payment.userId,
            status: { in: ['ACTIVE', 'PENDING'] },
          },
          data: { status: 'CANCELLED', endDate: now },
        });
        accessRemoved = cancelled.count > 0;
      }

      await tx.notification.create({
        data: {
          userId: payment.userId,
          type: PaymentEventType.PAYMENT_REVERSED,
          title: 'Payment reversed',
          message: accessRemoved
            ? `Your ${payment.plan.name} payment was reversed by the college and your access has been removed. Reason: ${trimmedReason}`
            : `Your ${payment.plan.name} payment was reversed by the college. Reason: ${trimmedReason}`,
          meta: { paymentId, receiptNumber: payment.receiptNumber },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'PAYMENT_REVERSED',
          entityType: 'Payment',
          entityId: paymentId,
          meta: {
            reason: trimmedReason,
            receiptNumber: payment.receiptNumber,
            accessRemoved,
          },
        },
      });

      return { accessRemoved };
    });

    if (!result) {
      return {
        message: 'Payment has already been reversed',
        alreadyReversed: true,
      };
    }

    return {
      message: result.accessRemoved
        ? 'Payment reversed and subscription access removed'
        : "Payment reversed. Another approved payment keeps the student's access",
      accessRemoved: result.accessRemoved,
    };
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
