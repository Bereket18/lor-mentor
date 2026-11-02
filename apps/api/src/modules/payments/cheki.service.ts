import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NormalizedReceipt } from './receipt-verifier.service';

/**
 * Cheki (https://cheki.et) receipt-verification adapter — the PRIMARY
 * automated verification source for bank-transfer receipts.
 *
 * Why an adapter (and not part of the policy): this service only *fetches and
 * normalizes* bank data from Cheki's public API. It performs NO approval
 * policy of its own — every approve/reject/review decision stays in
 * PaymentsService (same single decision path as the local verifier). The local
 * receipt-verifier service remains the FALLBACK when Cheki is unreachable,
 * rate-limited, or cannot decode a receipt.
 *
 * Trust rules implemented here:
 *  - Only `verified === true` (the bank's own record confirms the receipt)
 *    produces a receipt the pipeline may auto-approve. `decodedOnly: true`
 *    and every error path return WITHOUT a receipt, so a decoded QR, a
 *    fallback URL, or a Cheki outage can never grant paid access on its own.
 *  - Responses are schema-validated defensively: observed live responses put
 *    fields at the top level, older docs describe a `result` wrapper — both
 *    are accepted, anything else is rejected as MALFORMED.
 *  - Timeouts (AbortController) and a small result cache protect both the
 *    student flow and Cheki's per-IP rate limits (30/min).
 *  - Receipt references are redacted in logs.
 */
export type ChekiFailureCode =
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED_BANK'
  | 'BAD_INPUT'
  | 'RATE_LIMITED'
  | 'FALLBACK_REQUIRED'
  | 'UNREACHABLE'
  | 'HTTP_ERROR'
  | 'MALFORMED'
  | 'DECLINED';

export type ChekiOutcome =
  | { kind: 'VERIFIED'; receipt: NormalizedReceipt; cached: boolean }
  | { kind: 'DECODED_ONLY'; message: string }
  | { kind: 'FAILED'; code: ChekiFailureCode; message: string };

/**
 * Result of scanning an uploaded screenshot for a receipt QR code
 * (POST /api/ocr). A FOUND result is only a LOOKUP HINT — the reference must
 * still be confirmed against the bank (`verify`) before anything can be
 * approved. Cheki's own docs: "The QR is not proof of payment."
 */
export type ChekiScanOutcome =
  | {
      kind: 'FOUND';
      /** Cheki's bank code (e.g. "telebirr", "cbe"). */
      bankCode: string;
      /** Our supported bank id, or null when we don't support the bank. */
      bank: string | null;
      /** The lookup reference Cheki extracted (receipt id / transaction no.). */
      reference: string;
      /** Raw QR text — a full receipt URL for most receipts. */
      text: string;
    }
  | { kind: 'NONE' }
  | { kind: 'FAILED'; code: ChekiFailureCode; message: string };

export interface ChekiVerifyInput {
  /** Our bank id from the catalog (see bank-catalog.ts). */
  bank: string;
  /** Bare transaction reference (FT number, receipt id, …). */
  reference?: string;
  /** Full receipt link, when the student pasted one. */
  url?: string;
  /** Account digits — required only by legacy CBE and BOA formats. */
  account?: string;
}

interface ChekiRequest {
  bank: string;
  reference: string;
  accountNumber?: string;
}

/** Maps our bank ids to Cheki's documented bank codes. */
const CHEKI_BANK_IDS: Record<string, string> = {
  cbe: 'cbe',
  dashen: 'dashen',
  awash: 'awash',
  boa: 'boa',
  zemen: 'zemen',
  tele: 'telebirr',
  // Mobile wallets / eBirr-family banks Cheki can confirm. The generic
  // branch below passes the reference or full receipt link through, which is
  // exactly the request shape these formats use.
  mpesa: 'mpesa',
  siinqee: 'siinqee',
  ebirr: 'ebirr',
  zamzam: 'zamzam',
};

/** Reverse map: Cheki bank code → our bank id (only banks we support). */
const CHEKI_TO_OURS: Record<string, string> = {
  cbe: 'cbe',
  dashen: 'dashen',
  awash: 'awash',
  boa: 'boa',
  zemen: 'zemen',
  telebirr: 'tele',
  mpesa: 'mpesa',
  siinqee: 'siinqee',
  ebirr: 'ebirr',
  zamzam: 'zamzam',
};

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_CACHE_ENTRIES = 200;
/** Cheki caps OCR image uploads at 10 MB. */
const MAX_OCR_IMAGE_BYTES = 10 * 1024 * 1024;

/** Mask a reference for logs — never log complete receipts/links. */
function redact(value: string): string {
  if (value.length <= 8) return '•••';
  return `${value.slice(0, 4)}…${value.length} chars`;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Cheki dates look like "10/13/2026 8:02:00 PM"; normalize to ISO. */
function toIsoDate(value: string | null): string | null {
  if (!value) return null;
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return null;
  return asDate.toISOString();
}

@Injectable()
export class ChekiService {
  private readonly logger = new Logger(ChekiService.name);
  private readonly baseUrl: string;
  private readonly enabledFlag: boolean;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<
    string,
    { expires: number; outcome: ChekiOutcome }
  >();

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('CHEKI_BASE_URL') ?? 'https://cheki.et'
    ).replace(/\/+$/, '');
    const enabled = (
      this.config.get<string>('CHEKI_ENABLED') ?? 'true'
    ).toLowerCase();
    this.enabledFlag =
      Boolean(this.baseUrl) && enabled !== 'false' && enabled !== '0';
    this.timeoutMs = Number(
      this.config.get<string>('CHEKI_TIMEOUT_MS') ?? '20000',
    );
    this.cacheTtlMs = Number(
      this.config.get<string>('CHEKI_CACHE_TTL_MS') ?? '300000',
    );
  }

  /** True when Cheki should be used (default: enabled). */
  get enabled(): boolean {
    return this.enabledFlag;
  }

  /** Test helper: drop cached outcomes. */
  clearCache(): void {
    this.cache.clear();
  }

  async verify(input: ChekiVerifyInput): Promise<ChekiOutcome> {
    if (!this.enabled) {
      return {
        kind: 'FAILED',
        code: 'NOT_CONFIGURED',
        message: 'Cheki is disabled',
      };
    }

    const request = this.buildRequest(input);
    if ('code' in request) {
      return { kind: 'FAILED', code: request.code, message: request.message };
    }

    const cacheKey = `${request.bank}|${request.reference}|${request.accountNumber ?? ''}`;
    const cached = this.readCache(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank: request.bank,
          reference: request.reference,
          ...(request.accountNumber
            ? { accountNumber: request.accountNumber }
            : {}),
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        this.logger.warn(`Cheki ${request.bank}: oversized response`);
        return {
          kind: 'FAILED',
          code: 'MALFORMED',
          message: 'Cheki returned an oversized response',
        };
      }

      let body: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = JSON.parse(text);
        body =
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
      } catch {
        body = null;
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        return {
          kind: 'FAILED',
          code: 'RATE_LIMITED',
          message: retryAfter
            ? `Cheki rate limit hit (retry after ${retryAfter}s)`
            : 'Cheki rate limit hit',
        };
      }

      if (!body) {
        return {
          kind: 'FAILED',
          code: 'MALFORMED',
          message: `Cheki returned unreadable JSON (HTTP ${res.status})`,
        };
      }

      if (!res.ok) {
        const message =
          readString(body.error) ?? `Cheki returned HTTP ${res.status}`;
        this.logger.warn(
          `Cheki ${request.bank} ${redact(request.reference)} → HTTP ${res.status}`,
        );
        return { kind: 'FAILED', code: 'HTTP_ERROR', message };
      }

      // Observed live responses carry fields at the top level; the docs also
      // describe a `result` wrapper. Accept both; reject anything else.
      const result = (
        body.result !== null &&
        typeof body.result === 'object' &&
        !Array.isArray(body.result)
          ? body.result
          : body
      ) as Record<string, unknown>;

      if (result.verified === true) {
        const outcome: ChekiOutcome = {
          kind: 'VERIFIED',
          receipt: this.toReceipt(input.bank, request, result, body),
          cached: body.cached === true,
        };
        this.writeCache(cacheKey, outcome);
        this.logger.log(
          `Cheki verified ${request.bank} ${redact(request.reference)}`,
        );
        return outcome;
      }

      if (result.decodedOnly === true) {
        const outcome: ChekiOutcome = {
          kind: 'DECODED_ONLY',
          message: 'Cheki decoded the receipt but the bank did not confirm it',
        };
        this.writeCache(cacheKey, outcome);
        this.logger.warn(
          `Cheki decoded-only ${request.bank} ${redact(request.reference)}`,
        );
        return outcome;
      }

      const fallbackUrl =
        readString(result.fallbackUrl) ?? readString(body.fallbackUrl);
      if (fallbackUrl) {
        // Telebirr / M-Pesa out-of-country case. Opening this link in a
        // browser is NOT server-side verification — route to local fallback
        // or manual review; never treat as verified.
        return {
          kind: 'FAILED',
          code: 'FALLBACK_REQUIRED',
          message: 'Cheki requires in-country confirmation for this receipt',
        };
      }

      if (body.success === false && readString(body.error)) {
        return {
          kind: 'FAILED',
          code: 'DECLINED',
          message: readString(body.error) as string,
        };
      }

      return {
        kind: 'FAILED',
        code: 'MALFORMED',
        message: 'Cheki response could not be interpreted',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Cheki unreachable for ${request.bank}: ${message}`);
      return { kind: 'FAILED', code: 'UNREACHABLE', message };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Read a receipt QR code out of an uploaded image via Cheki's OCR endpoint
   * (POST /api/ocr, multipart field `image`). Implemented server-side so every
   * client benefits and the image never has to be decoded in the browser.
   *
   * SECURITY: the QR is a lookup hint only. Callers must confirm the returned
   * reference against the bank (`verify`) and pass the normal receipt checks
   * before approval — a QR (or OCR text) can never grant access by itself.
   */
  async scanReceiptImage(
    image: Buffer,
    opts: { filename?: string; mimeType?: string } = {},
  ): Promise<ChekiScanOutcome> {
    if (!this.enabled) {
      return {
        kind: 'FAILED',
        code: 'NOT_CONFIGURED',
        message: 'Cheki is disabled',
      };
    }
    if (image.length === 0 || image.length > MAX_OCR_IMAGE_BYTES) {
      return {
        kind: 'FAILED',
        code: 'MALFORMED',
        message: 'Receipt image is empty or too large for automated scanning',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const form = new FormData();
      form.append(
        'image',
        new Blob([new Uint8Array(image)], {
          type: opts.mimeType ?? 'image/jpeg',
        }),
        opts.filename ?? 'receipt.jpg',
      );

      const res = await fetch(`${this.baseUrl}/api/ocr`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      const text = await res.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        this.logger.warn('Cheki OCR: oversized response');
        return {
          kind: 'FAILED',
          code: 'MALFORMED',
          message: 'Cheki returned an oversized response',
        };
      }

      let body: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = JSON.parse(text);
        body =
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
      } catch {
        body = null;
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        return {
          kind: 'FAILED',
          code: 'RATE_LIMITED',
          message: retryAfter
            ? `Cheki OCR rate limit hit (retry after ${retryAfter}s)`
            : 'Cheki OCR rate limit hit',
        };
      }

      if (!body) {
        return {
          kind: 'FAILED',
          code: 'MALFORMED',
          message: `Cheki OCR returned unreadable JSON (HTTP ${res.status})`,
        };
      }

      if (!res.ok || body.success === false) {
        const message =
          readString(body.error) ?? `Cheki OCR returned HTTP ${res.status}`;
        this.logger.warn(`Cheki OCR → HTTP ${res.status}`);
        return { kind: 'FAILED', code: 'HTTP_ERROR', message };
      }

      const bankCode = readString(body.bank);
      const reference = readString(body.reference);
      if (readString(body.source) === 'qr' && bankCode && reference) {
        this.logger.log(
          `Cheki OCR read a ${bankCode} QR (${redact(reference)})`,
        );
        return {
          kind: 'FOUND',
          bankCode,
          bank: CHEKI_TO_OURS[bankCode.toLowerCase()] ?? null,
          reference,
          text: readString(body.text) ?? reference,
        };
      }

      // No QR detected (or the QR carried nothing we can look up).
      return { kind: 'NONE' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Cheki OCR unreachable: ${message}`);
      return { kind: 'FAILED', code: 'UNREACHABLE', message };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Translate our (bank, reference | url, account) input into Cheki's
   * documented per-bank request shape. Returns an error object for inputs we
   * can never send (unsupported bank / nothing to look up).
   */
  private buildRequest(
    input: ChekiVerifyInput,
  ): ChekiRequest | { code: ChekiFailureCode; message: string } {
    const chekiBank = CHEKI_BANK_IDS[input.bank];
    if (!chekiBank) {
      return {
        code: 'UNSUPPORTED_BANK',
        message: `Bank "${input.bank}" is not supported by Cheki`,
      };
    }

    const trimmedRef = input.reference?.trim();
    const url =
      input.url?.trim() ??
      (trimmedRef && /^https:\/\//i.test(trimmedRef) ? trimmedRef : undefined);
    const bareRef = url ? undefined : trimmedRef;
    const account = input.account?.replace(/\D/g, '') || undefined;

    if (input.bank === 'cbe') {
      if (url) {
        // Legacy receipts look like ?id=<FT…><last 8 digits>; Cheki expects
        // the FT reference + account digits. Anything else (mbreciept links
        // or other receipt links) is passed as a link — Cheki accepts
        // receipt IDs and mbreciept links directly.
        const parsed = this.parseLegacyCbeLink(url);
        if (parsed) {
          return {
            bank: 'cbe',
            reference: parsed.ft,
            ...(parsed.digits ? { accountNumber: parsed.digits } : {}),
          };
        }
        return { bank: 'cbe', reference: url };
      }
      if (!bareRef) {
        return {
          code: 'BAD_INPUT',
          message: 'Provide the CBE FT reference or the receipt link',
        };
      }
      return {
        bank: 'cbe',
        reference: bareRef,
        ...(account ? { accountNumber: account } : {}),
      };
    }

    if (input.bank === 'tele') {
      // Telebirr accepts the transaction number or the receipt link; when a
      // link is given, extract the reference so Cheki does not have to.
      const fromUrl = url ? this.extractTelebirrRef(url) : null;
      const reference = fromUrl ?? bareRef ?? url;
      if (!reference) {
        return {
          code: 'BAD_INPUT',
          message: 'Provide the Telebirr transaction number or receipt link',
        };
      }
      return { bank: 'telebirr', reference };
    }

    // dashen / awash / boa / zemen / mpesa / siinqee / ebirr / zamzam —
    // receipt links are the reference; bare references pass through (BOA
    // additionally needs account digits).
    const reference = url ?? bareRef;
    if (!reference) {
      return {
        code: 'BAD_INPUT',
        message: 'Provide the receipt link or the transaction reference',
      };
    }
    const request: ChekiRequest = { bank: chekiBank, reference };
    if (input.bank === 'boa' && !url && account) {
      request.accountNumber = account;
    }
    return request;
  }

  /** Parse a legacy CBE receipt link into FT reference + account digits. */
  private parseLegacyCbeLink(
    url: string,
  ): { ft: string; digits: string | null } | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== 'apps.cbe.com.et') return null;
      const id = (parsed.searchParams.get('id') ?? '').trim();
      const match = /^(FT[0-9A-Za-z]{10})(\d{8,})$/.exec(id);
      if (!match) return null;
      return { ft: match[1].toUpperCase(), digits: match[2] };
    } catch {
      return null;
    }
  }

  /** Extract the transaction reference from a Telebirr receipt link. */
  private extractTelebirrRef(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== 'transactioninfo.ethiotelecom.et') {
        return null;
      }
      const match = /\/receipt\/([0-9A-Za-z]+)/.exec(parsed.pathname);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /** Map a Cheki-verified payload onto our internal receipt contract. */
  private toReceipt(
    bank: string,
    request: ChekiRequest,
    result: Record<string, unknown>,
    body: Record<string, unknown>,
  ): NormalizedReceipt {
    return {
      bank,
      reference: readString(result.reference) ?? request.reference,
      amount: readNumber(result.amount),
      currency: readString(result.currency),
      receiverAccount: readString(result.receiverAccount),
      receiverName: readString(result.receiverName),
      payerName: readString(result.senderName),
      payerAccount: readString(result.senderAccount),
      status: null,
      statusKnown: false,
      statusOk: null,
      date: toIsoDate(readString(result.date)),
      source: 'cheki',
      raw: {
        source: 'cheki',
        bankCode: readString(result.bankCode) ?? request.bank,
        verified: true,
        cached: body.cached === true,
        branch: readString(result.branch),
        sourceUrl: readString(result.sourceUrl),
      },
    };
  }

  private readCache(key: string): ChekiOutcome | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expires <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.outcome;
  }

  private writeCache(key: string, outcome: ChekiOutcome): void {
    // Only cache definitive answers; failures must be retried (the bank or
    // Cheki may recover), and caching them would hide that.
    if (outcome.kind === 'FAILED') return;
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(key, { expires: Date.now() + this.cacheTtlMs, outcome });
  }
}
