import { test, expect, type Page } from "@playwright/test";

/**
 * Public pages must load cleanly — no console errors and no uncaught page
 * errors. This is a direct regression guard for the theme bugs we fixed:
 * both the "script tag while rendering" warning and the ThemeToggle hydration
 * mismatch surfaced as console errors on load.
 */

// Noise that isn't a frontend bug. This suite guards against React/hydration/
// uncaught-JS errors; backend availability (network resource failures) is an
// environment concern covered by the API tests, and the pages handle it
// gracefully, so we don't fail the frontend smoke test on it.
const IGNORE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon\.ico/i,
  /Failed to load resource/i,
  /net::ERR_/i,
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!IGNORE.some((re) => re.test(text))) errors.push(`console: ${text}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

const PUBLIC_ROUTES = ["/login", "/register", "/pricing", "/admin-login"];

for (const route of PUBLIC_ROUTES) {
  test(`${route} loads with no console or page errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();
    // Give effects (hydration, mounted swaps) a beat to surface any error.
    await page.waitForTimeout(300);
    expect(
      errors,
      `Unexpected console/page errors on ${route}:\n${errors.join("\n")}`,
    ).toEqual([]);
  });
}

test("protected route redirects an unauthenticated visitor to /login", async ({
  page,
}) => {
  // The Next 16 proxy guard should bounce this before any app shell renders.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
