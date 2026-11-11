import { expect, test } from "@playwright/test";
import {
  bankFromReceiptUrl,
  barcodeDetectorAvailable,
  extractReceiptScan,
  looksLikeReceiptUrl,
  looksLikeReference,
  normalizeQrText,
  SCAN_INTERVAL_MS,
} from "../src/lib/qr-scan";

test("normalizeQrText removes the whitespace a printed QR carries", () => {
  expect(normalizeQrText("  https://apps.cbe.com.et:100/?id=FT1  ")).toBe(
    "https://apps.cbe.com.et:100/?id=FT1",
  );
  // A link split over two lines in the receipt layout must become one URL.
  expect(normalizeQrText("https://apps.cbe.com.et:100/\n?id=FT1")).toBe(
    "https://apps.cbe.com.et:100/?id=FT1",
  );
  expect(normalizeQrText("\u200bhttps://x/y\u200b")).toBe("https://x/y");
});

test("a receipt scan keeps a link as a link and names the bank it can", () => {
  const scan = extractReceiptScan("https://apps.cbe.com.et:100/?id=FT1");
  expect(scan).toEqual({
    url: "https://apps.cbe.com.et:100/?id=FT1",
    reference: null,
    bank: "cbe",
    raw: "https://apps.cbe.com.et:100/?id=FT1",
  });
  expect(
    extractReceiptScan("https://transactioninfo.ethiotelecom.et/receipt/CHQ1A2B3C")?.bank,
  ).toBe("tele");
});

test("an unknown receipt host only pre-fills the link, it does not guess a bank", () => {
  const scan = extractReceiptScan("https://receipt.example-bank.et/r/ABC123");
  expect(scan?.url).toBe("https://receipt.example-bank.et/r/ABC123");
  expect(scan?.bank).toBeNull();
});

test("a bare reference is accepted, a plain English QR is not", () => {
  expect(looksLikeReference("FT25211G11JQ12345678")).toBe(true);
  expect(looksLikeReference("CHQ0FJ403O")).toBe(true);
  expect(looksLikeReference("Pay invoice 42 at the counter")).toBe(false);

  expect(extractReceiptScan("FT25211G11JQ12345678")).toEqual({
    url: null,
    reference: "FT25211G11JQ12345678",
    bank: null,
    raw: "FT25211G11JQ12345678",
  });
  expect(extractReceiptScan("scan to download our app")).toBeNull();
  expect(extractReceiptScan("")).toBeNull();
  expect(extractReceiptScan("   ")).toBeNull();
});

test("looksLikeReceiptUrl is strict about the scheme", () => {
  expect(looksLikeReceiptUrl("http://localhost:3000/pay")).toBe(true);
  expect(looksLikeReceiptUrl("https://apps.cbe.com.et/?id=FT1")).toBe(true);
  expect(looksLikeReceiptUrl("javascript:alert(1)")).toBe(false);
  expect(looksLikeReceiptUrl("apps.cbe.com.et/?id=FT1")).toBe(false);
});

test("bankFromReceiptUrl tolerates garbage instead of throwing", () => {
  expect(bankFromReceiptUrl("not a url")).toBeNull();
  expect(bankFromReceiptUrl("https://evil.example/apps.cbe.com.et")).toBeNull();
  expect(bankFromReceiptUrl("HTTPS://APPS.CBE.COM.ET:100/?id=FT1")).toBe("cbe");
});

test("barcodeDetectorAvailable answers a yes/no, never throws", () => {
  expect(typeof barcodeDetectorAvailable()).toBe("boolean");
});

test("frames are sampled at a rate a mid-range phone can decode", () => {
  // jsQR blocks the UI thread, so the loop must not spin at animation speed.
  expect(SCAN_INTERVAL_MS).toBeGreaterThanOrEqual(100);
  expect(SCAN_INTERVAL_MS).toBeLessThanOrEqual(500);
});
