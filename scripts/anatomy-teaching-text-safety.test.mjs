import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LOADED_TEACHING_TEXT_SYSTEMS,
  assertRegenerationSafe,
  emptyTeachingTextGuardLines,
  extractCuratedText,
  hasCuratedContent,
  isLoadedTeachingTextSystem,
  preservedCuratedText,
  shouldEmitEmptyTeachingTextGuard,
  structuresWithCuratedContent,
  systemTeachingDescription,
  teachingTextHeaderLines,
} from "./anatomy-teaching-text-safety.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = (slug) =>
  join(repoRoot, "apps/api/prisma", `anatomy-${slug}.data.ts`);

/** Build a minimal seed module with one curated structure. */
function seedModule(fields = {}) {
  const {
    slug = "trachea",
    latinName = null,
    summary = "",
    location = "",
    fn = "",
    bloodSupply = "",
    clinicalNotes = "",
  } = fields;
  const quote = (value) => (value === null ? "null" : `'${value}'`);
  return `export const TEST_STRUCTURES = [
  {
    slug: '${slug}',
    latinName: ${quote(latinName)},
    summary: ${quote(summary)},
    location: ${quote(location)},
    function: ${quote(fn)},
    bloodSupply: ${quote(bloodSupply)},
    clinicalNotes: ${quote(clinicalNotes)},
  },
];
`;
}

const EMPTY_RECORD = {
  latinName: null,
  summary: "",
  location: "",
  function: "",
  bloodSupply: "",
  clinicalNotes: "",
};

describe("loaded-teaching-text set", () => {
  test("includes respiratory", () => {
    assert.ok(LOADED_TEACHING_TEXT_SYSTEMS.has("respiratory"));
  });

  test("recognises respiratory as loaded and other systems as not", () => {
    assert.equal(isLoadedTeachingTextSystem("respiratory"), true);
    assert.equal(isLoadedTeachingTextSystem("digestive-upper"), false);
  });
});

describe("empty-text validator guard", () => {
  test("is never emitted for a loaded system", () => {
    assert.deepEqual(emptyTeachingTextGuardLines("respiratory"), []);
    assert.equal(shouldEmitEmptyTeachingTextGuard("respiratory"), false);
  });

  test("is still emitted for a non-loaded system", () => {
    const lines = emptyTeachingTextGuardLines("digestive-upper");
    assert.equal(lines.length, 3);
    assert.match(lines.join("\n"), /must not contain teaching text/);
    assert.equal(shouldEmitEmptyTeachingTextGuard("digestive-upper"), true);
  });

  test("loads a different loaded-systems set when one is supplied", () => {
    const loaded = new Set(["digestive-upper"]);
    assert.deepEqual(
      emptyTeachingTextGuardLines("digestive-upper", loaded),
      [],
    );
    assert.equal(emptyTeachingTextGuardLines("respiratory", loaded).length, 3);
  });
});

describe("extractCuratedText", () => {
  test("reads every curated field for a slug", () => {
    const bySlug = extractCuratedText(
      seedModule({
        slug: "trachea",
        latinName: "Trachea",
        summary: "A tube.",
        location: "Neck",
        fn: "Air conduction",
        bloodSupply: "Inferior thyroid artery",
        clinicalNotes: "Sternal angle.",
      }),
    );
    assert.deepEqual(bySlug.get("trachea"), {
      latinName: "Trachea",
      summary: "A tube.",
      location: "Neck",
      function: "Air conduction",
      bloodSupply: "Inferior thyroid artery",
      clinicalNotes: "Sternal angle.",
    });
  });

  test("defaults fields to null/empty for an empty draft", () => {
    const bySlug = extractCuratedText(seedModule({ slug: "trachea" }));
    assert.deepEqual(bySlug.get("trachea"), EMPTY_RECORD);
  });

  test("parses several structures in one array", () => {
    const text = `export const TEST_STRUCTURES = [
  { slug: 'a', latinName: null, summary: '', location: '', function: '', bloodSupply: '', clinicalNotes: '' },
  { slug: 'b', latinName: null, summary: 'Loaded', location: '', function: '', bloodSupply: '', clinicalNotes: '' },
];
`;
    const bySlug = extractCuratedText(text);
    assert.deepEqual([...bySlug.keys()], ["a", "b"]);
  });
});

describe("curated-content detection", () => {
  test("an empty record has none", () => {
    assert.equal(hasCuratedContent(EMPTY_RECORD), false);
  });

  test("a latinName alone counts", () => {
    assert.equal(
      hasCuratedContent({ ...EMPTY_RECORD, latinName: "Trachea" }),
      true,
    );
  });

  test("any single teaching field counts", () => {
    for (const field of [
      "summary",
      "location",
      "function",
      "bloodSupply",
      "clinicalNotes",
    ]) {
      assert.equal(hasCuratedContent({ ...EMPTY_RECORD, [field]: "x" }), true);
    }
  });

  test("whitespace-only values do not count", () => {
    assert.equal(hasCuratedContent({ ...EMPTY_RECORD, summary: "   " }), false);
  });

  test("lists only structures that carry content", () => {
    const bySlug = new Map([
      ["empty", EMPTY_RECORD],
      ["loaded-a", { ...EMPTY_RECORD, summary: "x" }],
      ["loaded-b", { ...EMPTY_RECORD, latinName: "B" }],
    ]);
    assert.deepEqual(structuresWithCuratedContent(bySlug), [
      "loaded-a",
      "loaded-b",
    ]);
  });
});

describe("preservedCuratedText", () => {
  test("keeps the existing map for a loaded system", () => {
    const bySlug = extractCuratedText(
      seedModule({ slug: "trachea", summary: "Loaded" }),
    );
    assert.equal(preservedCuratedText("respiratory", bySlug), bySlug);
  });

  test("returns null for an unlisted system", () => {
    const bySlug = extractCuratedText(
      seedModule({ slug: "trachea", summary: "Loaded" }),
    );
    assert.equal(preservedCuratedText("digestive-upper", bySlug), null);
  });
});

describe("assertRegenerationSafe", () => {
  test("refuses a non-loaded system that already carries teaching text", () => {
    const existingBySlug = extractCuratedText(
      seedModule({ slug: "trachea", summary: "Loaded" }),
    );
    assert.throws(
      () =>
        assertRegenerationSafe({
          slug: "digestive-upper",
          existingBySlug,
          dataPath: "anatomy-digestive-upper.data.ts",
        }),
      (error) => {
        assert.match(
          error.message,
          /Refusing to overwrite curated teaching text/,
        );
        assert.match(error.message, /anatomy-digestive-upper\.data\.ts/);
        assert.match(error.message, /"digestive-upper"/);
        assert.match(error.message, /trachea/);
        assert.match(error.message, /LOADED_TEACHING_TEXT_SYSTEMS/);
        return true;
      },
    );
  });

  test("allows a loaded system that carries teaching text", () => {
    const existingBySlug = extractCuratedText(
      seedModule({ slug: "trachea", summary: "Loaded" }),
    );
    assert.doesNotThrow(() =>
      assertRegenerationSafe({ slug: "respiratory", existingBySlug }),
    );
  });

  test("allows a non-loaded system whose draft is empty", () => {
    const existingBySlug = extractCuratedText(seedModule({ slug: "trachea" }));
    assert.doesNotThrow(() =>
      assertRegenerationSafe({ slug: "digestive-upper", existingBySlug }),
    );
  });
});

describe("seed header and description", () => {
  test("loaded header does not claim the text is empty", () => {
    const joined = teachingTextHeaderLines("respiratory").join("\n");
    assert.doesNotMatch(joined, /intentionally empty/);
    assert.match(joined, /preserved across regeneration/);
  });

  test("unloaded header still says the text is empty", () => {
    assert.match(
      teachingTextHeaderLines("digestive-upper").join("\n"),
      /intentionally empty/,
    );
  });

  test("description reflects whether text is loaded", () => {
    assert.match(
      systemTeachingDescription("Respiratory system", "respiratory"),
      /Teaching notes include an AI draft pending faculty review/,
    );
    assert.match(
      systemTeachingDescription("Digestive system", "digestive-upper"),
      /Teaching notes are empty pending faculty review/,
    );
  });
});

describe("real generated seed modules", () => {
  test("respiratory is detected as fully loaded", () => {
    const path = seedPath("respiratory");
    const bySlug = extractCuratedText(readFileSync(path, "utf8"), path);
    assert.equal(bySlug.size, 26);
    assert.equal(structuresWithCuratedContent(bySlug).length, 26);
    assert.doesNotThrow(() =>
      assertRegenerationSafe({
        slug: "respiratory",
        existingBySlug: bySlug,
        dataPath: path,
      }),
    );
  });

  test("every other generated system is still an empty draft", () => {
    const slugs = [
      "body-surface-lower",
      "body-surface-upper",
      "digestive-hepatobiliary",
      "digestive-liver",
      "digestive-lower",
      "digestive-upper",
      "endocrine",
      "lymphatic",
      "male-reproductive",
      "nervous-central",
      "nervous-left",
      "nervous-right",
      "sensory-ear",
      "sensory-eye-left",
      "sensory-eye-right",
    ];
    for (const slug of slugs) {
      const path = seedPath(slug);
      const bySlug = extractCuratedText(readFileSync(path, "utf8"), path);
      assert.deepEqual(
        structuresWithCuratedContent(bySlug),
        [],
        `${slug} should have no curated teaching text`,
      );
    }
  });
});
