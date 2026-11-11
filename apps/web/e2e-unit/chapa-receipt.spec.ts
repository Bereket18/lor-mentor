import { expect, test } from "@playwright/test";
import { chapaReceiptUrl } from "../src/lib/chapa-receipt";

test("builds Chapa's permanent receipt URL from its reference", () => {
  expect(chapaReceiptUrl("APQ1kcaiCZi2")).toBe(
    "https://chapa.link/payment-receipt/APQ1kcaiCZi2",
  );
});

test("encodes the reference and rejects a missing one", () => {
  expect(chapaReceiptUrl("ref/with space")).toBe(
    "https://chapa.link/payment-receipt/ref%2Fwith%20space",
  );
  expect(chapaReceiptUrl(null)).toBeNull();
  expect(chapaReceiptUrl(undefined)).toBeNull();
  expect(chapaReceiptUrl("   ")).toBeNull();
});
