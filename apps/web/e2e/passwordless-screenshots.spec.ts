import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { newcomerEmail } from "./passwordless-helpers";

/**
 * Screenshots and an accessibility manifest for the passwordless auth pages
 * (acceptance plan, section 12 item 3).
 *
 * Capture:
 *   $env:E2E_PASSWORDLESS_SCREENSHOTS = "1"
 *   npx playwright test e2e/passwordless-screenshots.spec.ts --workers=1
 *
 * Output: C:\Users\<you>\Desktop\lor-screens\passwordless-login\ (override with
 * PASSWORDLESS_SCREENSHOT_DIR). Never written inside the repository.
 *
 * One entry per state, per width (320/390/1280), per theme (light/dark), each
 * with the structural accessibility checks that also guard the app's public
 * routes: every form control is named, every image has alt text, there is a
 * single h1, and nothing overflows horizontally at 320px.
 */
test.skip(
  process.env.E2E_PASSWORDLESS_SCREENSHOTS !== "1",
  "Set E2E_PASSWORDLESS_SCREENSHOTS=1 to capture the auth-page screenshots.",
);

const OUT_DIR =
  process.env.PASSWORDLESS_SCREENSHOT_DIR ??
  path.join(homedir(), "Desktop", "lor-screens", "passwordless-login");

const WIDTHS = [320, 390, 1280] as const;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

interface Check {
  state: string;
  width: number;
  theme: Theme;
  file: string;
  heading: string;
  namedControls: number;
  unnamedButtons: number;
  imagesWithoutAlt: number;
  horizontalOverflow: boolean;
  h1Count: number;
}

const entries: Check[] = [];

test.beforeAll(() => {
  mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(() => {
  const manifest = {
    area: "passwordless-login",
    generatedAt: new Date().toISOString(),
    baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    widths: WIDTHS,
    themes: THEMES,
    entries,
    summary: {
      screenshots: entries.length,
      states: [...new Set(entries.map((entry) => entry.state))],
      failures: entries.filter(
        (entry) =>
          entry.namedControls > 0 ||
          entry.unnamedButtons > 0 ||
          entry.imagesWithoutAlt > 0 ||
          entry.horizontalOverflow ||
          entry.h1Count !== 1,
      ).length,
    },
  };
  writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, "README.md"),
    [
      "# Passwordless sign-in: screenshot and accessibility evidence",
      "",
      `Generated ${manifest.generatedAt} against ${manifest.baseUrl}.`,
      "",
      `- ${manifest.summary.screenshots} screenshots across widths ${WIDTHS.join(", ")} and themes ${["light", "dark"].join("/")}.`,
      `- States: ${manifest.summary.states.join(", ")}.`,
      `- Structural accessibility failures: ${manifest.summary.failures}.`,
      "",
      "See `manifest.json` for the per-screenshot checks (named controls,",
      "named buttons, image alt text, a single h1, and horizontal overflow at",
      "every width).",
      "",
    ].join("\n"),
  );
});

/** Establish the origin, set the next-themes key, then reload so it applies. */
async function seedTheme(page: Page, theme: Theme, width: number) {
  await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.evaluate((value) => window.localStorage.setItem("lm-theme", value), theme);
  // The key is read on load; the theme then persists for every later goto in
  // this context, so the fragment-based confirm page is only ever navigated to
  // once (a reload would drop the fragment before the page can read it).
  await page.reload({ waitUntil: "networkidle" });
}

async function capture(page: Page, state: string, theme: Theme, width: number) {
  const heading =
    (await page.locator("h1").first().textContent().catch(() => null))?.trim() ?? "";
  const checks = await page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll('input:not([type="hidden"]), select, textarea'),
    ) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
    const unnamedControls = controls.filter(
      (control) =>
        !(
          control.labels?.length ||
          control.getAttribute("aria-label") ||
          control.getAttribute("aria-labelledby") ||
          control.getAttribute("title")
        ),
    ).length;
    const unnamedButtons = Array.from(
      document.querySelectorAll("button"),
    ).filter(
      (button) =>
        !button.textContent?.trim() &&
        !button.getAttribute("aria-label") &&
        !button.getAttribute("aria-labelledby") &&
        !button.getAttribute("title"),
    ).length;
    const imagesWithoutAlt = Array.from(document.querySelectorAll("img")).filter(
      (image) => !image.hasAttribute("alt"),
    ).length;
    return {
      unnamedControls,
      unnamedButtons,
      imagesWithoutAlt,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth,
      h1Count: document.querySelectorAll("h1").length,
    };
  });

  const file = `${state}-${width}-${theme}.png`;
  await page.screenshot({
    path: path.join(OUT_DIR, file),
    fullPage: true,
    animations: "disabled",
  });
  entries.push({
    state,
    width,
    theme,
    file,
    heading,
    namedControls: checks.unnamedControls,
    unnamedButtons: checks.unnamedButtons,
    imagesWithoutAlt: checks.imagesWithoutAlt,
    horizontalOverflow: checks.horizontalOverflow,
    h1Count: checks.h1Count,
  });
  console.log(`SCREENSHOT ${file}`);
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`auth pages at ${width}px, ${theme}`, async ({ page }) => {
      test.setTimeout(180_000);

      // 1. Login, password mode.
      await seedTheme(page, theme, width);
      await expect(
        page.getByRole("heading", { name: /sign in to your account/i }),
      ).toBeVisible();
      await capture(page, "login-password", theme, width);

      // 2. Login, email mode.
      await page.getByRole("button", { name: /email link or code/i }).click();
      await expect(page.locator("#login-email-link")).toBeVisible();
      await capture(page, "login-email", theme, width);

      // 3. Login, "check your email" step.
      await page.locator("#login-email-link").fill(newcomerEmail());
      await page.getByRole("button", { name: /email me a sign-in link/i }).click();
      await expect(
        page.getByRole("heading", { name: /check your email/i }),
      ).toBeVisible({ timeout: 15_000 });
      await capture(page, "login-check-email", theme, width);

      // 4. Confirm-link page (fragment is client-only; shaped like a real link).
      await page.goto(
        "/auth/email/confirm#challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        { waitUntil: "networkidle" },
      );
      await expect(
        page.getByRole("heading", { name: /confirm sign-in/i }),
      ).toBeVisible();
      await capture(page, "confirm-link", theme, width);

      // 5. Profile step, cold load with no grant (the expired state).
      await page.goto("/complete-profile", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: /this step has expired/i }),
      ).toBeVisible();
      await capture(page, "complete-profile-expired", theme, width);
    });
  }
}
