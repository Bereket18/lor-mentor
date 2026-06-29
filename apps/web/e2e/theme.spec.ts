import { test, expect } from "@playwright/test";

/**
 * Theme toggle behaviour — regression guard for the next-themes migration.
 * A fresh browser context starts with empty localStorage, so the app should
 * default to dark, switch on click, and persist the choice across a reload.
 */
test("theme toggle switches and persists", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");

  // When dark, the toggle offers to switch to light.
  await page.getByRole("button", { name: /switch to light mode/i }).click();
  await expect(html).toHaveAttribute("data-theme", "light");

  // Choice persists across a full reload (localStorage-backed).
  await page.reload({ waitUntil: "networkidle" });
  await expect(html).toHaveAttribute("data-theme", "light");

  // Switch back so the context ends in a known state.
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
});
