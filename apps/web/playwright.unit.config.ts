import { defineConfig } from "@playwright/test";

/**
 * Unit-test runner for pure TypeScript modules (no browser, no dev server).
 *
 * The default config (`playwright.config.ts`) drives real UI smoke tests and
 * starts `npm run dev` for them; configuration logic must be testable without
 * any server running, so it gets its own project directory and config.
 *
 * Run:  npm run test:unit   (in apps/web)
 */
export default defineConfig({
  testDir: "./e2e-unit",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
});
