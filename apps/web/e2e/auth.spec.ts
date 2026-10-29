import { test, expect, type Page } from "@playwright/test";

/**
 * Opt-in auth smoke. Requires the API running with a seeded super admin.
 * Enable with:  E2E_RUN_AUTH=1 npm run e2e
 * Override creds with E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.skip(
  !process.env.E2E_RUN_AUTH || !EMAIL || !PASSWORD,
  "Set E2E_RUN_AUTH=1, E2E_ADMIN_EMAIL, and E2E_ADMIN_PASSWORD to enable the auth smoke test.",
);

async function signInAsSuperAdmin(page: Page) {
  await page.goto("/admin-login", { waitUntil: "networkidle" });

  await page.locator('input[type="email"]').fill(EMAIL!);
  await page.locator('input[type="password"]').fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in to admin/i }).click();

  // /\/admin/ alone also matches /admin-login on the previous page, so it
  // could pass without a real sign-in redirect. Require a path boundary.
  await expect(page).toHaveURL(/\/admin(?:\/|\?|$)/, { timeout: 15_000 });
}

test("super admin can sign in and reach the admin area", async ({ page }) => {
  await signInAsSuperAdmin(page);
});

test("super admin is redirected away from the student/teacher anatomy lab", async ({
  page,
}) => {
  await signInAsSuperAdmin(page);

  // The API returns 403 for admin roles on every /anatomy endpoint, so the
  // client route gate sends them to their own home instead of a broken page.
  await page.goto("/anatomy", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin(?:\/|\?|$)/, { timeout: 15_000 });
});
