/**
 * Pure helpers behind the live receipt-QR scanner.
 *
 * These functions only READ text. Nothing here decides that a payment is
 * real: a scanned value is dropped into the ordinary reference/URL flow and
 * `POST /payments/verify` (Cheki, then the bank, server side) stays the only
 * thing that can approve a payment. A QR is a typing convenience, never
 * evidence.
 */

/** Receipt-link hosts the server can already act on (see cheki.service.ts). */
const KNOWN_RECEIPT_HOSTS: Record<string, 'cbe' | 'tele'> = {
  'apps.cbe.com.et': 'cbe',
  'transactioninfo.ethiotelecom.et': 'tele',
};

/** A bank we can name from a receipt link without being told by the student. */
export type KnownBank = 'cbe' | 'tele';

export interface ReceiptScan {
  /** Receipt link, when the QR carried one (what the server prefers). */
  url: string | null;
  /** Bare transaction reference, when that is all the QR carried. */
  reference: string | null;
  /** Bank implied by the link's host, or null when it must be picked. */
  bank: KnownBank | null;
  /** The decoded text, trimmed of invisible whitespace, for confirmation. */
  raw: string;
}

/**
 * QR payloads frequently pick up leading/trailing whitespace or zero-width
 * characters from the printing layout, and a link split across lines must be
 * one URL again. Removing whitespace is safe here because we only ever look
 * for a link or a reference token.
 */
export function normalizeQrText(raw: string): string {
  return raw.replace(/[\s\u200b\ufeff]+/g, '').trim();
}

export function looksLikeReceiptUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text);
}

/**
 * Which bank a receipt link belongs to. Deliberately limited to the two hosts
 * the server already parses itself; for every other bank the student still
 * picks the provider, because guessing costs a rejected verification.
 */
export function bankFromReceiptUrl(url: string): KnownBank | null {
  try {
    return KNOWN_RECEIPT_HOSTS[new URL(url).hostname.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

/**
 * Reference shapes Ethiopian receipts commonly print: a CBE FT number (10
 * characters then the receiving-account digits) or a Telebirr receipt id.
 * Anything else is treated as "not a receipt" rather than pasted into the
 * form as if it were.
 */
const REFERENCE_PATTERNS: readonly RegExp[] = [
  /^FT[0-9A-Za-z]{10}\d{6,}$/,
  /^CHQ[0-9A-Za-z]{6,}$/,
];

export function looksLikeReference(text: string): boolean {
  return REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Turn decoded QR text into what the verify form can use, or null when the
 * code did not scan a receipt (a poster, a PDF link, a payment app home
 * page). Returning null keeps the camera open for another frame instead of
 * filing nonsense for an admin.
 */
export function extractReceiptScan(raw: string): ReceiptScan | null {
  const text = normalizeQrText(raw);
  if (!text) return null;

  if (looksLikeReceiptUrl(text)) {
    return {
      url: text,
      reference: null,
      bank: bankFromReceiptUrl(text),
      raw: text,
    };
  }

  if (looksLikeReference(text)) {
    return { url: null, reference: text, bank: null, raw: text };
  }

  return null;
}

/** True when the browser can decode camera frames natively, without jsQR. */
export function barcodeDetectorAvailable(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Frames are sampled, never decoded in a tight loop: jsQR is synchronous and
 * runs on the UI thread, so 4 frames/second keeps a mid-range phone usable
 * while still catching a steady hand within a second or two.
 */
export const SCAN_INTERVAL_MS = 250;

/** Cap on the longest side handed to the decoder, in pixels. */
export const SCAN_FRAME_MAX_EDGE = 480;
