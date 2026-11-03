import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  prepareLoad,
  resolveSystemInputs,
  run,
} from "./apply-anatomy-teaching-draft.mjs";
import {
  CURATED_FIELDS,
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

const BATCH_ONE_LOADED_SYSTEMS = [
  "endocrine",
  "lymphatic",
  "sensory-ear",
  "body-surface-upper",
  "body-surface-lower",
  "nervous-central",
  "male-reproductive",
];

const EMPTY_GENERATED_SYSTEMS = [
  "digestive-hepatobiliary",
  "digestive-liver",
  "digestive-lower",
  "digestive-upper",
  "nervous-left",
  "nervous-right",
  "sensory-eye-left",
  "sensory-eye-right",
];

describe("loaded-teaching-text set", () => {
  test("includes respiratory and every batch-1 system", () => {
    for (const slug of ["respiratory", ...BATCH_ONE_LOADED_SYSTEMS]) {
      assert.ok(
        LOADED_TEACHING_TEXT_SYSTEMS.has(slug),
        `${slug} should be in LOADED_TEACHING_TEXT_SYSTEMS`,
      );
    }
    assert.equal(LOADED_TEACHING_TEXT_SYSTEMS.size, 8);
  });

  test("recognises loaded and unloaded systems", () => {
    assert.equal(isLoadedTeachingTextSystem("respiratory"), true);
    assert.equal(isLoadedTeachingTextSystem("nervous-central"), true);
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
    assert.match(joined, /Teaching text is an AI draft loaded from/);
    assert.match(
      joined,
      /docs\/anatomy\/drafts\/respiratory-teaching-draft\.md/,
    );
    assert.match(joined, /apply-anatomy-teaching-draft\.mjs/);
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
      /Teaching notes are an AI draft pending faculty review/,
    );
    assert.match(
      systemTeachingDescription("Digestive system", "digestive-upper"),
      /Teaching notes are empty pending faculty review/,
    );
  });
});

describe("real generated seed modules", () => {
  const loadedCounts = new Map([
    ["respiratory", 26],
    ["endocrine", 3],
    ["lymphatic", 3],
    ["sensory-ear", 1],
    ["body-surface-upper", 1],
    ["body-surface-lower", 1],
    ["nervous-central", 12],
    ["male-reproductive", 10],
  ]);

  test("the loaded set is exactly the fully curated systems", () => {
    assert.deepEqual(
      [...LOADED_TEACHING_TEXT_SYSTEMS].sort(),
      ["respiratory", ...BATCH_ONE_LOADED_SYSTEMS].sort(),
    );
  });

  test("loaded header and description match the helper output", () => {
    for (const slug of loadedCounts.keys()) {
      const path = seedPath(slug);
      const content = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

      assert.ok(
        content.includes(teachingTextHeaderLines(slug).join("\n")),
        `${slug} header should match teachingTextHeaderLines`,
      );

      const name = content.match(/\n  name: '([^']+)',\n/)?.[1];
      const description = content.match(
        /\n  description:\n    '([^']*)',\n/,
      )?.[1];
      assert.ok(name, `${slug} should declare a system name`);
      assert.ok(description, `${slug} should declare a description`);

      assert.equal(
        description,
        systemTeachingDescription(name, slug),
        `${slug} description should match systemTeachingDescription`,
      );
    }
  });

  test("every loaded system is fully curated", () => {
    for (const [slug, count] of loadedCounts) {
      const path = seedPath(slug);
      const bySlug = extractCuratedText(readFileSync(path, "utf8"), path);
      assert.equal(bySlug.size, count, `${slug} should have ${count} rows`);
      assert.equal(
        structuresWithCuratedContent(bySlug).length,
        count,
        `${slug} should have ${count} curated rows`,
      );
      for (const [structureSlug, record] of bySlug) {
        for (const field of CURATED_FIELDS) {
          assert.ok(
            typeof record[field] === "string" &&
              record[field].trim().length > 0,
            `${slug}/${structureSlug} should have a non-empty ${field}`,
          );
        }
      }
      assert.doesNotThrow(() =>
        assertRegenerationSafe({
          slug,
          existingBySlug: bySlug,
          dataPath: path,
        }),
      );
    }
  });

  test("every unloaded generated system is still an empty draft", () => {
    for (const slug of EMPTY_GENERATED_SYSTEMS) {
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

/** Build a minimal seed module for loader tests. */
function loaderSeedModule(slugs) {
  const rows = slugs
    .map(
      (slug) => `  {
    slug: '${slug}',
    name: '${slug}',
    latinName: null,
    summary: '',
    location: '',
    function: '',
    bloodSupply: '',
    clinicalNotes: '',
    meshName: '${slug.replace(/-/g, "_")}',
    layer: 'test',
    relatedSlugs: [],
    references: ['FMA:1 (Test).'],
  },`,
    )
    .join("\n");
  return `export const TEST_STRUCTURES = [\n${rows}\n];\n`;
}

/** Build a complete draft for the given slugs. */
function loaderDraft(slugs) {
  return `${slugs
    .map(
      (slug) => `### ${slug}
- latinName: ${slug}
- summary: Summary for ${slug}.
- location: Location for ${slug}.
- function: Function for ${slug}.
- bloodSupply: Blood supply for ${slug}.
- clinicalNotes: Notes for ${slug}.
`,
    )
    .join("\n")}`;
}

describe("apply-anatomy-teaching-draft system inputs", () => {
  test("derives the draft and seed paths from a system slug", () => {
    const inputs = resolveSystemInputs("endocrine", repoRoot);
    assert.equal(inputs.slug, "endocrine");
    assert.equal(
      inputs.draftPath,
      join(repoRoot, "docs/anatomy/drafts/endocrine-teaching-draft.md"),
    );
    assert.equal(
      inputs.dataPath,
      join(repoRoot, "apps/api/prisma/anatomy-endocrine.data.ts"),
    );
  });

  test("refuses a slug that could escape the drafts directory", () => {
    assert.throws(
      () => resolveSystemInputs("../anatomy-heart", repoRoot),
      /Invalid system slug/,
    );
  });

  test("refuses a duplicate --system flag", () => {
    assert.throws(
      () =>
        run(["--system", "endocrine", "--system", "endocrine", "--check"], {
          log() {},
          warn() {},
        }),
      /Duplicate --system "endocrine"/,
    );
  });

  test("supports a list of systems and --check writes nothing", () => {
    const before = readFileSync(seedPath("endocrine"), "utf8");
    const prepared = run(
      [
        "--system",
        "endocrine",
        "--system",
        "lymphatic",
        "--check",
      ],
      { log() {}, warn() {} },
    );
    assert.deepEqual(
      prepared.map((item) => item.slug),
      ["endocrine", "lymphatic"],
    );
    assert.deepEqual(
      prepared.map((item) => item.draftCount),
      [3, 3],
    );
    assert.equal(readFileSync(seedPath("endocrine"), "utf8"), before);
  });

  test("refuses a draft that omits a seed slug", () => {
    const directory = mkdtempSync(join(tmpdir(), "lor-anatomy-loader-"));
    try {
      const draftPath = join(directory, "draft.md");
      const dataPath = join(directory, "data.ts");
      writeFileSync(draftPath, loaderDraft(["one"]), "utf8");
      writeFileSync(dataPath, loaderSeedModule(["one", "two"]), "utf8");

      assert.throws(
        () => prepareLoad({ draftPath, dataPath }),
        /missing draft block\(s\) for seed slug\(s\): two/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("refuses an unknown draft slug", () => {
    const directory = mkdtempSync(join(tmpdir(), "lor-anatomy-loader-"));
    try {
      const draftPath = join(directory, "draft.md");
      const dataPath = join(directory, "data.ts");
      writeFileSync(draftPath, loaderDraft(["ghost"]), "utf8");
      writeFileSync(dataPath, loaderSeedModule(["one"]), "utf8");

      assert.throws(
        () => prepareLoad({ draftPath, dataPath }),
        /Unknown slug "ghost"/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("allows a partial draft only explicitly, and is idempotent", () => {
    const directory = mkdtempSync(join(tmpdir(), "lor-anatomy-loader-"));
    try {
      const draftPath = join(directory, "draft.md");
      const dataPath = join(directory, "data.ts");
      writeFileSync(draftPath, loaderDraft(["one"]), "utf8");
      writeFileSync(dataPath, loaderSeedModule(["one", "two"]), "utf8");

      const first = prepareLoad({
        draftPath,
        dataPath,
        allowPartial: true,
        warn() {},
      });
      assert.deepEqual(first.untouched, ["two"]);
      writeFileSync(dataPath, first.output, "utf8");

      const second = prepareLoad({
        draftPath,
        dataPath,
        allowPartial: true,
        warn() {},
      });
      assert.equal(second.output, first.output);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
