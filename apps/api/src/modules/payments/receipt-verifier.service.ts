import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Normalized receipt payload returned by the receipt-verifier service.
 * Mirrors the contract in services/receipt-verifier/normalize.py.
 */
export interface NormalizedReceipt {
  bank: string;
  reference: string | null;
  amount: number | null;
  receiverAccount: string | null;
  receiverName: string | null;
  payerName: string | null;
  payerAccount: string | null;
  status: string | null;
  statusKnown: boolean;
  statusOk: boolean | null;
  date: string | null;
  raw: Record<string, unknown>;
}

/** Error codes the verifier can surface (see its README). */
export type VerifierErrorCode =
  | 'NOT_FOUND'
  | 'BLOCKED'
  | 'EXTRACT_FAILED'
  | 'BAD_INPUT'
  | 'MISSING_ACCOUNT'
  | 'URL_REQUIRED'
  | 'UNSUPPORTED_BANK'
  | 'UNAUTHORIZED'
  | 'DISABLED' // verifier not configured
  | 'UNREACHABLE'; // network/timeout talking to the service itself

export type VerifierResult =
  | { ok: true; receipt: NormalizedReceipt }
  | { ok: false; code: VerifierErrorCode; message: string };

export interface ExtractInput {
  bank: string;
  reference?: string;
  url?: string;
  account?: string;
}

/**
 * Thin HTTP client for the Python receipt-verifier service. It performs NO
 * verification policy of its own — it just fetches + surfaces a typed result.
 * All approve/reject decisions live in PaymentsService.
 */
@Injectable()
export class ReceiptVerifierService {
  private readonly logger = new Logger(ReceiptVerifierService.name);
  private readonly baseUrl: string | undefined;
  private readonly token: string | undefined;
  private readonly timeoutMs = 20_000; // extractors scrape live bank pages

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config
      .get<string>('RECEIPT_VERIFIER_URL')
      ?.replace(/\/+$/, '');
    this.token = this.config.get<string>('RECEIPT_VERIFIER_TOKEN');
  }

  /** True when a verifier URL is configured. */
  get enabled(): boolean {
    return Boolean(this.baseUrl);
  }

  async extract(input: ExtractInput): Promise<VerifierResult> {
    if (!this.baseUrl) {
      return { ok: false, code: 'DISABLED', message: 'Verifier not configured' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { 'x-verifier-token': this.token } : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      const json = (await res.json().catch(() => ({}))) as {
        detail?: { code?: VerifierErrorCode; message?: string };
      } & Partial<NormalizedReceipt>;

      if (!res.ok) {
        const code = json.detail?.code ?? 'EXTRACT_FAILED';
        const message = json.detail?.message ?? `Verifier returned ${res.status}`;
        // BLOCKED / EXTRACT_FAILED are expected operational states, not bugs.
        this.logger.warn(`Verifier ${input.bank} → ${code}: ${message}`);
        return { ok: false, code, message };
      }

      return { ok: true, receipt: json as NormalizedReceipt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Verifier unreachable: ${message}`);
      return { ok: false, code: 'UNREACHABLE', message };
    } finally {
      clearTimeout(timer);
    }
  }
}
