import { expect, test, type Locator, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
  paymentTicketHref,
  setTheme,
  signIn,
  type Theme,
} from "./support-helpers";

/**
 * Screenshot capture for the support centre review.
 *
 *   $env:E2E_SCREENSHOTS=1
 *   $env:DATABASE_URL="postgresql://…/lor_support_qa"   # the DB the API runs on
 *   npx playwright test e2e/support-screenshots.spec.ts --workers=1
 *
 * Refuses to run when NODE_ENV is production or when DATABASE_URL does not
 * name a disposable database (the same rule the fixture seeder uses). It does
 * not read any .env file; the URL is only checked by name, never connected to.
 *
 * Output: C:\Users\<you>\Desktop\lor-screens\support-v2\ (override with
 * SUPPORT_SCREENSHOT_DIR).
 */
test.skip(
  process.env.E2E_SCREENSHOTS !== "1",
  "Set E2E_SCREENSHOTS=1 (and DATABASE_URL to the disposable fixture database) to capture screenshots.",
);

const OUT_DIR =
  process.env.SUPPORT_SCREENSHOT_DIR ??
  path.join(homedir(), "Desktop", "lor-screens", "support-v2");

const WIDTHS = [390, 1280] as const;
const THEMES: Theme[] = ["light", "dark"];

/**
 * Mirror of apps/api/src/common/utils/disposable-database.ts (kept inline so
 * the web package does not import API source). Judges the database NAME only.
 */
function assertDisposableDatabaseUrl(url: string | undefined) {
  if (!url) throw new Error("DATABASE_URL is not set; refusing to capture.");
  let name = "";
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    /* falls through to the refusal below */
  }
  if (!name || !(/(e2e|test|disposable|qa)/i.test(name) || name === "lor_mentor_ci")) {
    throw new Error(
      `Refusing to capture against "${name || "(unparseable)"}": the database name must contain e2e, test, disposable or qa.`,
    );
  }
}

test.beforeAll(() => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to capture fixtures with NODE_ENV=production.");
  }
  assertDisposableDatabaseUrl(process.env.DATABASE_URL);
  mkdirSync(OUT_DIR, { recursive: true });
});

test.beforeEach(() => {
  test.setTimeout(180_000);
});

/** A gradient PNG big enough to look like a real screenshot thumbnail. */
function gradientPng(width: number, height: number, tint: [number, number, number]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const stripe = Math.floor(y / 20) % 2 === 0 ? 1 : 0.8;
      row[1 + x * 3] = Math.round(tint[0] * stripe * (x / width));
      row[2 + x * 3] = Math.round(tint[1] * stripe);
      row[3 + x * 3] = Math.round(tint[2] * stripe * (1 - y / height * 0.4));
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Let thumbnails (authenticated blob fetches) finish painting.
  await expect(
    page.locator("img").evaluateAll((imgs) =>
      imgs.every((img) => (img as HTMLImageElement).complete),
    ),
  ).resolves.toBe(true);
}

async function shot(
  page: Page,
  name: string,
  width: number,
  theme: Theme,
  bringIntoView?: Locator,
) {
  if (bringIntoView) {
    await bringIntoView.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await page.waitForTimeout(200);
  }
  await settle(page);
  const file = path.join(OUT_DIR, `${name}-${width}-${theme}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  console.log(`SCREENSHOT ${file}`);
}

/**
 * One sign-in per role, then every width and theme. The API allows five
 * sign-ins a minute, so a test per screenshot would trip the throttle.
 */
test("student screens: help centre, new ticket, thread", async ({ page }) => {
  await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);

  const threadHref = await paymentTicketHref(page, "/support/tickets");

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await setTheme(page, theme);

      await page.goto("/support", { waitUntil: "networkidle" });
      await expect(page.locator("main h1, main h2").first()).toBeVisible();
      await shot(page, "help-center", width, theme);

      await page.goto("/support/new", { waitUntil: "networkidle" });
      await page.locator("#ticket-subject").fill("My transfer is still marked pending");
      await page
        .locator("#ticket-body")
        .fill(
          "I paid by bank transfer on Monday and the payment still says pending. The bank screenshots are attached.",
        );
      await page.locator('input[type="file"]').setInputFiles([
        {
          name: "bank-receipt.png",
          mimeType: "image/png",
          buffer: gradientPng(320, 200, [90, 160, 220]),
        },
        {
          name: "transfer-confirmation.png",
          mimeType: "image/png",
          buffer: gradientPng(320, 200, [220, 150, 80]),
        },
      ]);
      await expect(
        page.getByRole("button", { name: "Remove bank-receipt.png" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Remove transfer-confirmation.png" }),
      ).toBeVisible();
      await shot(
        page,
        "new-ticket",
        width,
        theme,
        page.getByRole("button", { name: "Remove bank-receipt.png" }),
      );

      await page.setViewportSize({
        width,
        height: width === 390 ? 1000 : 900,
      });
      await page.goto(threadHref, { waitUntil: "networkidle" });
      await expect(
        page.getByText(/We have your transfer in the review queue/i),
      ).toBeVisible({ timeout: 45_000 });
      await expect(page.getByLabel("Related payment")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /open attachment 1/i }).first(),
      ).toBeVisible();
      // Unscrolled: the payment card and the staff reply fit together.
      await shot(page, "ticket-thread", width, theme);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    }
  }
});

test("admin screens: queue and the thread with internal notes open", async ({
  page,
}) => {
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");

  const threadHref = await paymentTicketHref(page, "/admin/support");

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await setTheme(page, theme);

      await page.goto("/admin/support", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("link", { name: /transfer is still marked pending/i }).first(),
      ).toBeVisible();
      await shot(page, "admin-queue", width, theme);

      await page.goto(threadHref, { waitUntil: "networkidle" });
      await page.getByRole("tab", { name: /internal notes/i }).click();
      await expect(page.getByText(/Checked the CBE statement/i)).toBeVisible();
      await shot(page, "admin-thread-notes", width, theme);
    }
  }
});
