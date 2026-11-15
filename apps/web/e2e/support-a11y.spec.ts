import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
  SUPPORT_ENABLED,
  paymentTicketHref,
  setTheme,
  signIn,
  type Theme,
} from "./support-helpers";

/**
 * Layout and contrast checks for the support centre, against the seeded
 * fixture database (see support.spec.ts for prerequisites).
 *
 * Same approach as accessibility.spec.ts: plain Playwright and computed
 * styles, no extra dependency. Contrast uses the WCAG 2.x formula on the
 * colours the browser actually resolved, compositing any translucent
 * backgrounds over their ancestors.
 */
test.skip(
  !SUPPORT_ENABLED,
  "Set E2E_RUN_SUPPORT=1 and seed the support fixtures to enable these tests.",
);

const THEMES: Theme[] = ["light", "dark"];
const AA_TEXT = 4.5;

test.beforeEach(() => {
  test.setTimeout(120_000);
});

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders: string[] = [];
    document.querySelectorAll("body *").forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.right > window.innerWidth + 1) {
        offenders.push(
          `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}`,
        );
      }
    });
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      offenders: offenders.slice(0, 5),
    };
  });
  expect(
    metrics.scrollWidth,
    `${label}: page is ${metrics.scrollWidth}px wide in a ${metrics.innerWidth}px viewport; first overflowing elements: ${metrics.offenders.join(", ")}`,
  ).toBeLessThanOrEqual(metrics.innerWidth);
}

for (const theme of THEMES) {
  test.describe(`320px layout, ${theme} theme`, () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("student support routes do not scroll sideways", async ({ page }) => {
      await setTheme(page, theme);
      await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);

      const threadHref = await paymentTicketHref(page, "/support/tickets");
      const routes: Array<[string, string]> = [
        ["help center", "/support"],
        ["tickets", "/support/tickets"],
        ["new ticket", "/support/new"],
        ["thread", threadHref],
      ];
      for (const [label, route] of routes) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("main h1, main h2").first()).toBeVisible({
          timeout: 45_000,
        });
        await expectNoHorizontalOverflow(page, `${label} (${route})`);
      }
    });

    test("admin support routes do not scroll sideways", async ({ page }) => {
      await setTheme(page, theme);
      await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");

      const threadHref = await paymentTicketHref(page, "/admin/support");
      await page.goto("/admin/support", { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page, "admin queue (/admin/support)");

      await page.goto(threadHref, { waitUntil: "networkidle" });
      await expect(page.getByRole("tab").first()).toBeVisible({ timeout: 45_000 });
      await page.getByRole("tab", { name: /internal notes/i }).click();
      await expectNoHorizontalOverflow(page, `admin thread (${threadHref})`);
    });
  });
}

/** Browser-side WCAG contrast; returns one record per checked element. */
async function measureContrast(
  page: Page,
  selector: string,
): Promise<Array<{ text: string; ratio: number; fg: string; bg: string }>> {
  return page.locator(selector).evaluateAll((elements) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    // The canvas normalises every CSS colour syntax (rgb, oklab, color-mix).
    const toRgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (
      top: [number, number, number, number],
      bottom: [number, number, number, number],
    ): [number, number, number, number] => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: number) =>
        (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const background = (el: Element): [number, number, number, number] => {
      const layers: Array<[number, number, number, number]> = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        layers.push(toRgba(getComputedStyle(node).backgroundColor));
      }
      let result: [number, number, number, number] = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i], result);
      return result;
    };
    const lum = ([r, g, b]: number[]) => {
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };

    return elements.map((el) => {
      const style = getComputedStyle(el);
      const bg = background(el);
      const fg = over(toRgba(style.color), bg);
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return {
        text: (el.textContent ?? "").trim().slice(0, 40) ||
          (el as HTMLInputElement).placeholder ||
          el.getAttribute("aria-label") ||
          el.tagName,
        ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
        fg: `rgb(${fg.slice(0, 3).map(Math.round).join(",")})`,
        bg: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})`,
      };
    });
  });
}

function expectAa(
  results: Awaited<ReturnType<typeof measureContrast>>,
  label: string,
) {
  expect(results.length, `${label}: found nothing to measure`).toBeGreaterThan(0);
  const failing = results.filter((r) => r.ratio < AA_TEXT);
  expect(
    failing,
    `${label}: below ${AA_TEXT}:1 -> ${JSON.stringify(failing)}`,
  ).toEqual([]);
}

for (const theme of THEMES) {
  test.describe(`contrast, ${theme} theme`, () => {
    test("status chips on the student list and the admin queue", async ({
      page,
    }) => {
      await setTheme(page, theme);
      await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);
      await page.goto("/support/tickets", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("link", { name: /transfer is still marked pending/i }),
      ).toBeVisible({ timeout: 45_000 });
      expectAa(
        await measureContrast(page, "main span.rounded-full.font-semibold"),
        `student status chips (${theme})`,
      );

      await page.context().clearCookies();
      await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");
      await page.goto("/admin/support", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("link", { name: /transfer is still marked pending/i }).first(),
      ).toBeVisible({ timeout: 45_000 });
      expectAa(
        await measureContrast(page, "main span.rounded-full.font-semibold"),
        `admin status chips (${theme})`,
      );
    });

    test("form fields, labels and the themed Select on the new-ticket form", async ({
      page,
    }) => {
      await setTheme(page, theme);
      await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);
      await page.goto("/support/new", { waitUntil: "networkidle" });
      await expect(page.locator("#ticket-subject")).toBeVisible({ timeout: 45_000 });

      // Filled values and placeholders are measured as typed text.
      await page.locator("#ticket-subject").fill("Contrast check subject");
      await page.locator("#ticket-body").fill("Contrast check body text here.");
      await page.locator("#ticket-reference").fill("T-000123");

      expectAa(
        await measureContrast(
          page,
          "#ticket-subject, #ticket-body, #ticket-reference",
        ),
        `form field text (${theme})`,
      );
      expectAa(
        await measureContrast(page, "main label, main form span.text-xs"),
        `form labels (${theme})`,
      );

      // The Select trigger, then an option inside the opened popup.
      const trigger = page.getByRole("combobox").first();
      expectAa(
        await measureContrast(page, '[role="combobox"]'),
        `Select trigger (${theme})`,
      );
      await trigger.click();
      await expect(page.getByRole("option").first()).toBeVisible();
      expectAa(
        await measureContrast(page, '[role="option"]'),
        `Select options (${theme})`,
      );
      await page.keyboard.press("Escape");
    });
  });
}
