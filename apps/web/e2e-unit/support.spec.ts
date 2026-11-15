import { expect, test } from "@playwright/test";
import {
  apiErrorMessage,
  categoryLabel,
  newPaymentTicketHref,
  newTicketHref,
  PAYMENT_SUPPORT_PENDING_HOURS,
  relativeTime,
  shouldOfferPaymentSupport,
  SUPPORT_ADMIN_STATUS_META,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_STATUS_META,
  supportTicketHref,
  ticketNumberLabel,
  validateAttachmentFiles,
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

test.describe("attachment validation", () => {
  const image = (name: string, size = 1024, type = "image/png") => ({
    name,
    size,
    type,
  });

  test("accepts up to three images of an allowed type", () => {
    const { accepted, errors } = validateAttachmentFiles([], [
      image("one.png"),
      image("two.jpg", 2048, "image/jpeg"),
      image("three.webp", 4096, "image/webp"),
    ]);
    expect(errors).toEqual([]);
    expect(accepted.map((file) => file.name)).toEqual([
      "one.png",
      "two.jpg",
      "three.webp",
    ]);
  });

  test("refuses a fourth image", () => {
    const { accepted, errors } = validateAttachmentFiles(
      [image("one.png"), image("two.png")],
      [image("three.png"), image("four.png")],
    );
    expect(accepted.map((file) => file.name)).toEqual(["three.png"]);
    expect(errors[0]).toContain("at most 3 images");
  });

  test("refuses non-images and files over the size cap", () => {
    const { accepted, errors } = validateAttachmentFiles([], [
      image("notes.pdf", 1024, "application/pdf"),
      image("huge.png", SUPPORT_ATTACHMENT_MAX_BYTES + 1),
    ]);
    expect(accepted).toEqual([]);
    expect(errors).toEqual([
      "notes.pdf: only JPEG, PNG or WebP images are accepted.",
      "huge.png: images must be 5 MB or smaller.",
    ]);
  });
});

test.describe("routes", () => {
  test("ticket links encode the id", () => {
    expect(supportTicketHref("abc 123")).toBe("/support/tickets/abc%20123");
  });

  test("the payment ticket carries category and payment hint", () => {
    expect(newPaymentTicketHref("pay_1")).toBe(
      "/support/new?category=PAYMENT&payment=pay_1",
    );
    expect(newTicketHref()).toBe("/support/new");
    expect(newTicketHref("TECHNICAL")).toBe("/support/new?category=TECHNICAL");
  });

  test("ticket numbers are padded to six digits", () => {
    expect(ticketNumberLabel(123)).toBe("T-000123");
    expect(ticketNumberLabel(1234567)).toBe("T-1234567");
  });
});

test.describe("payment support entry points", () => {
  const NOW = new Date("2026-11-11T12:00:00.000Z").getTime();
  const hoursAgo = (hours: number) =>
    new Date(NOW - hours * 3_600_000).toISOString();

  test("offers help for rejected, expired and reversed payments", () => {
    for (const status of ["REJECTED", "EXPIRED", "REVERSED"]) {
      expect(
        shouldOfferPaymentSupport({ status, createdAt: hoursAgo(1) }, NOW),
      ).toBe(true);
    }
  });

  test("does not offer help for an approved or recently pending payment", () => {
    expect(
      shouldOfferPaymentSupport({ status: "APPROVED", createdAt: hoursAgo(1) }, NOW),
    ).toBe(false);
    expect(
      shouldOfferPaymentSupport(
        {
          status: "PENDING",
          createdAt: hoursAgo(PAYMENT_SUPPORT_PENDING_HOURS - 1),
        },
        NOW,
      ),
    ).toBe(false);
  });

  test("offers help once a pending payment passes the review window", () => {
    expect(
      shouldOfferPaymentSupport(
        {
          status: "PENDING",
          createdAt: hoursAgo(PAYMENT_SUPPORT_PENDING_HOURS),
        },
        NOW,
      ),
    ).toBe(true);
  });
});
