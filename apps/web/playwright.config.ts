import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke tests for the Lor Mentor web app.
 *
 * Prereqs to run locally:
 *   - The web app on http://localhost:3000  (npm run dev:web)
 *   - The API on http://localhost:4000      (npm run dev:api)  — needed for the
 *     opt-in auth test and for the RSC pricing page to list real plans.
 *
 * Run:  npm run e2e        (headless)
 *       npm run e2e:ui     (interactive)
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Reuse the dev server if it's already up; otherwise start the web app.
  // (The API must be started separately — see the header comment.)
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
