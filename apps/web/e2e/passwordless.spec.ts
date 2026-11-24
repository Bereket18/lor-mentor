import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  EXISTING_EMAIL,
  PASSWORDLESS_ENABLED,
  newcomerEmail,
  readAuthMail,
} from "./passwordless-helpers";

/**
 * Passwordless sign-in matrix over the real UI (acceptance plan, section 12
 * item 2). Covers start, code entry, the emailed link, cross-device
 * confirmation, the inert link page, wrong-browser refusal and the newcomer
 * profile step.
 *
 * Prerequisite: the local stack is up and the API runs with
 * `AUTH_EMAIL_LINK_ENABLED=true` against a database that has at least one
 * active, non-administrator account. See the helper header for the flags.
 *
 * Expiry, supersession, the administrator refusal and the Redis-outage path are
 * proven at the HTTP/DB layer (they need a clock jump, a second issuance or a
 * stopped dependency, none of which the UI can drive). The gate report records
 * where each is executed.
 */
test.skip(
  !PASSWORDLESS_ENABLED,
  "Set E2E_RUN_PASSWORDLESS=1 (and E2E_PASSWORDLESS_EXISTING_EMAIL) to run the sign-in matrix.",
);

test.describe.configure({ mode: "default" });

const ORIGIN = "http://localhost:3000";

async function switchToEmailMode(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("button", { name: /email link or code/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /email link or code/i }).click();
  await expect(page.locator("#login-email-link")).toBeVisible();
}

/** Start a challenge through the UI and return the handle the API issued. */
async function startChallenge(page: Page, email: string): Promise<string> {
  await switchToEmailMode(page);
  await page.locator("#login-email-link").fill(email);
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes("/api/v1/auth/email/start") &&
        res.request().method() === "POST",
    ),
    page.getByRole("button", { name: /email me a sign-in link/i }).click(),
  ]);
  expect(response.status()).toBe(202);
  const { challengeId } = (await response.json()) as { challengeId: string };
  await expect(
    page.getByRole("heading", { name: /check your email/i }),
  ).toBeVisible({ timeout: 15_000 });
  return challengeId;
}

/** GET /csrf then POST /email/start inside an isolated browser context. */
async function startViaApi(context: BrowserContext, email: string) {
  const csrfRes = await context.request.get("/api/v1/auth/csrf", {
    headers: { Origin: ORIGIN },
  });
  expect(csrfRes.status()).toBe(200);
  const csrf = (await csrfRes.json()).csrfToken as string;
  const startRes = await context.request.post("/api/v1/auth/email/start", {
    headers: { Origin: ORIGIN, "x-auth-csrf": csrf },
    data: { email },
  });
  expect(startRes.status()).toBe(202);
  const { challengeId } = (await startRes.json()) as { challengeId: string };
  return { challengeId };
}

test("email code sign-in reaches the dashboard", async ({ page }) => {
  test.skip(!EXISTING_EMAIL, "Set E2E_PASSWORDLESS_EXISTING_EMAIL.");
  const challengeId = await startChallenge(page, EXISTING_EMAIL);
  const mail = await readAuthMail(EXISTING_EMAIL, challengeId);

  await page.locator("#login-code").fill(mail.code);
  await page.getByRole("button", { name: /^continue$/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
});

test("the emailed link signs in on a second device", async ({ browser, page }) => {
  test.skip(!EXISTING_EMAIL, "Set E2E_PASSWORDLESS_EXISTING_EMAIL.");
  // Start on device A (its own context) and read the link from the mail.
  const contextA = await browser.newContext();
  const { challengeId } = await startViaApi(contextA, EXISTING_EMAIL);
  const mail = await readAuthMail(EXISTING_EMAIL, challengeId);

  // Open the link on device B (page belongs to an isolated context).
  await page.goto(
    `/auth/email/confirm#challenge=${encodeURIComponent(mail.challengeId)}&token=${encodeURIComponent(mail.token)}`,
    { waitUntil: "networkidle" },
  );
  await expect(
    page.getByRole("heading", { name: /confirm sign-in/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /continue here/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  await contextA.close();
});

test("opening the link alone does not sign anyone in", async ({ page }) => {
  // No session, and a fabricated fragment: the page must stay inert and scrub
  // the secret out of the address bar. A cold load must also stay on this page:
  // `/me` answering 401 must not bounce the browser to the login form.
  await page.goto(
    "/auth/email/confirm#challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    { waitUntil: "networkidle" },
  );
  await expect(
    page.getByRole("button", { name: /continue here/i }),
  ).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(new URL(page.url()).pathname).toBe("/auth/email/confirm");
  expect(new URL(page.url()).hash).toBe("");

  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(401);
});

test("the profile page loads cold without a forced redirect", async ({ page }) => {
  // A newcomer follows the emailed code and lands here with a grant cookie but
  // no session. `/me` answers 401; that must not bounce the browser to /login.
  await page.goto("/complete-profile", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading")).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(new URL(page.url()).pathname).toBe("/complete-profile");
});

test("a code from a different browser is refused", async ({ browser }) => {
  const email = newcomerEmail();
  const contextA = await browser.newContext();
  const { challengeId } = await startViaApi(contextA, email);
  const mail = await readAuthMail(email, challengeId);

  // Device B: no challenge-binding cookie, so the same code must fail.
  const contextB = await browser.newContext();
  const csrfRes = await contextB.request.get("/api/v1/auth/csrf", {
    headers: { Origin: ORIGIN },
  });
  const csrf = (await csrfRes.json()).csrfToken as string;
  const rejected = await contextB.request.post("/api/v1/auth/email/code", {
    headers: { Origin: ORIGIN, "x-auth-csrf": csrf },
    data: { challengeId, code: mail.code },
  });
  expect(rejected.status()).toBe(400);

  // Device A still succeeds, proving the code itself was valid.
  const csrfA = await contextA.request.get("/api/v1/auth/csrf", {
    headers: { Origin: ORIGIN },
  });
  const tokenA = (await csrfA.json()).csrfToken as string;
  const accepted = await contextA.request.post("/api/v1/auth/email/code", {
    headers: { Origin: ORIGIN, "x-auth-csrf": tokenA },
    data: { challengeId, code: mail.code },
  });
  expect(accepted.status()).toBe(200);

  await contextA.close();
  await contextB.close();
});

test("a newcomer is sent to the profile step", async ({ page }) => {
  const email = newcomerEmail();
  const challengeId = await startChallenge(page, email);
  const mail = await readAuthMail(email, challengeId);

  await page.locator("#login-code").fill(mail.code);
  await page.getByRole("button", { name: /^continue$/i }).click();

  await expect(page).toHaveURL(/\/complete-profile/, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: /finish your account/i }),
  ).toBeVisible();
  // The verified address is shown read-only; it is the only identity the page sees.
  await expect(page.getByText(email)).toBeVisible();
});
