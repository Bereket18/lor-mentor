import { expect, test } from "@playwright/test";

/**
 * Google sign-in entry points (Phase 3).
 *
 * Two layers:
 *
 *  1. The always-on checks run against the default local stack, where the API
 *     reports the method as disabled. They prove the button is never rendered
 *     without the server flag, and that the callback page stays inert (and
 *     sessionless) when handed fabricated values.
 *
 *  2. The gated checks need an API started with `AUTH_GOOGLE_ENABLED=true` and
 *     any registered client id/secret (`GOOGLE_CLIENT_ID`,
 *     `GOOGLE_CLIENT_SECRET`). They never talk to Google: the navigation to
 *     accounts.google.com is intercepted, so the assertions cover the request we
 *     build (PKCE, nonce, state, redirect URI) and the binding cookie.
 *
 * Run the second layer with:
 *   $env:E2E_RUN_GOOGLE = "1"
 *   npx playwright test e2e/google-auth.spec.ts --workers=1
 *
 * The account outcome (newcomer profile grant, linked sign-in, safe-fail on an
 * existing email, admin refusal, replay and wrong-browser refusal) is proven at
 * the HTTP/DB layer in apps/api/test/google-auth.e2e-spec.ts: the official
 * verifier pins Google's token and JWKS endpoints, so a local HTTP mock cannot
 * replace it from outside the client boundary.
 */
const GOOGLE_ENABLED = process.env.E2E_RUN_GOOGLE === "1";

test.describe("Google sign-in entry points (method disabled)", () => {
  test.skip(
    GOOGLE_ENABLED,
    "The API reports Google as enabled; the enabled suite covers this instead.",
  );

  test("the login page does not render a Google button", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: /sign in to your account/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /continue with google/i }),
    ).toHaveCount(0);

    // And the API itself refuses the start route rather than advertising it.
    const start = await page.request.get("/api/v1/auth/google/start", {
      maxRedirects: 0,
    });
    expect(start.status()).toBe(503);
  });

  test("the callback page is inert and never signs anyone in", async ({
    page,
  }) => {
    await page.goto(
      "/auth/google/callback?code=fabricated-code&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      { waitUntil: "networkidle" },
    );

    await expect(
      page.getByRole("heading", { name: /didn't complete/i }),
    ).toBeVisible({ timeout: 15_000 });

    // The authorization response is scrubbed from the address bar, and no
    // session cookie was issued by the rejected exchange.
    expect(new URL(page.url()).search).toBe("");
    const me = await page.request.get("/api/v1/me");
    expect(me.status()).toBe(401);
  });
});

test.describe("Google sign-in entry points (method enabled)", () => {
  test.skip(
    !GOOGLE_ENABLED,
    "Set E2E_RUN_GOOGLE=1 with the API started with AUTH_GOOGLE_ENABLED=true.",
  );

  test("the button starts a PKCE authorization request in this browser", async ({
    page,
    context,
  }) => {
    await page.goto("/login?redirect=%2Fcourses", { waitUntil: "networkidle" });

    const button = page.getByRole("link", {
      name: /continue with google/i,
    });
    await expect(button).toBeVisible();

    let authorizationUrl = "";
    await page.route("https://accounts.google.com/**", async (route) => {
      authorizationUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>intercepted</body></html>",
      });
    });

    await button.click();
    await expect(page).toHaveURL(/accounts\.google\.com/, {
      timeout: 15_000,
    });
    await expect
      .poll(() => authorizationUrl, { timeout: 15_000 })
      .not.toBe("");

    const url = new URL(authorizationUrl);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    expect(url.searchParams.get("state")?.length).toBeGreaterThanOrEqual(40);
    expect(url.searchParams.get("nonce")?.length).toBeGreaterThanOrEqual(40);
    expect(url.searchParams.get("redirect_uri")).toMatch(
      /\/auth\/google\/callback$/,
    );
    expect(url.searchParams.get("access_type")).toBe("online");

    // The transaction is bound to this browser, not to the URL.
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === "auth_go_")).toBe(true);
  });

  test("a fabricated callback is refused and shows the uniform error", async ({
    page,
  }) => {
    await page.goto(
      "/auth/google/callback?code=fabricated-code&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      { waitUntil: "networkidle" },
    );

    await expect(
      page.getByRole("heading", { name: /didn't complete/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).toContainText(/couldn't complete sign-in/i);
    expect(new URL(page.url()).search).toBe("");

    const me = await page.request.get("/api/v1/me");
    expect(me.status()).toBe(401);
  });
});