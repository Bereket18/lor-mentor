import { expect, test } from "@playwright/test";
import { homeFor, isAllowed } from "../src/lib/route-access";

/**
 * Administrator lab access is denied in two places: the API returns 403 from
 * the TEACHER-only anatomy controllers, and the web route guard bounces an
 * admin away from any /anatomy path to the admin home. This covers the web
 * half of that contract.
 */

test.describe("admin anatomy access", () => {
  test("an administrator may not open the anatomy lab or its review surface", () => {
    expect(isAllowed("/anatomy", "ADMIN")).toBe(false);
    expect(isAllowed("/anatomy/review", "ADMIN")).toBe(false);
    expect(isAllowed("/anatomy/review", "SUPER_ADMIN")).toBe(false);
  });

  test("an administrator is redirected to the admin home, not the lab", () => {
    expect(homeFor("ADMIN")).toBe("/admin");
    expect(homeFor("SUPER_ADMIN")).toBe("/admin");
  });

  test("teachers and students keep their lab access", () => {
    expect(isAllowed("/anatomy", "TEACHER")).toBe(true);
    expect(isAllowed("/anatomy/review", "TEACHER")).toBe(true);
    expect(isAllowed("/anatomy", "STUDENT")).toBe(true);
  });
});
