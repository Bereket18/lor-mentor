import { test, expect } from "@playwright/test";

test("verification page can request a new code", async ({ page }) => {
  let submittedEmail = "";
  await page.route("**/api/v1/auth/resend-verification", async (route) => {
    submittedEmail = (route.request().postDataJSON() as { email: string }).email;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message:
          "If that email is registered and unverified, a new verification code has been sent.",
      }),
    });
  });

  await page.goto("/verify-email?email=student%40example.com");
  await page.getByRole("button", { name: "Send a new code" }).click();

  await expect(page.getByRole("status")).toContainText(
    "a new verification code has been sent",
  );
  expect(submittedEmail).toBe("student@example.com");
});

test("submitting a six-digit code verifies the account", async ({ page }) => {
  let submitted: { email: string; code: string } | undefined;
  await page.route("**/api/v1/auth/verify-email", async (route) => {
    submitted = route.request().postDataJSON() as {
      email: string;
      code: string;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Email verified successfully. You can now log in.",
      }),
    });
  });

  await page.goto("/verify-email?email=student%40example.com");
  await page.getByLabel("Verification code").fill("428193");
  await page.getByRole("button", { name: "Verify email" }).click();

  await expect(page.getByText("Email verified!")).toBeVisible();
  // The account is named in the request: a six-digit code is looked up within
  // one account, not by its own value.
  expect(submitted).toEqual({ email: "student@example.com", code: "428193" });
});

test("a code with leading zeroes is sent unchanged", async ({ page }) => {
  let submitted: { email: string; code: string } | undefined;
  await page.route("**/api/v1/auth/verify-email", async (route) => {
    submitted = route.request().postDataJSON() as {
      email: string;
      code: string;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Email verified successfully." }),
    });
  });

  await page.goto("/verify-email?email=student%40example.com");
  await page.getByLabel("Verification code").fill("000042");
  await page.getByRole("button", { name: "Verify email" }).click();

  await expect(page.getByText("Email verified!")).toBeVisible();
  // Anything that treated the code as a number would have sent 42.
  expect(submitted?.code).toBe("000042");
});

test("non-digit characters never reach the code field", async ({ page }) => {
  await page.goto("/verify-email?email=student%40example.com");

  const input = page.getByLabel("Verification code");
  await input.fill("4a2b8c-193");

  await expect(input).toHaveValue("428193");
});

test("an incomplete code is refused before any request is made", async ({
  page,
}) => {
  let called = false;
  await page.route("**/api/v1/auth/verify-email", async (route) => {
    called = true;
    await route.fulfill({ status: 200, body: "{}" });
  });

  await page.goto("/verify-email?email=student%40example.com");
  await page.getByLabel("Verification code").fill("4281");
  await page.getByRole("button", { name: "Verify email" }).click();

  // Scoped to the form: Next's route announcer is also role="alert".
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "6-digit code",
  );
  expect(called).toBe(false);
});

test("a rejected code is reported and counted", async ({ page }) => {
  await page.route("**/api/v1/auth/verify-email", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message:
          "That verification code is incorrect or has expired. Request a new code.",
      }),
    });
  });

  await page.goto("/verify-email?email=student%40example.com");
  await page.getByLabel("Verification code").fill("111111");
  await page.getByRole("button", { name: "Verify email" }).click();

  await expect(page.locator("form").getByRole("alert")).toContainText(
    "incorrect or has expired",
  );
});

test("the used-up state blocks further attempts and points at a new code", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/verify-email", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message:
          "That verification code is incorrect or has expired. Request a new code.",
      }),
    });
  });

  await page.goto("/verify-email?email=student%40example.com");
  const submit = page.getByRole("button", { name: "Verify email" });
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.getByLabel("Verification code").fill("111111");
    await submit.click();
    await expect(page.locator("form").getByRole("alert").first()).toBeVisible();
  }

  // Five recorded misses burn the code server-side, so even the right digits
  // would now fail — the page has to say so and stop pretending otherwise.
  await expect(page.getByText("This code can no longer be used")).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send a new code" }),
  ).toBeEnabled();
});

test("the page never uses internal token wording", async ({ page }) => {
  await page.goto("/verify-email?email=student%40example.com");

  await expect(page.locator("body")).not.toContainText(/token/i);
  await expect(page.getByText(/verification code/i).first()).toBeVisible();
});
