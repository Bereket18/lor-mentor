import { test, expect } from "@playwright/test";

/**
 * Opt-in auth smoke. Requires the API running with a seeded super admin.
 * Enable with:  E2E_RUN_AUTH=1 npm run e2e
 * Override creds with E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "superadmin@lorcan.edu.et";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe!2026";

test.skip(
  !process.env.E2E_RUN_AUTH,
  "Set E2E_RUN_AUTH=1 (and run the API) to enable the auth smoke test.",
);

test("super admin can sign in and reach the admin area", async ({ page }) => {
  await page.goto("/admin-login", { waitUntil: "networkidle" });

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in to admin/i }).click();

  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
});
