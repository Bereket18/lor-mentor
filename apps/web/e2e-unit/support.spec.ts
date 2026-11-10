import { expect, test } from "@playwright/test";
import {
  apiErrorMessage,
  categoryLabel,
  relativeTime,
  SUPPORT_ADMIN_STATUS_META,
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_STATUS_META,
} from "../src/lib/support";

const NOW = new Date("2026-11-11T12:00:00.000Z").getTime();

test.describe("relativeTime", () => {
  test("says just now for the last minute, including slight clock skew", () => {
    expect(relativeTime(new Date(NOW - 10_000), NOW)).toBe("just now");
    expect(relativeTime(new Date(NOW + 5_000), NOW)).toBe("just now");
  });

  test("counts minutes, hours and days", () => {
    expect(relativeTime(new Date(NOW - 5 * 60_000), NOW)).toBe("5 min ago");
    expect(relativeTime(new Date(NOW - 3 * 3_600_000), NOW)).toBe("3 h ago");
    expect(relativeTime(new Date(NOW - 2 * 86_400_000), NOW)).toBe("2 d ago");
  });

  test("falls back to a plain date after a week", () => {
    expect(relativeTime(new Date("2026-10-01T08:00:00.000Z"), NOW)).toBe(
      "01 Oct 2026",
    );
  });

  test("renders a dash for missing or invalid values", () => {
    expect(relativeTime(null, NOW)).toBe("—");
    expect(relativeTime("not a date", NOW)).toBe("—");
  });
});

test.describe("labels", () => {
  test("every category in the form has a human label", () => {
    for (const option of SUPPORT_CATEGORY_OPTIONS) {
      expect(categoryLabel(option.value)).not.toBe(option.value);
    }
  });

  test("an unknown category is passed through rather than hidden", () => {
    expect(categoryLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  test("both status maps cover every status", () => {
    for (const status of [
      "OPEN",
      "AWAITING_STUDENT",
      "RESOLVED",
      "CLOSED",
    ] as const) {
      expect(SUPPORT_STATUS_META[status].label).toBeTruthy();
      expect(SUPPORT_ADMIN_STATUS_META[status].label).toBeTruthy();
    }
    // The same status reads differently to the two audiences.
    expect(SUPPORT_STATUS_META.AWAITING_STUDENT.label).toBe("Waiting for you");
    expect(SUPPORT_ADMIN_STATUS_META.AWAITING_STUDENT.label).toBe(
      "Waiting for student",
    );
  });
});

test.describe("apiErrorMessage", () => {
  test("uses a single validation message", () => {
    expect(
      apiErrorMessage(
        { response: { data: { message: "Ticket not found" } } },
        "fallback",
      ),
    ).toBe("Ticket not found");
  });

  test("joins the array class-validator returns", () => {
    expect(
      apiErrorMessage(
        { response: { data: { message: ["body too short", "subject too short"] } } },
        "fallback",
      ),
    ).toBe("body too short subject too short");
  });

  test("falls back for network errors and empty messages", () => {
    expect(apiErrorMessage(new Error("Network Error"), "fallback")).toBe(
      "fallback",
    );
    expect(apiErrorMessage({ response: { data: {} } }, "fallback")).toBe(
      "fallback",
    );
  });
});
