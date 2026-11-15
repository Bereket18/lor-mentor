import { test, expect, type Page } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PAYMENT_TICKET_SUBJECT,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
  SUPPORT_ENABLED,
  signIn,
} from "./support-helpers";

/**
 * Support centre UI tests against the seeded fixture database.
 *
 * Prereqs:
 *   - API on :4000 against a disposable database seeded with
 *     `npm run seed:support-fixtures` (apps/api), and the web app on :3000;
 *   - enable with:  E2E_RUN_SUPPORT=1 npm run e2e -- support
 *
 * The fixture accounts are printed by the seeder. Override with
 * E2E_SUPPORT_STUDENT_EMAIL / PASSWORD and E2E_SUPPORT_ADMIN_EMAIL / PASSWORD.
 *
 * What these tests prove that the unit suites cannot:
 *   - a real multipart upload of a browser-selected image survives the API's
 *     magic-byte check, sharp re-encode and authenticated thumbnail fetch;
 *   - the student thread never renders internal notes, even though the same
 *     ticket has one and the admin thread does render it.
 */
const INTERNAL_NOTE_SNIPPET = "Checked the CBE statement";

/** A 1×1 PNG; small enough to upload, real enough to pass the magic-byte check. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.skip(
  !SUPPORT_ENABLED,
  "Set E2E_RUN_SUPPORT=1 and seed the support fixtures (npm run seed:support-fixtures) to enable these tests.",
);

test.beforeEach(() => {
  test.setTimeout(120_000);
});

async function openPaymentTicketAsStudent(page: Page) {
  await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);
  await page.goto("/support/tickets", { waitUntil: "networkidle" });
  await page
    .getByRole("link", { name: new RegExp(PAYMENT_TICKET_SUBJECT, "i") })
    .click();
  // A dev server compiles the dynamic route on first visit.
  await expect(page).toHaveURL(/\/support\/tickets\/[^/]+$/, { timeout: 45_000 });
  await expect(
    page.getByRole("heading", { name: PAYMENT_TICKET_SUBJECT }),
  ).toBeVisible({ timeout: 20_000 });
}

test.describe("student help centre", () => {
  test("the thread shows the staff reply but never the internal note", async ({
    page,
  }) => {
    await openPaymentTicketAsStudent(page);

    // The conversation the student is meant to see is there.
    await expect(
      page.getByText(/We have your transfer in the review queue/i),
    ).toBeVisible();
    // The seeded attachment renders through the authenticated endpoint.
    await expect(
      page.getByRole("button", { name: /open attachment 1/i }).first(),
    ).toBeVisible();

    // The staff-only note exists on this ticket (the admin test below proves
    // it), but neither its tab nor its body may appear for a student.
    await expect(
      page.getByRole("tab", { name: /internal notes/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/internal notes/i)).toHaveCount(0);
    await expect(page.getByText(INTERNAL_NOTE_SNIPPET)).toHaveCount(0);
    await expect(page.getByText(/visible only to administrators/i)).toHaveCount(0);
  });

  test("the admin inbox is out of reach for a student", async ({ page }) => {
    await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.goto("/admin/support", { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/\/admin\/support/);
  });

  test("a browser-selected PNG uploads and renders as an attachment", async ({
    page,
  }) => {
    await openPaymentTicketAsStudent(page);

    // The reply below adds a message, so earlier runs leave extra thumbnails.
    const thumbnails = page.getByRole("button", { name: /open attachment \d+/i });
    await expect(thumbnails.first()).toBeVisible();
    const before = await thumbnails.count();

    await page.locator('input[type="file"]').setInputFiles({
      name: "screenshot.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    // Client-side preview and a removable chip, sized for touch.
    await expect(page.getByAltText("Preview of screenshot.png")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove screenshot.png" }),
    ).toBeVisible();
    await expect(page.getByText(/2 of 3 slots left/i)).toBeVisible();

    await page
      .getByLabel("Message")
      .fill("Attaching the bank screenshot you asked for.");
    await page.getByRole("button", { name: "Send reply" }).click();

    await expect(page.getByText(/Reply sent\./i)).toBeVisible({ timeout: 20_000 });
    // The server re-encoded the image and the second thumbnail came back from
    // the authenticated blob endpoint, so the whole pipeline worked.
    await expect(thumbnails).toHaveCount(before + 1, { timeout: 20_000 });
    await expect(page.getByText(/Attaching the bank screenshot/i).first()).toBeVisible();
  });
});

test.describe("staff support inbox", () => {
  test("the admin thread shows the internal note and tabs are keyboard operable", async ({
    page,
  }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");
    await page.goto("/admin/support", { waitUntil: "networkidle" });

    await page
      .getByRole("link", { name: new RegExp(PAYMENT_TICKET_SUBJECT, "i") })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/support\/[^/]+$/, { timeout: 45_000 });

    // The positive control for the student test: the note is here.
    const notesTab = page.getByRole("tab", { name: /internal notes/i });
    await expect(notesTab).toBeVisible();

    // Arrow keys move between tabs, as the ARIA tab pattern requires.
    const conversationTab = page.getByRole("tab", { name: /conversation/i });
    await conversationTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(notesTab).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(conversationTab).toHaveAttribute("aria-selected", "true");

    await notesTab.click();
    await expect(page.getByText(INTERNAL_NOTE_SNIPPET)).toBeVisible();
  });
});
