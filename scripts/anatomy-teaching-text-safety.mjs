/**
 * Teaching-text safety for scripts/generate-anatomy-systems.mjs.
 *
 * The generator rewrites every generated seed module from the BodyParts3D
 * tables. Some of those modules now carry curated teaching text that was
 * loaded by scripts/apply-anatomy-teaching-draft.mjs. Regenerating must never
 * silently discard that text, so two rules apply:
 *
 *   1. A system listed in LOADED_TEACHING_TEXT_SYSTEMS keeps its curated
 *      fields. The generator re-emits them, replaces the "text is empty"
 *      header and description, and omits the empty-text validator guard.
 *   2. Any other system that already contains non-empty curated text refuses
 *      to be regenerated, with an error naming the offending structures.
 *
 * The functions here are pure so they can be tested without the BodyParts3D
 * archives, which the generator otherwise requires.
 */

import ts from "typescript";

/**
 * Systems whose teaching text has been loaded from docs/anatomy/drafts.
 * Regenerating them preserves the text and never re-adds the empty-text
 * validator guard.
 */
export const LOADED_TEACHING_TEXT_SYSTEMS = new Set([
  "respiratory",
  "endocrine",
  "lymphatic",
  "sensory-ear",
  "body-surface-upper",
  "body-surface-lower",
  "nervous-central",
  "male-reproductive",
  "digestive-upper",
  "digestive-lower",
  "digestive-liver",
  "nervous-left",
  "nervous-right",
  "sensory-eye-right",
  "sensory-eye-left",
  "digestive-hepatobiliary",
]);

export const TEACHING_TEXT_FIELDS = [
  "summary",
  "location",
  "function",
  "bloodSupply",
  "clinicalNotes",
];

// latinName is curated alongside the teaching text (see
// apply-anatomy-teaching-draft.mjs), so it is detected and preserved too.
export const CURATED_FIELDS = ["latinName", ...TEACHING_TEXT_FIELDS];

function isStringLiteralLike(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function literalText(node) {
  if (isStringLiteralLike(node)) return node.text;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  return undefined;
}

/**
 * Parse one generated seed module into slug -> curated fields. Every known
 * slug is present; curated fields default to null / "".
 */
export function extractCuratedText(
  sourceText,
  fileName = "anatomy-seed.data.ts",
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bySlug = new Map();

  const collectArray = (array) => {
    for (const element of array.elements) {
      if (!ts.isObjectLiteralExpression(element)) continue;
      let slug = null;
      const record = { latinName: null };
      for (const field of TEACHING_TEXT_FIELDS) record[field] = "";
      for (const property of element.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name =
          ts.isIdentifier(property.name) || isStringLiteralLike(property.name)
            ? property.name.text
            : null;
        if (name === "slug") {
          const value = literalText(property.initializer);
          if (typeof value === "string") slug = value;
          continue;
        }
        if (name !== null && CURATED_FIELDS.includes(name)) {
          const value = literalText(property.initializer);
          if (value === null || typeof value === "string") record[name] = value;
        }
      }
      if (slug !== null) bySlug.set(slug, record);
    }
  };

  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (!/_STRUCTURES$/.test(declaration.name.text)) continue;
      if (!ts.isArrayLiteralExpression(declaration.initializer)) continue;
      collectArray(declaration.initializer);
    }
  });

  return bySlug;
}

/** True when a single structure record carries any curated content. */
export function hasCuratedContent(record) {
  if (!record) return false;
  if (
    typeof record.latinName === "string" &&
    record.latinName.trim().length > 0
  ) {
    return true;
  }
  return TEACHING_TEXT_FIELDS.some(
    (field) =>
      typeof record[field] === "string" && record[field].trim().length > 0,
  );
}

/** Slugs in a seed module that carry non-empty curated content. */
export function structuresWithCuratedContent(bySlug) {
  return [...bySlug.entries()]
    .filter(([, record]) => hasCuratedContent(record))
    .map(([slug]) => slug);
}

export function isLoadedTeachingTextSystem(
  slug,
  loadedSystems = LOADED_TEACHING_TEXT_SYSTEMS,
) {
  return loadedSystems.has(slug);
}

/**
 * False for a loaded system, so the generator never re-adds the
 * "must not contain teaching text" guard to it.
 */
export function shouldEmitEmptyTeachingTextGuard(
  slug,
  loadedSystems = LOADED_TEACHING_TEXT_SYSTEMS,
) {
  return !loadedSystems.has(slug);
}

/** The seed-file header lines that describe the teaching text. */
export function teachingTextHeaderLines(
  slug,
  loadedSystems = LOADED_TEACHING_TEXT_SYSTEMS,
) {
  if (loadedSystems.has(slug)) {
    return [
      " * Teaching text is an AI draft loaded from",
      ` * docs/anatomy/drafts/${slug}-teaching-draft.md by`,
      " * scripts/apply-anatomy-teaching-draft.mjs. It is pending faculty review, so",
      " * these rows stay unreviewed (isReviewed false) and the module stays",
      " * unpublished.",
    ];
  }
  return [
    " * Teaching text is intentionally empty. These rows are drafts pending",
    " * faculty review and the module stays unpublished.",
  ];
}

/** The system description string, honest about whether text is loaded. */
export function systemTeachingDescription(
  name,
  slug,
  loadedSystems = LOADED_TEACHING_TEXT_SYSTEMS,
) {
  const notes = loadedSystems.has(slug)
    ? "Teaching notes are an AI draft pending faculty review"
    : "Teaching notes are empty pending faculty review";
  return `${name} anatomy model derived from BodyParts3D 4.0. ${notes}; this module is not published. See the attribution page for credit and licence details.`;
}

/**
 * The validator guard that forbids teaching text. Empty for a loaded system,
 * so the generator never re-adds it there.
 */
export function emptyTeachingTextGuardLines(
  slug,
  loadedSystems = LOADED_TEACHING_TEXT_SYSTEMS,
) {
  if (loadedSystems.has(slug)) return [];
  return [
    "    if ([structure.summary, structure.location, structure.function, structure.bloodSupply, structure.clinicalNotes].some((value) => value.trim().length > 0)) {",
    '      throw new Error(`Structure "${structure.slug}" must not contain teaching text until faculty review.`);',
    "    }",
  ];
}

/**
 * Curated text to carry into a regenerated module. Loaded systems keep their
 * existing map; every other system returns null and is regenerated empty.
 */
export function preservedCuratedText(
  slug,
  existingBySlug,
  loadedSystems = LOADED_TEACHING_TEXT_SYSTEMS,
) {
  if (!loadedSystems.has(slug)) return null;
  return existingBySlug;
}

/**
 * Refuse to regenerate a system that already carries curated text but is not
 * listed as loaded. Does nothing for loaded systems or empty drafts.
 */
export function assertRegenerationSafe({
  slug,
  existingBySlug,
  dataPath = `apps/api/prisma/anatomy-${slug}.data.ts`,
  loadedSystems = LOADED_TEACHING_TEXT_SYSTEMS,
}) {
  if (loadedSystems.has(slug)) return;
  const offending = structuresWithCuratedContent(existingBySlug);
  if (offending.length === 0) return;
  throw new Error(
    [
      `Refusing to overwrite curated teaching text in ${dataPath}.`,
      `System "${slug}" is not in LOADED_TEACHING_TEXT_SYSTEMS, but these structures carry non-empty teaching text: ${offending.join(", ")}.`,
      `Add "${slug}" to LOADED_TEACHING_TEXT_SYSTEMS to preserve the text, or clear the text before regenerating.`,
    ].join(" "),
  );
}
