import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from './payments.service';

interface ChapaInitResponse {
  status: string;
  message?: string;
  data?: { checkout_url?: string };
}

interface ChapaVerifyResponse {
  status: string;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    tx_ref?: string;
    amount?: string | number;
  } | null;
}

/**
 * Chapa online-payment gateway integration.
 *
 * Lifecycle:
 *  1. initialize()  — create a PENDING payment, ask Chapa for a checkout URL.
 *  2. student pays on Chapa's hosted page (telebirr / CBE / bank / card).
 *  3. Chapa calls our webhook AND redirects the browser to our callback page.
 *  4. handleWebhook() / verifyByTxRef() confirm with Chapa's verify endpoint
 *     and hand off to PaymentsService.finalizeApproval (idempotent).
 */
@Injectable()
export class ChapaService {
  private readonly logger = new Logger(ChapaService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {
    this.baseUrl =
      this.config.get<string>('CHAPA_BASE_URL') ?? 'https://api.chapa.co/v1';
  }

  private secretKey(): string {
    const key = this.config.get<string>('CHAPA_SECRET_KEY');
    if (!key) {
      this.logger.error('CHAPA_SECRET_KEY is not configured');
      throw new ServiceUnavailableException(
        'Online payment is not available right now',
      );
    }
    return key;
  }

  /** Build a checkout session for a plan and return the hosted-page URL. */
  async initialize(
    user: {
      id: string;
      email: string;
      fullName: string;
      phoneNumber?: string | null;
    },
    planId: string,
  ) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found or inactive');
    }

    // Don't let a user pay again while a subscription is still active.
    await this.payments.assertNoActiveSubscription(user.id);

    // Reuse an abandoned, still-pending Chapa attempt for the same plan so we
    // don't accumulate dead rows when a student retries.
    const existing = await this.prisma.payment.findFirst({
      where: { userId: user.id, planId, method: 'CHAPA', status: 'PENDING' },
    });

    const payment =
      existing ??
      (await this.prisma.payment.create({
        data: {
          userId: user.id,
          planId,
          method: 'CHAPA',
          amount: plan.priceETB,
          currency: 'ETB',
        },
      }));

    const txRef = `lm-${payment.id}`;
    if (payment.txRef !== txRef) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { txRef },
      });
    }

    const apiBase = this.publicApiBase();
    const webBase = this.publicWebBase();
    const [firstName, ...rest] = user.fullName.trim().split(/\s+/);

    const body = {
      amount: Number(plan.priceETB).toFixed(2),
      currency: 'ETB',
      email: user.email,
      first_name: firstName || 'Student',
      last_name: rest.join(' ') || 'Lorcan',
      phone_number: user.phoneNumber ?? undefined,
      tx_ref: txRef,
      callback_url: `${apiBase}/api/v1/payments/chapa/webhook`,
      return_url: `${webBase}/pricing/payment/callback?tx=${txRef}`,
      customization: {
        title: 'Lor Mentor',
        description: `${plan.name} subscription`.slice(0, 50),
      },
    };

    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as ChapaInitResponse;
    if (!res.ok || json.status !== 'success' || !json.data?.checkout_url) {
      this.logger.error(
        `Chapa initialize failed: ${json.message ?? res.statusText}`,
      );
      throw new BadRequestException(
        json.message ?? 'Could not start the online payment',
      );
    }

    return { checkoutUrl: json.data.checkout_url, txRef };
  }

  /**
   * Webhook receiver. Chapa signs the raw request body with HMAC-SHA256 using
   * the webhook secret; we verify it before trusting anything, then confirm the
   * transaction through the verify endpoint (defence in depth).
   */
  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ received: true }> {
    this.verifySignature(rawBody, signature);

    let event: { tx_ref?: string; status?: string };
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    const txRef = event.tx_ref;
    if (!txRef) {
      // Nothing actionable, but acknowledge so Chapa stops retrying.
      return { received: true };
    }

    await this.confirmAndApprove(txRef).catch((err) => {
      this.logger.error(`Webhook approval failed for ${txRef}: ${String(err)}`);
    });

    return { received: true };
  }

  /**
   * Called by the browser callback page. Confirms ownership, then verifies and
   * approves if Chapa reports success. Lets the student see an instant result
   * even if the webhook is delayed.
   */
  async verifyByTxRef(txRef: string, requesterId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, userId: true, status: true, receiptNumber: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== requesterId) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === 'PENDING') {
      await this.confirmAndApprove(txRef);
    }

    const fresh = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, status: true, receiptNumber: true },
    });

    return {
      paymentId: fresh?.id,
      status: fresh?.status ?? 'PENDING',
      receiptNumber: fresh?.receiptNumber ?? null,
    };
  }

  /** Verify a tx with Chapa and, if it succeeded, finalize the approval. */
  private async confirmAndApprove(txRef: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { txRef },
      select: { id: true, status: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'APPROVED') return; // idempotent

    const res = await fetch(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(txRef)}`,
      { headers: { Authorization: `Bearer ${this.secretKey()}` } },
    );
    const json = (await res.json()) as ChapaVerifyResponse;

    const ok = json.status === 'success' && json.data?.status === 'success';
    if (!ok) {
      this.logger.warn(`Chapa verify not successful for ${txRef}`);
      return;
    }

    await this.payments.finalizeApproval(payment.id, {
      chapaRef: json.data?.reference ?? undefined,
      paidAt: new Date(),
    });
  }

  private verifySignature(rawBody: Buffer, signature: string | undefined) {
    const secret = this.config.get<string>('CHAPA_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('CHAPA_WEBHOOK_SECRET is not configured');
      throw new ServiceUnavailableException('Webhook not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  private publicApiBase(): string {
    return (
      this.config.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${this.config.get<string>('PORT') ?? '4000'}`
    );
  }

  private publicWebBase(): string {
    return (
      this.config.get<string>('WEB_PUBLIC_URL') ??
      this.config.get<string>('CORS_ORIGIN') ??
      'http://localhost:3000'
    );
  }
}
