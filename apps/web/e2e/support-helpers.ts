import { expect, type Page } from "@playwright/test";

/**
 * Shared by the support UI specs and the screenshot script. All of it needs
 * the seeded fixture database (`npm run seed:support-fixtures` in apps/api).
 */
export const SUPPORT_ENABLED = process.env.E2E_RUN_SUPPORT === "1";

export const STUDENT_EMAIL =
  process.env.E2E_SUPPORT_STUDENT_EMAIL ?? "student.support@lorcan.edu.et";
export const STUDENT_PASSWORD =
  process.env.E2E_SUPPORT_STUDENT_PASSWORD ?? "SupportStudent!2026";
export const ADMIN_EMAIL =
  process.env.E2E_SUPPORT_ADMIN_EMAIL ?? "admin.support@lorcan.edu.et";
export const ADMIN_PASSWORD =
  process.env.E2E_SUPPORT_ADMIN_PASSWORD ?? "SupportAdmin!2026";

/** The seeded ticket whose thread carries an attachment and an internal note. */
export const PAYMENT_TICKET_SUBJECT = "My transfer is still marked pending";

export type Theme = "light" | "dark";

/** next-themes reads this key before first paint (see lib/theme-provider.tsx). */
export async function setTheme(page: Page, theme: Theme) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("lm-theme", value);
  }, theme);
}

type Cookies = Awaited<ReturnType<ReturnType<Page["context"]>["cookies"]>>;
const sessionCache = new Map<string, Cookies>();

/**
 * Signs in through the real login form once per account, then reuses the
 * session cookies. The API limits logins to 5 a minute, which a spec that
 * signs in for every test would trip.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
  kind: "student" | "admin" = "student",
) {
  const cached = sessionCache.get(email);
  if (cached) {
    await page.context().addCookies(cached);
    return;
  }
  await formSignIn(page, email, password, kind);
  sessionCache.set(email, await page.context().cookies());
}

async function formSignIn(
  page: Page,
  email: string,
  password: string,
  kind: "student" | "admin",
) {
  await page.goto(kind === "admin" ? "/admin-login" : "/login", {
    waitUntil: "networkidle",
  });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page
    .getByRole("button", {
      name: kind === "admin" ? /sign in to admin/i : /sign in to lor mentor/i,
    })
    .click();
  // Both pages stay on their own URL until the API accepts the credentials.
  await expect(page).not.toHaveURL(
    kind === "admin" ? /\/admin-login/ : /\/login/,
    { timeout: 20_000 },
  );
}

/** Href of the seeded payment ticket, read from the list the user can see. */
export async function paymentTicketHref(
  page: Page,
  listPath: "/support/tickets" | "/admin/support",
): Promise<string> {
  await page.goto(listPath, { waitUntil: "networkidle" });
  const link = page
    .getByRole("link", { name: new RegExp(PAYMENT_TICKET_SUBJECT, "i") })
    .first();
  await expect(link).toBeVisible({ timeout: 45_000 });
  const href = await link.getAttribute("href");
  if (!href) throw new Error("The payment ticket link has no href.");
  return href;
}
