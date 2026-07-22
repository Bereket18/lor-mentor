import { expect, test } from "@playwright/test";

const PUBLIC_ROUTES = [
  "/login",
  "/admin-login",
  "/register",
  "/forgot-password",
  "/reset-password?token=test-token",
  "/verify-email",
  "/pricing",
];

for (const route of PUBLIC_ROUTES) {
  test(`${route} has named controls and no mobile overflow`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route, { waitUntil: "networkidle" });

    const unnamedFormControls = await page
      .locator('input:not([type="hidden"]), select, textarea')
      .evaluateAll((elements) =>
        elements
          .filter((element) => {
            const control = element as HTMLInputElement;
            return !(
              control.labels?.length ||
              control.getAttribute("aria-label") ||
              control.getAttribute("aria-labelledby") ||
              control.getAttribute("title")
            );
          })
          .map((element) => element.outerHTML.slice(0, 160)),
      );

    const unnamedButtons = await page.locator("button").evaluateAll((buttons) =>
      buttons
        .filter(
          (button) =>
            !button.textContent?.trim() &&
            !button.getAttribute("aria-label") &&
            !button.getAttribute("aria-labelledby") &&
            !button.getAttribute("title"),
        )
        .map((button) => button.outerHTML.slice(0, 160)),
    );

    const imagesWithoutAlt = await page.locator("img").evaluateAll((images) =>
      images
        .filter((image) => !image.hasAttribute("alt"))
        .map((image) => image.outerHTML.slice(0, 160)),
    );

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );

    expect(unnamedFormControls, `Unnamed form controls on ${route}`).toEqual([]);
    expect(unnamedButtons, `Unnamed buttons on ${route}`).toEqual([]);
    expect(imagesWithoutAlt, `Images without alt text on ${route}`).toEqual([]);
    expect(hasHorizontalOverflow, `Horizontal overflow on ${route}`).toBe(false);
  });
}

test("keyboard navigation exposes a visible focus indicator", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");

  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const style = window.getComputedStyle(element);
    return {
      tag: element.tagName,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });

  expect(focused).not.toBeNull();
  expect(focused?.outlineStyle).not.toBe("none");
  expect(focused?.outlineWidth).not.toBe("0px");
});
