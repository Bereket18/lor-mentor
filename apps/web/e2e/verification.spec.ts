import { test, expect } from "@playwright/test";

test("verification page can request a replacement email", async ({ page }) => {
  let submittedEmail = "";
  await page.route("**/api/v1/auth/resend-verification", async (route) => {
    submittedEmail = (route.request().postDataJSON() as { email: string }).email;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message:
          "If that email is registered and unverified, a new verification link has been sent.",
      }),
    });
  });

  await page.goto("/verify-email?email=student%40example.com");
  await page.getByRole("button", { name: "Resend email" }).click();

  await expect(page.getByRole("status")).toContainText(
    "a new verification link has been sent",
  );
  expect(submittedEmail).toBe("student@example.com");
});
