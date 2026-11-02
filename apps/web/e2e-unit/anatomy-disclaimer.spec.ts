import { expect, test } from "@playwright/test";
import {
  ANATOMY_AI_DISCLAIMER,
  shouldShowAnatomyAiDisclaimer,
} from "../src/lib/anatomy-disclaimer";

/**
 * College-approved label for AI-drafted anatomy text.
 *
 * Visibility is driven by `isReviewed`: unreviewed text shows the label, a
 * valid sign-off hides it, and editing a signed-off structure invalidates the
 * sign-off so the label returns. The copy is asserted verbatim so a
 * well-meaning edit cannot silently weaken the disclaimer.
 */

const EXPECTED_COPY =
  "AI-drafted from general anatomical knowledge, not copied from any textbook. Not yet reviewed by faculty.";

test.describe("anatomy AI disclaimer", () => {
  test("uses the exact approved wording", () => {
    expect(ANATOMY_AI_DISCLAIMER).toBe(EXPECTED_COPY);
  });

  test("is visible while the structure is unreviewed", () => {
    expect(shouldShowAnatomyAiDisclaimer(false)).toBe(true);
  });

  test("disappears once faculty sign off", () => {
    expect(shouldShowAnatomyAiDisclaimer(true)).toBe(false);
  });

  test("returns after a sign-off is invalidated by an edit", () => {
    // Unreviewed text, then valid sign-off, then an edit clears it again.
    expect(shouldShowAnatomyAiDisclaimer(false)).toBe(true);
    expect(shouldShowAnatomyAiDisclaimer(true)).toBe(false);
    expect(shouldShowAnatomyAiDisclaimer(false)).toBe(true);
  });
});
