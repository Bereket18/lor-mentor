/**
 * College-approved wording for AI-drafted anatomy text that has not been
 * signed off by faculty. Kept in a plain module so the copy and the visibility
 * rule can be unit-tested without a browser.
 */
export const ANATOMY_AI_DISCLAIMER =
  "AI-drafted from general anatomical knowledge, not copied from any textbook. Not yet reviewed by faculty.";

/**
 * The label is visible exactly while a structure lacks a valid faculty sign-off.
 * Editing a signed-off structure clears `isReviewed`, so the label reappears.
 */
export function shouldShowAnatomyAiDisclaimer(isReviewed: boolean): boolean {
  return !isReviewed;
}
