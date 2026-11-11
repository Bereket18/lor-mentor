import { expect, test } from "@playwright/test";
import {
  MAX_VERIFICATION_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_CODE_LENGTH,
  isCompleteVerificationCode,
  resendCooldownRemaining,
  sanitizeVerificationCode,
} from "../src/lib/verification-code";

test.describe("sanitizeVerificationCode", () => {
  test("keeps exactly six digits", () => {
    expect(sanitizeVerificationCode("428193")).toBe("428193");
    expect(sanitizeVerificationCode("428193").length).toBe(
      VERIFICATION_CODE_LENGTH,
    );
  });

  test("keeps leading zeroes as digits", () => {
    // A numeric input or a Number() round-trip would turn this into 42.
    expect(sanitizeVerificationCode("000042")).toBe("000042");
    expect(sanitizeVerificationCode("000000")).toBe("000000");
  });

  test("copes with how codes actually arrive from an inbox", () => {
    expect(sanitizeVerificationCode(" 428193 ")).toBe("428193");
    expect(sanitizeVerificationCode("428193\n")).toBe("428193");
    expect(sanitizeVerificationCode("\t428193")).toBe("428193");
    expect(sanitizeVerificationCode("428 193")).toBe("428193");
    expect(sanitizeVerificationCode("428-193")).toBe("428193");
  });

  test("drops anything that is not a digit", () => {
    expect(sanitizeVerificationCode("abc")).toBe("");
    expect(sanitizeVerificationCode("12ab34")).toBe("1234");
    expect(sanitizeVerificationCode("+428193")).toBe("428193");
  });

  test("never returns more than six digits", () => {
    // A pasted long token is truncated rather than rejected; the first six
    // digits simply fail to match at the API.
    expect(sanitizeVerificationCode("4281937")).toBe("428193");
    expect(sanitizeVerificationCode("a".repeat(64))).toBe("");
    expect(sanitizeVerificationCode("123456789012345")).toHaveLength(
      VERIFICATION_CODE_LENGTH,
    );
  });

  test("is idempotent, so re-sanitizing a controlled value is safe", () => {
    const once = sanitizeVerificationCode("  42 81 93 ");
    expect(sanitizeVerificationCode(once)).toBe(once);
  });

  test("returns a string for empty input rather than throwing", () => {
    expect(sanitizeVerificationCode("")).toBe("");
  });
});

test.describe("isCompleteVerificationCode", () => {
  test("accepts a full six-digit code", () => {
    expect(isCompleteVerificationCode("428193")).toBe(true);
    expect(isCompleteVerificationCode("000042")).toBe(true);
  });

  test("rejects partial, empty and over-long values", () => {
    for (const value of ["", "4", "42819", "4281937", "42819a", " 428193"]) {
      expect(isCompleteVerificationCode(value)).toBe(false);
    }
  });
});

test.describe("attempt budget mirror", () => {
  test("stays small, matching the API's per-code limit", () => {
    // Used only to tell the user why a correct code stopped working. If it
    // drifts from the API's MAX_VERIFY_ATTEMPTS the server still enforces its
    // own number; only the wording would be early or late.
    expect(MAX_VERIFICATION_ATTEMPTS).toBe(5);
  });
});

test.describe("resendCooldownRemaining", () => {
  const sentAt = 1_700_000_000_000;

  test("counts down from the full cooldown", () => {
    expect(resendCooldownRemaining(sentAt, sentAt)).toBe(
      RESEND_COOLDOWN_SECONDS,
    );
    expect(resendCooldownRemaining(sentAt, sentAt + 1_000)).toBe(
      RESEND_COOLDOWN_SECONDS - 1,
    );
    expect(resendCooldownRemaining(sentAt, sentAt + 59_000)).toBe(1);
  });

  test("reaches zero exactly when the cooldown elapses and then stays there", () => {
    expect(resendCooldownRemaining(sentAt, sentAt + 60_000)).toBe(0);
    expect(resendCooldownRemaining(sentAt, sentAt + 600_000)).toBe(0);
  });

  test("is zero when nothing has been sent yet", () => {
    // The button starts enabled: there is no send to wait on.
    expect(resendCooldownRemaining(undefined, sentAt)).toBe(0);
  });

  test("never goes negative if the clock moves backwards", () => {
    expect(resendCooldownRemaining(sentAt, sentAt - 5_000)).toBe(
      RESEND_COOLDOWN_SECONDS,
    );
  });
});
