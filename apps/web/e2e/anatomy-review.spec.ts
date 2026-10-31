import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page, type APIResponse } from "@playwright/test";

/**
 * Opt-in Step 4 faculty-review verification.
 *
 * Prerequisite: run the disposable fixture setup from apps/api, then start the
 * API and web app. The fixture file contains temporary accounts and their
 * random passwords; this spec reads it but never prints it.
 *
 *   npx ts-node prisma/_step4-fixtures.ts setup
 *   E2E_RUN_ANATOMY_REVIEW=1 npm run e2e --workspace=apps/web -- e2e/anatomy-review.spec.ts --workers=1
 *   npx ts-node prisma/_step4-fixtures.ts cleanup
 */

type FixtureUser = {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN";
  isAnatomyReviewer: boolean;
};

type FixtureFile = {
  runId: string;
  systemId: string;
  systemSlug: string;
  systemName: string;
  reviewedStructureId: string;
  reviewedStructureSlug: string;
  draftStructureId: string;
  draftStructureSlug: string;
  users: Record<string, FixtureUser>;
};

const FIXTURE_FILE =
  process.env.STEP4_FIXTURE_FILE ??
  join(process.env.TEMP ?? tmpdir(), "opencode", "anatomy-step4-fixture.json");

let fixture: FixtureFile | null = null;
try {
  fixture = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as FixtureFile;
} catch {
  // The skip below is the user-facing explanation; keep module loading safe
  // when the suite is run as part of the normal non-opt-in e2e command.
}

const ENABLED =
  process.env.E2E_RUN_ANATOMY_REVIEW === "1" && fixture !== null;

test.skip(
  !ENABLED,
  `Set E2E_RUN_ANATOMY_REVIEW=1 and create ${FIXTURE_FILE} with the Step 4 fixture script to enable this suite.`,
);

test.describe.configure({ mode: "serial" });

const data = fixture as FixtureFile;

async function signIn(page: Page, user: FixtureUser): Promise<void> {
  const response = await page.request.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
  });
  if (response.status() !== 200) {
    throw new Error(
      `Temporary ${user.role} login failed with HTTP ${response.status()}.`,
    );
  }
}

async function expectStatus(
  response: APIResponse,
  expected: number,
  label: string,
): Promise<void> {
  expect(
    response.status(),
    `${label} returned ${response.status()}: ${await response.text()}`,
  ).toBe(expected);
}

test("reviewer edits, sees the revision, reviews, and forges no stale writes", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const reviewer = data.users.reviewer;
  await signIn(page, reviewer);

  // The link is reviewer-only and must be visible on the Anatomy Lab index.
  await page.goto("/anatomy", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("anatomy-review-link")).toBeVisible();
  await page.getByTestId("anatomy-review-link").click();
  await expect(page.getByTestId("anatomy-review-page")).toBeVisible();
  await expect(
    page.getByTestId("anatomy-review-page").getByText(reviewer.fullName, {
      exact: true,
    }),
  ).toBeVisible();

  // The review library includes unpublished systems. The fixture is published
  // so the student badge test can use it later.
  await page.getByTestId(`review-system-${data.systemSlug}`).click();
  await expect(
    page.getByTestId(`review-structure-${data.draftStructureSlug}`),
  ).toBeVisible();
  await page
    .getByTestId(`review-structure-${data.draftStructureSlug}`)
    .click();

  await page.getByTestId("review-summary").fill(
    "Draft fixture summary edited by Playwright.",
  );
  await page
    .getByTestId("review-location")
    .fill("Fixture location filled for review.");
  await page
    .getByTestId("review-function")
    .fill("Fixture function filled for review.");
  await page
    .getByTestId("review-bloodSupply")
    .fill("Fixture blood supply filled for review.");
  await page
    .getByTestId("review-clinicalNotes")
    .fill("Fixture clinical notes filled for review.");
  await page.getByTestId("review-note").fill("Playwright revision note");
  await expect(page.getByTestId("review-unsaved")).toBeVisible();

  await page.getByTestId("review-save").click();
  await expect(page.getByTestId("review-message")).toContainText(
    "Changes saved.",
  );

  // A save creates exactly one revision, and the history is fetched from the
  // protected revisions endpoint.
  const historyButton = page.getByRole("button", {
    name: /Revision history/,
  });
  await expect(historyButton).toContainText("Revision history (1)");
  await historyButton.click();
  await expect(page.getByText(/Playwright revision note/)).toBeVisible();
  await expect(
    page.getByText(/Changed: Summary, Location, Function/),
  ).toBeVisible();

  // The reviewer edited this row in this session, so the UI asks for explicit
  // confirmation before approval.
  await page.getByTestId("review-mark").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("You edited this structure in this session");
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByTestId("review-message")).toContainText(
    "Marked as reviewed.",
  );
  await expect(
    page.getByTestId(`review-status-${data.draftStructureSlug}`),
  ).toContainText("Reviewed");

  // Whole-system review is idempotent once every structure is approved.
  const wholeSystem = await page.request.post(
    `/api/v1/anatomy/review/systems/${data.systemSlug}/review`,
    { data: { note: "Playwright system review check" } },
  );
  await expectStatus(wholeSystem, 200, "whole-system review");
  const wholeBody = (await wholeSystem.json()) as {
    structureCount: number;
    updatedCount: number;
  };
  expect(wholeBody.structureCount).toBe(2);
  expect(wholeBody.updatedCount).toBe(0);

  // Plain-text validation runs before any write.
  const htmlAttempt = await page.request.patch(
    `/api/v1/anatomy/review/structures/${data.draftStructureId}`,
    {
      data: {
        updatedAt: new Date().toISOString(),
        summary: "<b>not allowed</b>",
      },
    },
  );
  await expectStatus(htmlAttempt, 400, "HTML validation");

  // Editing an approved row resets approval. Reusing the pre-edit updatedAt
  // then produces a live 409, proving optimistic concurrency at HTTP level.
  const beforeReset = await page.request.get(
    `/api/v1/anatomy/review/systems/${data.systemSlug}/structures`,
  );
  await expectStatus(beforeReset, 200, "review system read");
  const systemState = (await beforeReset.json()) as {
    structures: Array<{ id: string; updatedAt: string; isReviewed: boolean }>;
  };
  const draftState = systemState.structures.find(
    (structure) => structure.id === data.draftStructureId,
  );
  expect(draftState?.isReviewed).toBe(true);

  const resetEdit = await page.request.patch(
    `/api/v1/anatomy/review/structures/${data.draftStructureId}`,
    {
      data: {
        updatedAt: draftState!.updatedAt,
        summary: "Draft summary after reset-on-edit check.",
      },
    },
  );
  await expectStatus(resetEdit, 200, "edit reviewed row");
  const resetBody = (await resetEdit.json()) as {
    isReviewed: boolean;
    reviewedAt: string | null;
    reviewedById: string | null;
    status: string;
    updatedAt: string;
  };
  expect(resetBody.isReviewed).toBe(false);
  expect(resetBody.reviewedAt).toBeNull();
  expect(resetBody.reviewedById).toBeNull();
  expect(resetBody.status).toBe("pending");

  const staleEdit = await page.request.patch(
    `/api/v1/anatomy/review/structures/${data.draftStructureId}`,
    {
      data: {
        updatedAt: draftState!.updatedAt,
        summary: "This write must lose the race.",
      },
    },
  );
  await expectStatus(staleEdit, 409, "stale edit");

  const reReview = await page.request.post(
    `/api/v1/anatomy/review/structures/${data.draftStructureId}/review`,
    { data: { updatedAt: resetBody.updatedAt, note: "Re-review after reset" } },
  );
  await expectStatus(reReview, 200, "re-review structure");
  expect(((await reReview.json()) as { isReviewed: boolean }).isReviewed).toBe(
    true,
  );

  // Revoke and re-approve once more through the live endpoints.
  const revoke = await page.request.post(
    `/api/v1/anatomy/review/structures/${data.draftStructureId}/revoke`,
    { data: { note: "Playwright revoke check" } },
  );
  await expectStatus(revoke, 200, "revoke structure");
  const revoked = (await revoke.json()) as {
    isReviewed: boolean;
    status: string;
    updatedAt: string;
  };
  expect(revoked.isReviewed).toBe(false);
  expect(revoked.status).toBe("pending");

  const reviewAgain = await page.request.post(
    `/api/v1/anatomy/review/structures/${data.draftStructureId}/review`,
    { data: { updatedAt: revoked.updatedAt, note: "Playwright final approval" } },
  );
  await expectStatus(reviewAgain, 200, "review structure again");
  expect(((await reviewAgain.json()) as { isReviewed: boolean }).isReviewed).toBe(
    true,
  );

  // Revisions remain durable across review, revoke, and re-review actions.
  const revisions = await page.request.get(
    `/api/v1/anatomy/review/structures/${data.draftStructureId}/revisions`,
  );
  await expectStatus(revisions, 200, "revision history");
  const revisionBody = (await revisions.json()) as Array<{
    note: string | null;
  }>;
  expect(revisionBody.some((revision) => revision.note === "Playwright revision note")).toBe(
    true,
  );
});

test("a student sees the reviewed badge and no reviewer controls", async ({
  page,
}) => {
  await signIn(page, data.users.student);

  await page.goto(`/anatomy/${data.systemSlug}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("anatomy-structure-title")).toBeVisible();
  await page.locator(`[data-tree-key="structure:${data.reviewedStructureSlug}"]`).click();
  await expect(page.getByTestId("anatomy-structure-title")).toContainText(
    "Reviewed fixture structure",
  );

  const badge = page.getByTestId("anatomy-review-badge");
  await expect(badge).toHaveAttribute("data-state", "reviewed");
  await expect(badge).toContainText(
    `Faculty reviewed by ${data.users.reviewer.fullName}`,
  );

  // No reviewer entry point is rendered for students.
  await page.goto("/anatomy", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("anatomy-review-link")).toHaveCount(0);

  // The API rejects the review library before any UI client-side check.
  await expectStatus(
    await page.request.get("/api/v1/anatomy/review/systems"),
    403,
    "student review library",
  );
  await expectStatus(
    await page.request.patch(
      `/api/v1/anatomy/review/structures/${data.draftStructureId}`,
      { data: { updatedAt: new Date().toISOString(), summary: "blocked" } },
    ),
    403,
    "student structure edit",
  );
});

test("a non-reviewer teacher gets 403 and a restricted page, but can read the badge", async ({
  page,
}) => {
  await signIn(page, data.users.teacher);

  await expectStatus(
    await page.request.get("/api/v1/anatomy/review/systems"),
    403,
    "non-reviewer review library",
  );
  await expectStatus(
    await page.request.patch(
      `/api/v1/anatomy/review/structures/${data.draftStructureId}`,
      { data: { updatedAt: new Date().toISOString(), summary: "blocked" } },
    ),
    403,
    "non-reviewer structure edit",
  );

  await page.goto("/anatomy", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("anatomy-review-link")).toHaveCount(0);

  // Teachers can still see the reviewed badge on published content.
  await page.goto(`/anatomy/${data.systemSlug}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator(`[data-tree-key="structure:${data.reviewedStructureSlug}"]`).click();
  await expect(page.getByTestId("anatomy-review-badge")).toHaveAttribute(
    "data-state",
    "reviewed",
  );

  // The direct route exists for teachers but explains the restriction.
  await page.goto("/anatomy/review", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("alert").filter({ hasText: "Faculty review is restricted" }),
  ).toBeVisible();
});

for (const roleKey of ["admin", "superAdmin"] as const) {
  test(`${roleKey} is denied every review endpoint`, async ({ page }) => {
    const user = data.users[roleKey];
    await signIn(page, user);

    await expectStatus(
      await page.request.get("/api/v1/anatomy/review/systems"),
      403,
      `${user.role} review library`,
    );
    await expectStatus(
      await page.request.patch(
        `/api/v1/anatomy/review/structures/${data.draftStructureId}`,
        { data: { updatedAt: new Date().toISOString(), summary: "blocked" } },
      ),
      403,
      `${user.role} structure edit`,
    );
  });
}
