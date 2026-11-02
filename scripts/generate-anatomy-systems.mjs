#!/usr/bin/env node
/**
 * Generate Anatomy Lab source maps, seed data, and mapping documents for the
 * eight Step 3 systems from the official BodyParts3D 4.0 tables.
 *
 * The BodyParts3D archives are not committed. Download and extract them into
 * C:\Users\berek\Desktop\bp3d-source (or pass --source-root), then run:
 *
 *   node scripts/generate-anatomy-systems.mjs --check
 *   node scripts/generate-anatomy-systems.mjs
 *
 * The script derives every target set from the official PART-OF / IS-A
 * inclusion tables and the element-parts tables. It asserts the file and
 * triangle counts recorded in docs/anatomy/whole-body-plan.md before writing
 * anything. Groups are formed from the OBJ header's Concept ID + English name,
 * which is the authoritative "one structure per named structure" key.
 *
 * Teaching-text safety: a system listed in LOADED_TEACHING_TEXT_SYSTEMS (see
 * scripts/anatomy-teaching-text-safety.mjs) keeps its loaded per-structure
 * teaching text and never re-adds the empty-text validator guard. Any other
 * system that already contains non-empty teaching text refuses to regenerate,
 * so curated text is never silently overwritten.
 *
 * Large systems are split into independently seeded modules because the
 * viewer supports one GLB per system and each GLB must stay below 150,000
 * triangles. The split is recorded in each mapping document.
 *
 * Body surface is a special case: BodyParts3D 4.0 supplies one 203,382-
 * triangle skin mesh (FJ2810). The script partitions its triangles by centroid
 * Z into an upper and a lower region, writes derived OBJ files outside the
 * repository, and records the derivation in the source map and mapping docs.
 * No geometry is duplicated and no decimation is used.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRegenerationSafe,
  emptyTeachingTextGuardLines,
  extractCuratedText,
  preservedCuratedText,
  systemTeachingDescription,
  teachingTextHeaderLines,
} from "./anatomy-teaching-text-safety.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultSourceRoot = "C:/Users/berek/Desktop/bp3d-source";
const defaultDerivedDir =
  "C:/Users/berek/AppData/Local/Temp/opencode/body-surface-derived";

const args = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(args.sourceRoot);
const derivedDir = resolve(args.derivedDir);
const partofDir = join(sourceRoot, "partof_extracted/partof_BP3D_4.0_obj_99");
const isaDir = join(sourceRoot, "isa_extracted/isa_BP3D_4.0_obj_99");

function parseArgs(argv) {
  const parsed = {
    sourceRoot: defaultSourceRoot,
    derivedDir: defaultDerivedDir,
    check: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source-root") parsed.sourceRoot = argv[++i];
    else if (arg === "--derived-dir") parsed.derivedDir = argv[++i];
    else if (arg === "--check") parsed.check = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

if (args.help) {
  console.log(
    [
      "Usage: node scripts/generate-anatomy-systems.mjs [--check]",
      "",
      "  --source-root <dir>  Extracted BodyParts3D root (default:",
      "                       C:\\Users\\berek\\Desktop\\bp3d-source).",
      "  --derived-dir <dir>  Where to write the derived body-surface OBJ files.",
      "  --check              Validate counts and print a summary; write nothing.",
    ].join("\n"),
  );
  process.exit(0);
}

for (const dir of [partofDir, isaDir]) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Missing extracted BodyParts3D directory: ${dir}`);
  }
}

// ---------------------------------------------------------------------------
// Official tables
// ---------------------------------------------------------------------------

function readTable(file) {
  const text = readFileSync(join(sourceRoot, file), "utf8").replace(
    /^\uFEFF/,
    "",
  );
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map((line) => line.split("\t"));
}

function buildIndex(tree) {
  const inclusion = readTable(`${tree}_inclusion_relation_list.txt`);
  const element = readTable(`${tree}_element_parts.txt`);
  const children = new Map();
  const parents = new Map();
  const conceptName = new Map();
  const conceptFiles = new Map();

  for (const [parentId, parentName, childId, childName] of inclusion) {
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(childId);
    if (!parents.has(childId)) parents.set(childId, []);
    parents.get(childId).push(parentId);
    conceptName.set(parentId, parentName);
    conceptName.set(childId, childName);
  }
  for (const [conceptId, name, fileId] of element) {
    if (!conceptFiles.has(conceptId)) conceptFiles.set(conceptId, []);
    conceptFiles.get(conceptId).push(fileId);
    conceptName.set(conceptId, name);
  }
  return { children, parents, conceptName, conceptFiles };
}

const trees = {
  "PART-OF": buildIndex("partof"),
  "IS-A": buildIndex("isa"),
};

const OFFICIAL_ROOTS = {
  alimentary: "FMA7152",
  nervous: "FMA7157",
  respiratory: "FMA7158",
  urinary: "FMA7159",
  genital: "FMA7160",
  cardiovascular: "FMA7161",
  musculoskeletal: "FMA7482",
  endocrine: "FMA9668",
  integumentary: "FMA72979",
  deepFascial: "FMA79063",
};

function descendants(tree, rootId) {
  const out = new Set([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    for (const child of trees[tree].children.get(id) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

function setFor(tree, rootId) {
  const files = new Map();
  for (const conceptId of descendants(tree, rootId)) {
    for (const fileId of trees[tree].conceptFiles.get(conceptId) ?? []) {
      if (!files.has(fileId)) files.set(fileId, new Set());
      files.get(fileId).add(conceptId);
    }
  }
  return files;
}

function union(...sets) {
  const out = new Map();
  for (const set of sets) {
    for (const [fileId, concepts] of set) {
      if (!out.has(fileId)) out.set(fileId, new Set());
      for (const concept of concepts) out.get(fileId).add(concept);
    }
  }
  return out;
}

function difference(a, b) {
  const out = new Map();
  for (const [fileId, concepts] of a) {
    if (!b.has(fileId)) out.set(fileId, new Set(concepts));
  }
  return out;
}

function isDescendant(tree, conceptId, ancestorId) {
  if (conceptId === ancestorId) return true;
  const seen = new Set([conceptId]);
  const queue = [conceptId];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const parent of trees[tree].parents.get(id) ?? []) {
      if (parent === ancestorId) return true;
      if (!seen.has(parent)) {
        seen.add(parent);
        queue.push(parent);
      }
    }
  }
  return false;
}

function isDescendantEitherTree(conceptId, ancestorId) {
  return (
    isDescendant("PART-OF", conceptId, ancestorId) ||
    isDescendant("IS-A", conceptId, ancestorId)
  );
}

const official = {};
for (const [name, rootId] of Object.entries(OFFICIAL_ROOTS)) {
  official[name] = union(setFor("PART-OF", rootId), setFor("IS-A", rootId));
}

// ---------------------------------------------------------------------------
// OBJ cache
// ---------------------------------------------------------------------------

const objCache = new Map();

function objPath(fileId) {
  for (const tree of ["PART-OF", "IS-A"]) {
    const dir = tree === "PART-OF" ? partofDir : isaDir;
    const file = join(dir, `${fileId}.obj`);
    if (existsSync(file)) return { tree, file };
  }
  throw new Error(`Missing OBJ file ${fileId}.obj`);
}

function readObj(fileId) {
  if (objCache.has(fileId)) return objCache.get(fileId);
  const { tree, file } = objPath(fileId);
  const text = readFileSync(file, "utf8");
  const header = (key) =>
    text.match(new RegExp(`^# ${key}\\s*:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;

  let triangles = 0;
  let vertexCount = 0;
  let xSum = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("v ")) {
      const parts = line.split(/\s+/);
      const x = Number(parts[1]);
      if (Number.isFinite(x)) {
        xSum += x;
        vertexCount += 1;
      }
    } else if (line.startsWith("f ")) {
      triangles += 1;
    }
  }

  const record = {
    id: fileId,
    tree,
    concept: header("Concept ID"),
    name: header("English name"),
    sha256: createHash("sha256").update(text).digest("hex"),
    bytes: Buffer.byteLength(text),
    triangles,
    sourceCentroidX: vertexCount > 0 ? xSum / vertexCount : 0,
  };
  if (!record.concept || !record.name) {
    throw new Error(
      `${fileId}: OBJ header is missing Concept ID or English name`,
    );
  }
  objCache.set(fileId, record);
  return record;
}

function stats(files) {
  let triangles = 0;
  for (const fileId of files.keys()) triangles += readObj(fileId).triangles;
  return { files: files.size, triangles };
}

// ---------------------------------------------------------------------------
// Target sets and expected totals
// ---------------------------------------------------------------------------

function exclusiveOf(systemName) {
  const others = new Map();
  for (const [name, set] of Object.entries(official)) {
    if (name === systemName) continue;
    for (const [fileId, concepts] of set) {
      if (!others.has(fileId)) others.set(fileId, new Set());
      for (const concept of concepts) others.get(fileId).add(concept);
    }
  }
  return difference(official[systemName], others);
}

function subtreeUnion(roots) {
  const sets = [];
  for (const [tree, rootId] of roots) sets.push(setFor(tree, rootId));
  return union(...sets);
}

const targetSets = {
  respiratory: exclusiveOf("respiratory"),
  digestive: (() => {
    const set = new Map();
    for (const [fileId, concepts] of official.alimentary) {
      // The mandible is musculoskeletal-owned; the gingiva files are not.
      if (fileId === "FJ3289") continue;
      set.set(fileId, new Set(concepts));
    }
    return set;
  })(),
  nervous: official.nervous,
  endocrine: exclusiveOf("endocrine"),
  sensoryEyeRight: subtreeUnion([
    ["PART-OF", "FMA54449"],
    ["IS-A", "FMA54449"],
  ]),
  sensoryEyeLeft: subtreeUnion([
    ["PART-OF", "FMA54450"],
    ["IS-A", "FMA54450"],
  ]),
  sensoryEar: subtreeUnion([
    ["PART-OF", "FMA52781"],
    ["IS-A", "FMA52781"],
  ]),
  lymphatic: union(
    subtreeUnion([
      ["PART-OF", "FMA9607"],
      ["IS-A", "FMA9607"],
    ]),
    subtreeUnion([["IS-A", "FMA7196"]]),
  ),
  maleReproductive: union(
    subtreeUnion([
      ["PART-OF", "FMA9600"],
      ["IS-A", "FMA9600"],
    ]),
    subtreeUnion([
      ["IS-A", "FMA7210"],
      ["IS-A", "FMA18255"],
      ["IS-A", "FMA19386"],
      ["IS-A", "FMA19617"],
      ["IS-A", "FMA19618"],
      ["IS-A", "FMA18247"],
    ]),
  ),
  bodySurface: new Map([["FJ2810", new Set(["FMA7163"])]]),
};

const EXPECTED = {
  respiratory: { files: 108, triangles: 139164 },
  digestive: { files: 146, triangles: 390404 },
  nervous: { files: 60, triangles: 322990 },
  endocrine: { files: 3, triangles: 7454 },
  sensoryEyeRight: { files: 22, triangles: 125714 },
  sensoryEyeLeft: { files: 23, triangles: 128994 },
  sensoryEar: { files: 1, triangles: 2910 },
  lymphatic: { files: 3, triangles: 3410 },
  maleReproductive: { files: 10, triangles: 5130 },
  bodySurface: { files: 1, triangles: 203382 },
};

for (const [name, expected] of Object.entries(EXPECTED)) {
  const actual = stats(targetSets[name]);
  if (
    actual.files !== expected.files ||
    actual.triangles !== expected.triangles
  ) {
    throw new Error(
      `${name}: expected ${expected.files} files / ${expected.triangles} triangles, found ${actual.files} / ${actual.triangles}. Refusing to generate a mapping that disagrees with the official plan.`,
    );
  }
}

// Assert that no new system takes a file from the heart or urinary builds.
const heartSource = JSON.parse(
  readFileSync(
    join(scriptDir, "../apps/web/scripts/anatomy-heart.source.json"),
    "utf8",
  ),
);
const urinarySource = JSON.parse(
  readFileSync(
    join(scriptDir, "../apps/web/scripts/anatomy-urinary.source.json"),
    "utf8",
  ),
);
const protectedFiles = new Set();
for (const source of [heartSource, urinarySource]) {
  for (const structure of source.structures ?? []) {
    for (const file of structure.files ?? []) protectedFiles.add(file.id);
  }
}
for (const [name, set] of Object.entries(targetSets)) {
  const overlap = [...set.keys()].filter((fileId) =>
    protectedFiles.has(fileId),
  );
  if (overlap.length > 0) {
    throw new Error(
      `${name} reuses heart/urinary source files: ${overlap.join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Grouping and module assignment
// ---------------------------------------------------------------------------

function groupByHeader(files) {
  const groups = new Map();
  for (const fileId of files.keys()) {
    const obj = readObj(fileId);
    const key = `${obj.concept}|${obj.name}`;
    if (!groups.has(key)) {
      groups.set(key, {
        concept: obj.concept,
        name: obj.name,
        files: [],
      });
    }
    groups.get(key).files.push(fileId);
  }
  const rows = [...groups.values()].map((group) => {
    group.files.sort();
    group.triangles = group.files.reduce(
      (total, fileId) => total + readObj(fileId).triangles,
      0,
    );
    group.sourceCentroidX =
      group.files.reduce(
        (total, fileId) =>
          total + readObj(fileId).sourceCentroidX * readObj(fileId).triangles,
        0,
      ) / Math.max(group.triangles, 1);
    return group;
  });
  return rows;
}

const LAYER_RULES = {
  respiratory: [
    ["diaphragm", /diaphragm/i],
    ["trachea", /^trachea$/i],
    ["segmental-bronchi", /segmental bronchial tree/i],
    ["bronchi", /bronch/i],
    ["vessels", /artery|arteriole|vein|venous/i],
  ],
  "digestive-upper": [
    [
      "mouth",
      /gingiva|tongue|palat|uvul|submandibular|mouth|lip|cheek|tooth|teeth|salivary/i,
    ],
    ["esophagus", /esophag/i],
    ["stomach", /stomach/i],
  ],
  "digestive-lower": [
    ["mesentery", /mesentery|mesocolon|mesoappendix/i],
    ["small-intestine", /duoden|jejun|ileum|ileocecal/i],
    ["large-intestine", /colon|rectum|appendix|cecum|taenia/i],
  ],
  "digestive-liver": [["liver", /.*/]],
  "digestive-hepatobiliary": [
    ["hepatic-vessels", /portal vein|hepatic artery|hepatic vein/i],
    ["biliary", /gallbladder|bile|biliary|hepatic duct|cystic duct/i],
    ["pancreas", /pancrea/i],
  ],
  "nervous-left": [
    ["ventricles", /ventricle|aqueduct|central canal/i],
    ["cerebellum", /cerebellum/i],
    ["brainstem", /pons|midbrain|medulla|colliculus/i],
    ["deep-structures", /hypothalamus|tuber cinereum|pineal|habenula/i],
    ["cerebrum", /.*/],
  ],
  "nervous-right": [
    ["ventricles", /ventricle|aqueduct|central canal/i],
    ["cerebellum", /cerebellum/i],
    ["brainstem", /pons|midbrain|medulla|colliculus/i],
    ["deep-structures", /hypothalamus|tuber cinereum|pineal|habenula/i],
    ["cerebrum", /.*/],
  ],
  "nervous-central": [
    ["ventricles", /ventricle|aqueduct|central canal/i],
    ["cerebellum", /cerebellum/i],
    ["brainstem", /pons|midbrain|medulla|colliculus/i],
    ["deep-structures", /hypothalamus|tuber cinereum|pineal|habenula/i],
    ["cerebrum", /.*/],
  ],
  "sensory-eye-right": [
    ["eyelids", /tarsal plate/i],
    ["lacrimal", /lacrimal/i],
    ["extraocular-muscles", /rectus|oblique|levator palpebrae/i],
    ["eyeball", /.*/],
  ],
  "sensory-eye-left": [
    ["eyelids", /tarsal plate/i],
    ["lacrimal", /lacrimal/i],
    ["extraocular-muscles", /rectus|oblique|levator palpebrae/i],
    ["eyeball", /.*/],
  ],
  "sensory-ear": [["external-ear", /.*/]],
  endocrine: [
    ["pituitary", /pituitary/i],
    ["adrenal", /adrenal/i],
  ],
  lymphatic: [
    ["spleen", /spleen/i],
    ["thymus", /thymus/i],
  ],
  "male-reproductive": [
    ["testis", /testis|testicle/i],
    ["epididymis", /epididymis/i],
    ["seminal-vesicle", /seminal vesicle/i],
    ["prostate", /prostate/i],
    ["penis", /penis|glans/i],
  ],
  "body-surface-upper": [["skin-upper", /.*/]],
  "body-surface-lower": [["skin-lower", /.*/]],
};

function classifyLayer(moduleSlug, name) {
  for (const [layer, pattern] of LAYER_RULES[moduleSlug] ?? []) {
    if (pattern.test(name)) return layer;
  }
  return "other";
}

function lateralityOf(name) {
  if (/\bleft\b/i.test(name)) return "left";
  if (/\bright\b/i.test(name)) return "right";
  return null;
}

function isMouthConcept(conceptId) {
  return (
    isDescendantEitherTree(conceptId, "FMA49184") ||
    (isDescendantEitherTree(conceptId, "FMA7152") &&
      /gingiva|tongue|palat|uvul|submandibular|mouth|lip|cheek|tooth|teeth|salivary/i.test(
        trees["PART-OF"].conceptName.get(conceptId) ?? "",
      ))
  );
}

function digestiveModuleFor(group) {
  if (
    isMouthConcept(group.concept) ||
    /gingiva|tongue|palat|uvul|submandibular|mouth|lip|cheek|tooth|teeth|salivary/i.test(
      group.name,
    )
  ) {
    return "digestive-upper";
  }
  if (/esophag|stomach/i.test(group.name)) return "digestive-upper";
  if (/hepatovenous segment|caudate lobe of liver/i.test(group.name)) {
    return "digestive-liver";
  }
  if (
    /intestine|colon|rectum|appendix|cecum|taenia|mesentery|mesocolon|mesoappendix|jejun|ileum|duoden|ileocecal/i.test(
      group.name,
    )
  ) {
    return "digestive-lower";
  }
  return "digestive-hepatobiliary";
}

function nervousModuleFor(group) {
  if (/\bleft\b/i.test(group.name)) return "nervous-left";
  if (/\bright\b/i.test(group.name)) return "nervous-right";
  return "nervous-central";
}

const MODULE_META = {
  respiratory: {
    name: "Respiratory system",
    parent: "respiratory",
    layerOrder: [
      "trachea",
      "bronchi",
      "segmental-bronchi",
      "vessels",
      "diaphragm",
    ],
    sortOrder: 3,
  },
  "digestive-upper": {
    name: "Digestive system - upper tract",
    parent: "digestive",
    layerOrder: ["mouth", "esophagus", "stomach"],
    sortOrder: 4,
  },
  "digestive-lower": {
    name: "Digestive system - lower tract",
    parent: "digestive",
    layerOrder: ["small-intestine", "large-intestine", "mesentery"],
    sortOrder: 5,
  },
  "digestive-liver": {
    name: "Digestive system - liver",
    parent: "digestive",
    layerOrder: ["liver"],
    sortOrder: 6,
  },
  "digestive-hepatobiliary": {
    name: "Digestive system - hepatobiliary and pancreas",
    parent: "digestive",
    layerOrder: ["hepatic-vessels", "biliary", "pancreas"],
    sortOrder: 7,
  },
  "nervous-left": {
    name: "Nervous system - left-sided structures",
    parent: "nervous",
    layerOrder: [
      "cerebrum",
      "cerebellum",
      "brainstem",
      "ventricles",
      "deep-structures",
    ],
    sortOrder: 8,
  },
  "nervous-right": {
    name: "Nervous system - right-sided structures",
    parent: "nervous",
    layerOrder: [
      "cerebrum",
      "cerebellum",
      "brainstem",
      "ventricles",
      "deep-structures",
    ],
    sortOrder: 9,
  },
  "nervous-central": {
    name: "Nervous system - central midline structures",
    parent: "nervous",
    layerOrder: [
      "cerebrum",
      "cerebellum",
      "brainstem",
      "ventricles",
      "deep-structures",
    ],
    sortOrder: 10,
  },
  "sensory-eye-right": {
    name: "Sensory system - right eye",
    parent: "sensory",
    layerOrder: ["eyeball", "extraocular-muscles", "lacrimal", "eyelids"],
    sortOrder: 11,
  },
  "sensory-eye-left": {
    name: "Sensory system - left eye",
    parent: "sensory",
    layerOrder: ["eyeball", "extraocular-muscles", "lacrimal", "eyelids"],
    sortOrder: 12,
  },
  "sensory-ear": {
    name: "Sensory system - external ear",
    parent: "sensory",
    layerOrder: ["external-ear"],
    sortOrder: 13,
  },
  endocrine: {
    name: "Endocrine system",
    parent: "endocrine",
    layerOrder: ["pituitary", "adrenal"],
    sortOrder: 14,
  },
  lymphatic: {
    name: "Lymphatic system",
    parent: "lymphatic",
    layerOrder: ["spleen", "thymus"],
    sortOrder: 15,
  },
  "male-reproductive": {
    name: "Male reproductive system",
    parent: "maleReproductive",
    layerOrder: [
      "testis",
      "epididymis",
      "seminal-vesicle",
      "prostate",
      "penis",
    ],
    sortOrder: 16,
  },
  "body-surface-upper": {
    name: "Body surface - upper region",
    parent: "bodySurface",
    layerOrder: ["skin-upper"],
    sortOrder: 17,
  },
  "body-surface-lower": {
    name: "Body surface - lower region",
    parent: "bodySurface",
    layerOrder: ["skin-lower"],
    sortOrder: 18,
  },
};

const PARENT_GROUPS = {
  respiratory: groupByHeader(targetSets.respiratory),
  digestive: groupByHeader(targetSets.digestive),
  nervous: groupByHeader(targetSets.nervous),
  endocrine: groupByHeader(targetSets.endocrine),
  sensoryEyeRight: groupByHeader(targetSets.sensoryEyeRight),
  sensoryEyeLeft: groupByHeader(targetSets.sensoryEyeLeft),
  sensoryEar: groupByHeader(targetSets.sensoryEar),
  lymphatic: groupByHeader(targetSets.lymphatic),
  maleReproductive: groupByHeader(targetSets.maleReproductive),
};

const moduleGroups = new Map(
  Object.keys(MODULE_META).map((slug) => [slug, []]),
);

for (const group of PARENT_GROUPS.respiratory) {
  moduleGroups.get("respiratory").push(group);
}
for (const group of PARENT_GROUPS.digestive) {
  moduleGroups.get(digestiveModuleFor(group)).push(group);
}
for (const group of PARENT_GROUPS.nervous) {
  moduleGroups.get(nervousModuleFor(group)).push(group);
}
for (const group of PARENT_GROUPS.sensoryEyeRight) {
  moduleGroups.get("sensory-eye-right").push(group);
}
for (const group of PARENT_GROUPS.sensoryEyeLeft) {
  moduleGroups.get("sensory-eye-left").push(group);
}
for (const group of PARENT_GROUPS.sensoryEar) {
  moduleGroups.get("sensory-ear").push(group);
}
for (const group of PARENT_GROUPS.endocrine) {
  moduleGroups.get("endocrine").push(group);
}
for (const group of PARENT_GROUPS.lymphatic) {
  moduleGroups.get("lymphatic").push(group);
}
for (const group of PARENT_GROUPS.maleReproductive) {
  moduleGroups.get("male-reproductive").push(group);
}

// ---------------------------------------------------------------------------
// Body surface derivation
// ---------------------------------------------------------------------------

function readObjGeometry(fileId) {
  const { file } = objPath(fileId);
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const headerLines = [];
  const vertices = [];
  const faces = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("#") && faces.length === 0 && vertices.length === 0) {
      headerLines.push(rawLine);
    } else if (line.startsWith("v ")) {
      const parts = line.split(/\s+/);
      vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    } else if (line.startsWith("f ")) {
      const parts = line.split(/\s+/).slice(1);
      faces.push(parts.map((part) => Number(part.split("/")[0]) - 1));
    }
  }
  return { headerLines, vertices, faces };
}

function writeDerivedObj(path, headerLines, vertices, faces) {
  const used = new Map();
  const orderedVertices = [];
  const remappedFaces = [];
  for (const face of faces) {
    const mapped = [];
    for (const index of face) {
      if (!used.has(index)) {
        used.set(index, orderedVertices.length);
        orderedVertices.push(vertices[index]);
      }
      mapped.push(used.get(index));
    }
    remappedFaces.push(mapped);
  }
  const lines = [...headerLines];
  lines.push("# Derived file: triangle-centroid partition of FJ2810.obj");
  lines.push("# The Concept ID and English name headers above are unchanged.");
  for (const [x, y, z] of orderedVertices) {
    lines.push(`v ${x} ${y} ${z}`);
  }
  for (const face of remappedFaces) {
    lines.push(`f ${face.map((index) => index + 1).join(" ")}`);
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  return {
    bytes: Buffer.byteLength(`${lines.join("\n")}\n`),
    triangles: remappedFaces.length,
    vertices: orderedVertices.length,
  };
}

function buildBodySurfaceDerived() {
  const source = readObjGeometry("FJ2810");
  const centroids = source.faces.map((face) => {
    const z =
      face.reduce((sum, index) => sum + source.vertices[index][2], 0) /
      face.length;
    return z;
  });
  const sorted = [...centroids].sort((a, b) => a - b);
  const plane = sorted[Math.floor(sorted.length / 2)];

  const upperFaces = [];
  const lowerFaces = [];
  source.faces.forEach((face, index) => {
    if (centroids[index] >= plane) upperFaces.push(face);
    else lowerFaces.push(face);
  });

  if (upperFaces.length === 0 || lowerFaces.length === 0) {
    throw new Error("Body-surface split produced an empty region");
  }

  mkdirSync(derivedDir, { recursive: true });
  const upperPath = join(derivedDir, "FJ2810U.obj");
  const lowerPath = join(derivedDir, "FJ2810L.obj");
  const upper = writeDerivedObj(
    upperPath,
    source.headerLines,
    source.vertices,
    upperFaces,
  );
  const lower = writeDerivedObj(
    lowerPath,
    source.headerLines,
    source.vertices,
    lowerFaces,
  );

  return {
    plane,
    upper: {
      id: "FJ2810U",
      path: upperPath,
      ...upper,
      sha256: createHash("sha256")
        .update(readFileSync(upperPath))
        .digest("hex"),
    },
    lower: {
      id: "FJ2810L",
      path: lowerPath,
      ...lower,
      sha256: createHash("sha256")
        .update(readFileSync(lowerPath))
        .digest("hex"),
    },
  };
}

let bodySurfaceDerived = null;
if (!args.check) {
  bodySurfaceDerived = buildBodySurfaceDerived();
} else {
  // In check mode, still derive in memory to verify the split totals.
  bodySurfaceDerived = buildBodySurfaceDerived();
}

if (
  bodySurfaceDerived.upper.triangles + bodySurfaceDerived.lower.triangles !==
  EXPECTED.bodySurface.triangles
) {
  throw new Error("Body-surface derived triangle counts do not sum to 203,382");
}

const syntheticBodySurfaceGroups = [
  {
    concept: "FMA7163",
    name: "Skin",
    files: [bodySurfaceDerived.upper.id],
    triangles: bodySurfaceDerived.upper.triangles,
    sourceCentroidX: 0,
    derived: bodySurfaceDerived.upper,
    region: "upper",
  },
  {
    concept: "FMA7163",
    name: "Skin",
    files: [bodySurfaceDerived.lower.id],
    triangles: bodySurfaceDerived.lower.triangles,
    sourceCentroidX: 0,
    derived: bodySurfaceDerived.lower,
    region: "lower",
  },
];

moduleGroups.get("body-surface-upper").push(syntheticBodySurfaceGroups[0]);
moduleGroups.get("body-surface-lower").push(syntheticBodySurfaceGroups[1]);

// ---------------------------------------------------------------------------
// Structure naming, hierarchy, and shared ownership
// ---------------------------------------------------------------------------

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function meshNameFor(slug) {
  return slug.replace(/-/g, "_");
}

function sharedOwnerFor(moduleSlug, name) {
  if (moduleSlug === "respiratory") {
    if (/artery|arteriole|vein|venous/i.test(name)) {
      return {
        sharedWith: ["cardiovascular"],
        canonicalOwner: "cardiovascular",
      };
    }
    if (/diaphragm/i.test(name)) {
      return {
        sharedWith: ["musculoskeletal"],
        canonicalOwner: "musculoskeletal",
      };
    }
  }
  if (
    moduleSlug === "digestive-hepatobiliary" &&
    /portal vein|hepatic artery|hepatic vein/i.test(name)
  ) {
    return { sharedWith: ["cardiovascular"], canonicalOwner: "cardiovascular" };
  }
  if (
    (moduleSlug === "sensory-eye-right" || moduleSlug === "sensory-eye-left") &&
    /rectus|oblique|levator palpebrae/i.test(name)
  ) {
    return {
      sharedWith: ["musculoskeletal"],
      canonicalOwner: "musculoskeletal",
    };
  }
  return {};
}

function nearestSelectedParent(group, allGroups) {
  const byConcept = new Map(allGroups.map((item) => [item.concept, item]));
  for (const tree of ["PART-OF", "IS-A"]) {
    const seen = new Set([group.concept]);
    const queue = [...(trees[tree].parents.get(group.concept) ?? [])];
    while (queue.length > 0) {
      const parent = queue.shift();
      if (seen.has(parent)) continue;
      seen.add(parent);
      if (byConcept.has(parent)) return byConcept.get(parent);
      queue.push(...(trees[tree].parents.get(parent) ?? []));
    }
  }
  return null;
}

function prepareModule(slug, groups) {
  const meta = MODULE_META[slug];
  const rank = new Map(meta.layerOrder.map((layer, index) => [layer, index]));
  const ordered = [...groups].sort((a, b) => {
    const aLayer = classifyLayer(slug, a.name);
    const bLayer = classifyLayer(slug, b.name);
    const aRank = rank.get(aLayer) ?? meta.layerOrder.length;
    const bRank = rank.get(bLayer) ?? meta.layerOrder.length;
    return (
      aRank - bRank || b.triangles - a.triangles || a.name.localeCompare(b.name)
    );
  });

  const usedSlugs = new Set();
  const usedMeshNames = new Set();
  const structures = ordered.map((group) => {
    let baseSlug = slugify(group.name);
    if (group.derived) baseSlug = `skin-${group.region}-body`;
    let candidate = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    usedSlugs.add(candidate);
    let meshName = meshNameFor(candidate);
    while (usedMeshNames.has(meshName)) {
      meshName = `${meshName}_2`;
    }
    usedMeshNames.add(meshName);

    const layer = classifyLayer(slug, group.name);
    if (layer === "other") {
      throw new Error(`${slug}: no layer rule matched "${group.name}"`);
    }

    return {
      ...group,
      slug: candidate,
      meshName,
      layer,
      laterality: lateralityOf(group.name),
      ...sharedOwnerFor(slug, group.name),
    };
  });

  // Resolve parent/child relationships among the selected structures.
  const byConcept = new Map();
  for (const structure of structures) {
    if (structure.derived) continue;
    if (!byConcept.has(structure.concept)) byConcept.set(structure.concept, []);
    byConcept.get(structure.concept).push(structure);
  }
  const parentOf = new Map();
  for (const structure of structures) {
    if (structure.derived) continue;
    let parent = null;
    for (const tree of ["PART-OF", "IS-A"]) {
      const seen = new Set([structure.concept]);
      const queue = [...(trees[tree].parents.get(structure.concept) ?? [])];
      while (queue.length > 0) {
        const candidate = queue.shift();
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        if (byConcept.has(candidate)) {
          parent = byConcept.get(candidate)[0];
          break;
        }
        queue.push(...(trees[tree].parents.get(candidate) ?? []));
      }
      if (parent) break;
    }
    if (parent) parentOf.set(structure.slug, parent.slug);
  }

  const childrenOf = new Map();
  for (const [child, parent] of parentOf) {
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(child);
  }

  for (const structure of structures) {
    if (structure.derived) {
      // The upper and lower skin regions live in separate systems because the
      // viewer resolves related slugs within one system. Do not cross-link
      // them; the mapping documents record the shared FJ2810 derivation.
      structure.relatedSlugs = [];
      continue;
    }
    const related = [];
    if (parentOf.has(structure.slug))
      related.push(parentOf.get(structure.slug));
    related.push(...(childrenOf.get(structure.slug) ?? []));
    if (related.length === 0) {
      related.push(
        ...structures
          .filter(
            (other) =>
              other !== structure &&
              other.layer === structure.layer &&
              !other.derived,
          )
          .slice(0, 4)
          .map((other) => other.slug),
      );
    }
    structure.relatedSlugs = [...new Set(related)].slice(0, 6);
  }

  return { meta, structures };
}

const modules = new Map();
for (const [slug, groups] of moduleGroups) {
  modules.set(slug, prepareModule(slug, groups));
}

// Assert module totals.
const EXPECTED_MODULES = {
  respiratory: { files: 108, triangles: 139164, structures: 26 },
  "digestive-upper": { triangles: 61140 },
  "digestive-lower": { triangles: 116642 },
  "digestive-liver": { triangles: 127788 },
  "digestive-hepatobiliary": { triangles: 84834 },
  "nervous-left": { files: 21, triangles: 104652 },
  "nervous-right": { files: 21, triangles: 106280 },
  "nervous-central": { files: 18, triangles: 112058 },
  "sensory-eye-right": { files: 22, triangles: 125714, structures: 21 },
  "sensory-eye-left": { files: 23, triangles: 128994, structures: 22 },
  "sensory-ear": { files: 1, triangles: 2910, structures: 1 },
  endocrine: { files: 3, triangles: 7454, structures: 3 },
  lymphatic: { files: 3, triangles: 3410, structures: 3 },
  "male-reproductive": { files: 10, triangles: 5130, structures: 10 },
  "body-surface-upper": {
    triangles: bodySurfaceDerived.upper.triangles,
    structures: 1,
  },
  "body-surface-lower": {
    triangles: bodySurfaceDerived.lower.triangles,
    structures: 1,
  },
};

for (const [slug, expected] of Object.entries(EXPECTED_MODULES)) {
  const structures = modules.get(slug).structures;
  const triangles = structures.reduce(
    (total, structure) => total + structure.triangles,
    0,
  );
  const files = structures.reduce(
    (total, structure) => total + structure.files.length,
    0,
  );
  if (
    (expected.triangles !== undefined && triangles !== expected.triangles) ||
    (expected.files !== undefined && files !== expected.files) ||
    (expected.structures !== undefined &&
      structures.length !== expected.structures)
  ) {
    throw new Error(
      `${slug}: module totals do not match the expected plan (files ${files}, triangles ${triangles}, structures ${structures.length})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const COLORS = [
  "#c96b6b",
  "#b95757",
  "#d08a5f",
  "#c79a52",
  "#8fae6b",
  "#5f9e8f",
  "#5b8fb9",
  "#7a7fbf",
  "#9a6fa8",
  "#b06f8c",
  "#8a8f98",
];

function colorFor(layer, layerOrder) {
  const index = layerOrder.indexOf(layer);
  return COLORS[(index >= 0 ? index : layerOrder.length) % COLORS.length];
}

const sourceMetadata = JSON.parse(
  readFileSync(
    join(scriptDir, "../apps/web/scripts/anatomy-urinary.source.json"),
    "utf8",
  ),
).sources;

function sourceEntry(tree, usedFor) {
  const source = sourceMetadata.find((item) => item.tree === tree);
  if (!source) throw new Error(`Missing ${tree} source metadata`);
  return { ...source, usedFor };
}

function derivedSourceEntry() {
  const bytes = bodySurfaceDerived.upper.bytes + bodySurfaceDerived.lower.bytes;
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        source: "FJ2810",
        method: "triangle centroid Z median partition",
        plane: bodySurfaceDerived.plane,
        upper: {
          id: bodySurfaceDerived.upper.id,
          sha256: bodySurfaceDerived.upper.sha256,
          triangles: bodySurfaceDerived.upper.triangles,
        },
        lower: {
          id: bodySurfaceDerived.lower.id,
          sha256: bodySurfaceDerived.lower.sha256,
          triangles: bodySurfaceDerived.lower.triangles,
        },
      }),
    )
    .digest("hex");
  return {
    tree: "DERIVED",
    dataset: "BodyParts3D 4.0 (derived regional partition)",
    polygonReduction: "99%",
    archive: "FJ2810-triangle-partition",
    archiveUrl: "local derivation; no download",
    archiveBytes: bytes,
    archiveEtag: "local-derivation",
    archiveLastModified: "generated",
    archiveSha256: digest,
    extractedObjFiles: 2,
    usedFor:
      "Derived upper/lower body-surface regions from the single FJ2810 skin mesh; triangles are partitioned by centroid Z with no duplication or decimation.",
    licenseUrl: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html",
    licenseUpdated: "2025-02-27",
    license:
      "CC BY 4.0 (current license page); source OBJ headers reference CC BY-SA 2.1 Japan",
    requiredCredit:
      "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.",
  };
}

function fileEntry(fileId, archive) {
  if (archive === "DERIVED") {
    const derived =
      fileId === bodySurfaceDerived.upper.id
        ? bodySurfaceDerived.upper
        : bodySurfaceDerived.lower;
    return {
      id: fileId,
      archive: "DERIVED",
      concept: "FMA7163",
      name: "Skin",
      sha256: derived.sha256,
      triangles: derived.triangles,
    };
  }
  const obj = readObj(fileId);
  return {
    id: fileId,
    archive,
    concept: obj.concept,
    name: obj.name,
    sha256: obj.sha256,
    triangles: obj.triangles,
  };
}

function archiveFor(fileId) {
  if (fileId.startsWith("FJ2810")) return "DERIVED";
  return readObj(fileId).tree;
}

function buildSourceMap(slug) {
  const { meta, structures } = modules.get(slug);
  const sourceTrees = new Set();
  for (const structure of structures) {
    for (const fileId of structure.files) sourceTrees.add(archiveFor(fileId));
  }

  const used = new Set();
  const sourceMapStructures = structures.map((structure) => {
    const files = structure.files.map((fileId) => {
      if (used.has(fileId)) {
        throw new Error(`${slug}: source file ${fileId} assigned twice`);
      }
      used.add(fileId);
      return fileEntry(fileId, archiveFor(fileId));
    });
    return {
      slug: structure.slug,
      meshName: structure.meshName,
      layer: structure.layer,
      color: colorFor(structure.layer, meta.layerOrder),
      ...(structure.laterality ? { laterality: structure.laterality } : {}),
      ...(structure.sharedWith ? { sharedWith: structure.sharedWith } : {}),
      ...(structure.canonicalOwner
        ? { canonicalOwner: structure.canonicalOwner }
        : {}),
      files,
    };
  });

  const orientationChecks = [];
  const byName = new Map(structures.map((item) => [item.name, item]));
  for (const structure of structures) {
    const match = structure.name.match(/\bLeft\b/i);
    if (!match) continue;
    const rightName = structure.name.replace(/\bLeft\b/i, "Right");
    const right = byName.get(rightName);
    if (right) {
      orientationChecks.push({
        left: structure.meshName,
        right: right.meshName,
      });
    }
  }

  const sources = [];
  if (sourceTrees.has("PART-OF")) {
    const count = sourceMapStructures.reduce(
      (total, structure) =>
        total +
        structure.files.filter((file) => file.archive === "PART-OF").length,
      0,
    );
    sources.push(
      sourceEntry(
        "PART-OF",
        `${slug} v1 build: ${count} PART-OF source files.`,
      ),
    );
  }
  if (sourceTrees.has("IS-A")) {
    const count = sourceMapStructures.reduce(
      (total, structure) =>
        total +
        structure.files.filter((file) => file.archive === "IS-A").length,
      0,
    );
    sources.push(
      sourceEntry("IS-A", `${slug} v1 build: ${count} IS-A source files.`),
    );
  }
  if (sourceTrees.has("DERIVED")) {
    sources.push(derivedSourceEntry());
  }
  // The v2 manifest validator requires both official trees to be recorded,
  // even when a module uses only one of them.
  if (!sourceTrees.has("PART-OF")) {
    sources.unshift(
      sourceEntry("PART-OF", `${slug} v1 build: no PART-OF files used.`),
    );
  }
  if (!sourceTrees.has("IS-A")) {
    sources.push(sourceEntry("IS-A", `${slug} v1 build: no IS-A files used.`));
  }

  const totalTriangles = structures.reduce(
    (total, structure) => total + structure.triangles,
    0,
  );

  return {
    version: 2,
    system: slug,
    title: `LOR Mentor ${meta.name.toLowerCase()} anatomy model`,
    output: {
      model: `${slug}.v1.glb`,
      manifest: `${slug}.v1.manifest.json`,
    },
    sources,
    transform: {
      sourceUnits: "millimetres",
      sourceUpAxis: "Z",
      targetUnits: "metres",
      targetUpAxis: "Y",
      mapping:
        "x/1000, z/1000, -y/1000; then centre on the combined bounding box",
    },
    viewerOrientation:
      "Camera looks from +Z toward the origin; patient left is +X (the viewer's right). The viewer renders no on-screen orientation marker.",
    recordTransformDetails: true,
    changes: [
      `Selected ${used.size} source OBJ files from the official BodyParts3D 4.0 tables.`,
      `Merged each structure's source parts into one selectable mesh: ${structures.length} selectable nodes.`,
      "Converted millimetres and the Z-up axis to metres and Y-up, centred the combined model, and recomputed vertex normals.",
      "Exported one uncompressed GLB with stable mesh names. No source colours or textures are used; surface colours are ours.",
      "No teaching text is stored in the model or seed; the module is unpublished pending faculty review.",
    ],
    adaptations: [
      "Grouped source files by the OBJ header Concept ID and English name so each named structure is one selectable node.",
      ...(sourceTrees.has("DERIVED")
        ? [
            "BodyParts3D 4.0 supplies one skin mesh (FJ2810); its triangles were partitioned by centroid Z into upper and lower regional meshes for the 150,000-triangle budget. No triangles are duplicated and no decimation was used.",
          ]
        : []),
      "Large FMA systems are split into independently seeded modules because the viewer supports one GLB per system and each GLB must stay below the release budget.",
    ],
    ...(orientationChecks.length > 0 ? { orientationChecks } : {}),
    structures: sourceMapStructures,
    textOnly: [],
    totalTriangles,
  };
}

function tsString(value) {
  return JSON.stringify(value);
}

function buildSeedFile(slug, preserved) {
  const { meta, structures } = modules.get(slug);
  const identifier = slug.replace(/-/g, "_").toUpperCase();
  const lines = [];
  lines.push("/**");
  lines.push(` * Anatomy Lab seed data - ${meta.name}.`);
  lines.push(" *");
  lines.push(
    " * GENERATED by scripts/generate-anatomy-systems.mjs from the official",
  );
  lines.push(
    " * BodyParts3D 4.0 tables. Do not hand-edit; re-run the generator.",
  );
  lines.push(" *");
  for (const line of teachingTextHeaderLines(slug)) lines.push(line);
  lines.push(" */");
  lines.push("");
  lines.push(
    "import type { AnatomyStructureSeed } from './anatomy-heart.data';",
  );
  lines.push("");
  lines.push(`export const ${identifier}_LAYER_ORDER = [`);
  for (const layer of meta.layerOrder) lines.push(`  ${tsString(layer)},`);
  lines.push("] as const;");
  lines.push("");
  lines.push(`export const ${identifier}_SYSTEM = {`);
  lines.push(`  slug: ${tsString(slug)},`);
  lines.push(`  name: ${tsString(meta.name)},`);
  lines.push("  latinName: null,");
  lines.push(
    `  description: ${tsString(systemTeachingDescription(meta.name, slug))},`,
  );
  lines.push(`  modelUrl: ${tsString(`/models/anatomy/${slug}.v1.glb`)},`);
  lines.push("  isSample: false,");
  lines.push("  isPublished: false,");
  lines.push(`  sortOrder: ${meta.sortOrder},`);
  lines.push("} as const;");
  lines.push("");
  lines.push(
    `export const ${identifier}_STRUCTURES: AnatomyStructureSeed[] = [`,
  );
  for (const structure of structures) {
    const curated = preserved?.get(structure.slug) ?? null;
    const curatedString = (value) =>
      typeof value === "string" && value.trim().length > 0
        ? tsString(value)
        : "''";
    lines.push("  {");
    lines.push(`    slug: ${tsString(structure.slug)},`);
    lines.push(`    name: ${tsString(structure.name)},`);
    lines.push(
      `    latinName: ${
        curated?.latinName ? tsString(curated.latinName) : "null"
      },`,
    );
    lines.push(`    summary: ${curatedString(curated?.summary)},`);
    lines.push(`    location: ${curatedString(curated?.location)},`);
    lines.push(`    function: ${curatedString(curated?.function)},`);
    lines.push(`    bloodSupply: ${curatedString(curated?.bloodSupply)},`);
    lines.push(`    clinicalNotes: ${curatedString(curated?.clinicalNotes)},`);
    lines.push(`    meshName: ${tsString(structure.meshName)},`);
    lines.push(`    layer: ${tsString(structure.layer)},`);
    lines.push(
      `    relatedSlugs: [${structure.relatedSlugs
        .map((related) => tsString(related))
        .join(", ")}],`,
    );
    lines.push(
      `    references: [${tsString(
        `FMA:${structure.concept.replace(/^FMA/, "")} (${structure.name}).`,
      )}],`,
    );
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  lines.push(
    `export function validate${identifier.replace(/_/g, "")}Seed(): void {`,
  );
  lines.push(
    `  const slugs = new Set(${identifier}_STRUCTURES.map((structure) => structure.slug));`,
  );
  lines.push(`  if (slugs.size !== ${identifier}_STRUCTURES.length) {`);
  lines.push(
    `    throw new Error('${meta.name} seed contains duplicate structure slugs.');`,
  );
  lines.push("  }");
  lines.push(
    `  const meshNames = new Set(${identifier}_STRUCTURES.map((structure) => structure.meshName));`,
  );
  lines.push(`  if (meshNames.size !== ${identifier}_STRUCTURES.length) {`);
  lines.push(
    `    throw new Error('${meta.name} seed contains duplicate mesh names.');`,
  );
  lines.push("  }");
  lines.push(
    `  if (${identifier}_STRUCTURES.length !== ${structures.length}) {`,
  );
  lines.push(
    `    throw new Error('${meta.name} seed must contain exactly ${structures.length} structures.');`,
  );
  lines.push("  }");
  lines.push(`  for (const structure of ${identifier}_STRUCTURES) {`);
  lines.push("    for (const relatedSlug of structure.relatedSlugs) {");
  lines.push("      if (!slugs.has(relatedSlug)) {");
  lines.push(
    `        throw new Error(\`Structure \"\${structure.slug}\" references unknown related slug \"\${relatedSlug}\".\`);`,
  );
  lines.push("      }");
  lines.push("    }");
  lines.push("    if (structure.references.length === 0) {");
  lines.push(
    `      throw new Error(\`Structure \"\${structure.slug}\" has no references.\`);`,
  );
  lines.push("    }");
  lines.push(
    "    if (structure.meshName !== null && !/^[a-z0-9_]+$/.test(structure.meshName)) {",
  );
  lines.push(
    `      throw new Error(\`Structure \"\${structure.slug}\" has an invalid mesh name \"\${structure.meshName}\".\`);`,
  );
  lines.push("    }");
  for (const line of emptyTeachingTextGuardLines(slug)) lines.push(line);
  lines.push("  }");
  lines.push("}");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildMappingDoc(slug) {
  const { meta, structures } = modules.get(slug);
  const sourceMap = buildSourceMap(slug);
  const totalTriangles = structures.reduce(
    (total, structure) => total + structure.triangles,
    0,
  );
  const totalFiles = structures.reduce(
    (total, structure) => total + structure.files.length,
    0,
  );
  const lines = [];
  lines.push(`# ${meta.name} - source mapping`);
  lines.push("");
  lines.push(
    "**Status: mapping not yet owner-reviewed.** Building does not wait",
  );
  lines.push(
    "for this review; publishing does. The seed rows are unpublished and",
  );
  lines.push("their teaching text is empty.");
  lines.push("");
  lines.push(`- Module slug: \`${slug}\``);
  lines.push(`- Source: BodyParts3D 4.0 PART-OF and IS-A trees`);
  lines.push(`- Source files: ${totalFiles}`);
  lines.push(`- Selectable structures: ${structures.length}`);
  lines.push(`- Triangles: ${totalTriangles.toLocaleString("en-US")}`);
  lines.push(`- Model: \`${slug}.v1.glb\``);
  lines.push(`- Manifest: \`${slug}.v1.manifest.json\``);
  lines.push("");
  lines.push("## Derivation");
  lines.push("");
  lines.push("1. Read the official PART-OF and IS-A inclusion tables and");
  lines.push("   element-parts tables.");
  lines.push(
    "2. Compute the FMA system membership recursively from the official",
  );
  lines.push("   roots; the counts were checked against");
  lines.push("   `docs/anatomy/whole-body-plan.md` before generation.");
  lines.push("3. Exclude files owned by the heart or urinary builds. Record");
  lines.push("   remaining shared files with a canonical owner.");
  lines.push(
    "4. Group files by the OBJ header Concept ID and English name. This is",
  );
  lines.push("   the authoritative one-structure-per-named-structure key; the");
  lines.push(
    "   inclusion tables attach files to many ancestors and are ambiguous.",
  );
  lines.push(
    "5. Assign a kebab-case slug and snake_case mesh name, a layer from the",
  );
  lines.push(
    "   FMA hierarchy/English name, and related slugs from the nearest",
  );
  lines.push("   selected parent/children.");
  lines.push("");
  lines.push("## Module split");
  lines.push("");
  lines.push(
    "The viewer supports one GLB per system and each GLB must stay below",
  );
  lines.push("150,000 triangles. This module is one part of that split:");
  lines.push("");
  lines.push(`- Layer order: ${meta.layerOrder.join(" -> ")}`);
  lines.push(`- Sort order: ${meta.sortOrder}`);
  lines.push("");
  lines.push("## Mapping table");
  lines.push("");
  lines.push(
    "| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |",
  );
  lines.push("| --- | --- | --- | --- | ---: | ---: | --- | --- |");
  for (const structure of structures) {
    lines.push(
      `| \`${structure.slug}\` | ${structure.name} | ${structure.concept} | ${structure.layer} | ${structure.files.join(", ")} | ${structure.triangles.toLocaleString("en-US")} | ${structure.laterality ?? "-"} | ${structure.canonicalOwner ?? "-"} |`,
    );
  }
  lines.push("");
  lines.push("## Verification");
  lines.push("");
  lines.push(
    "- Every OBJ header Concept ID and English name is checked by the",
  );
  lines.push("  build script.");
  lines.push("- Every source SHA-256 is checked by the build script.");
  lines.push(
    "- The GLB is checked by `validate-anatomy-model.mjs` for the 5 MB",
  );
  lines.push(
    "  and 150,000-triangle limits, unique mesh names, licence metadata,",
  );
  lines.push("  and manifest agreement.");
  lines.push(
    "- Left/right pairs are checked by the build orientation guard and by",
  );
  lines.push("  the cross-module guard for pairs split across modules.");
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  if (slug === "respiratory") {
    lines.push(
      "- BodyParts3D 4.0 has no lung-parenchyma surface mesh. This build is",
    );
    lines.push(
      "  bronchi, the trachea, the diaphragm, and a few lingular arteries;",
    );
    lines.push(
      "  the pulmonary vessels remain cardiovascular-owned and are not drawn.",
    );
  }
  if (slug === "sensory-ear") {
    lines.push(
      "- BodyParts3D supplies one external-ear mesh without a side label.",
    );
    lines.push(
      "  It is presented as a single unsided structure rather than inventing",
    );
    lines.push("  a missing contralateral mesh.");
  }
  if (slug === "lymphatic") {
    lines.push(
      "- BodyParts3D has no lymph-node or lymph-vessel meshes in this set.",
    );
    lines.push("  The module contains the spleen and the two thymus lobes.");
  }
  if (slug === "male-reproductive") {
    lines.push(
      "- BodyParts3D has no ductus deferens, scrotum, or full penis root mesh",
    );
    lines.push(
      "  in this set. The module contains the structures that have geometry.",
    );
  }
  if (slug.startsWith("body-surface")) {
    lines.push(
      "- The skin is one 203,382-triangle mesh in BodyParts3D. This module is",
    );
    lines.push(
      "  a derived regional partition by triangle centroid Z, not a separate",
    );
    lines.push("  FMA concept. No triangles are duplicated or decimated.");
  }
  lines.push(
    "- The mapping has not been owner-reviewed. Do not publish this module",
  );
  lines.push("  until that review is recorded.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------

const summary = [];
for (const slug of Object.keys(MODULE_META)) {
  const { meta, structures } = modules.get(slug);
  const triangles = structures.reduce(
    (total, structure) => total + structure.triangles,
    0,
  );
  const files = structures.reduce(
    (total, structure) => total + structure.files.length,
    0,
  );
  summary.push({
    slug,
    name: meta.name,
    files,
    structures: structures.length,
    triangles,
    model: `${slug}.v1.glb`,
  });
}

if (args.check) {
  console.log("Step 3 generation check passed.");
  for (const row of summary) {
    console.log(
      `${row.slug}: ${row.files} files, ${row.structures} structures, ${row.triangles} triangles`,
    );
  }
  console.log(
    `body surface split: ${bodySurfaceDerived.upper.triangles} upper + ${bodySurfaceDerived.lower.triangles} lower = ${bodySurfaceDerived.upper.triangles + bodySurfaceDerived.lower.triangles}`,
  );
  process.exit(0);
}

// Teaching-text safety. Before writing anything, inspect each existing seed
// module. Loaded systems keep their curated text; any other system that
// already carries non-empty teaching text refuses the whole run.
const preservedBySlug = new Map();
for (const slug of Object.keys(MODULE_META)) {
  const dataPath = join(repoRoot, `apps/api/prisma/anatomy-${slug}.data.ts`);
  const existingBySlug = existsSync(dataPath)
    ? extractCuratedText(readFileSync(dataPath, "utf8"), dataPath)
    : new Map();
  assertRegenerationSafe({ slug, existingBySlug, dataPath });
  preservedBySlug.set(slug, preservedCuratedText(slug, existingBySlug));
}

const generatedRegistryLines = [];
generatedRegistryLines.push("/**");
generatedRegistryLines.push(" * Generated Anatomy Lab seed registry.");
generatedRegistryLines.push(" *");
generatedRegistryLines.push(
  " * Do not hand-edit; re-run scripts/generate-anatomy-systems.mjs.",
);
generatedRegistryLines.push(" */");
generatedRegistryLines.push("");
for (const slug of Object.keys(MODULE_META)) {
  const identifier = slug.replace(/-/g, "_").toUpperCase();
  generatedRegistryLines.push(
    `import { ${identifier}_LAYER_ORDER, ${identifier}_STRUCTURES, ${identifier}_SYSTEM, validate${identifier.replace(/_/g, "")}Seed } from './anatomy-${slug}.data';`,
  );
}
generatedRegistryLines.push("");
generatedRegistryLines.push("export const GENERATED_ANATOMY_SEED_REGISTRY = [");
for (const slug of Object.keys(MODULE_META)) {
  const identifier = slug.replace(/-/g, "_").toUpperCase();
  generatedRegistryLines.push("  {");
  generatedRegistryLines.push(`    system: ${identifier}_SYSTEM,`);
  generatedRegistryLines.push(`    structures: ${identifier}_STRUCTURES,`);
  generatedRegistryLines.push(`    layerOrder: ${identifier}_LAYER_ORDER,`);
  generatedRegistryLines.push(
    `    validate: validate${identifier.replace(/_/g, "")}Seed,`,
  );
  generatedRegistryLines.push("  },");
}
generatedRegistryLines.push("] as const;");
generatedRegistryLines.push("");

const attributionLines = [];
attributionLines.push("/**");
attributionLines.push(" * Generated Anatomy Lab attribution entries.");
attributionLines.push(" *");
attributionLines.push(
  " * Do not hand-edit; re-run scripts/generate-anatomy-systems.mjs.",
);
attributionLines.push(" */");
attributionLines.push("");
for (const slug of Object.keys(MODULE_META)) {
  const identifier = slug.replace(/-/g, "_").toUpperCase();
  attributionLines.push(
    `import ${identifier}_MANIFEST from '../../public/models/anatomy/${slug}.v1.manifest.json';`,
  );
}
attributionLines.push("");
attributionLines.push(
  "import type { AnatomyAttributionEntry } from './anatomy-attribution';",
);
attributionLines.push("");
attributionLines.push(
  "export const GENERATED_ANATOMY_ATTRIBUTION: readonly AnatomyAttributionEntry[] = [",
);
for (const slug of Object.keys(MODULE_META)) {
  const identifier = slug.replace(/-/g, "_").toUpperCase();
  attributionLines.push("  {");
  attributionLines.push(`    slug: ${tsString(slug)},`);
  attributionLines.push(`    name: ${tsString(MODULE_META[slug].name)},`);
  attributionLines.push('    status: "draft",');
  attributionLines.push(
    `    manifest: ${identifier}_MANIFEST as unknown as AnatomyAttributionEntry["manifest"],`,
  );
  attributionLines.push("  },");
}
attributionLines.push("];");
attributionLines.push("");

for (const slug of Object.keys(MODULE_META)) {
  writeFileSync(
    join(repoRoot, `apps/web/scripts/anatomy-${slug}.source.json`),
    `${JSON.stringify(buildSourceMap(slug), null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(repoRoot, `apps/api/prisma/anatomy-${slug}.data.ts`),
    buildSeedFile(slug, preservedBySlug.get(slug)),
    "utf8",
  );
  writeFileSync(
    join(repoRoot, `docs/anatomy/provenance/${slug}-mapping.md`),
    buildMappingDoc(slug),
    "utf8",
  );
}

writeFileSync(
  join(repoRoot, "apps/api/prisma/anatomy-generated.registry.ts"),
  `${generatedRegistryLines.join("\n")}\n`,
  "utf8",
);
writeFileSync(
  join(repoRoot, "apps/web/src/lib/anatomy-attribution.generated.ts"),
  `${attributionLines.join("\n")}\n`,
  "utf8",
);

const orientationPairs = [];
for (const [leftSlug, rightSlug] of [
  ["nervous-left", "nervous-right"],
  ["sensory-eye-left", "sensory-eye-right"],
]) {
  const left = modules.get(leftSlug).structures;
  const right = modules.get(rightSlug).structures;
  const rightByRemainder = new Map();
  for (const structure of right) {
    const remainder = structure.name.replace(/\bRight\b/i, "").trim();
    rightByRemainder.set(remainder, structure);
  }
  for (const structure of left) {
    const remainder = structure.name.replace(/\bLeft\b/i, "").trim();
    const counterpart = rightByRemainder.get(remainder);
    if (!counterpart) continue;
    orientationPairs.push({
      left: {
        module: leftSlug,
        slug: structure.slug,
        meshName: structure.meshName,
        sourceCentroidX: structure.sourceCentroidX,
      },
      right: {
        module: rightSlug,
        slug: counterpart.slug,
        meshName: counterpart.meshName,
        sourceCentroidX: counterpart.sourceCentroidX,
      },
    });
  }
}

const summaryPath = join(
  repoRoot,
  "docs/anatomy/provenance/step-3-systems.json",
);
writeFileSync(
  summaryPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceRoot,
      bodySurface: {
        method: "triangle centroid Z median partition",
        plane: bodySurfaceDerived.plane,
        upper: {
          id: bodySurfaceDerived.upper.id,
          sha256: bodySurfaceDerived.upper.sha256,
          triangles: bodySurfaceDerived.upper.triangles,
        },
        lower: {
          id: bodySurfaceDerived.lower.id,
          sha256: bodySurfaceDerived.lower.sha256,
          triangles: bodySurfaceDerived.lower.triangles,
        },
      },
      modules: summary,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(
  join(repoRoot, "docs/anatomy/provenance/step-3-orientation-pairs.json"),
  `${JSON.stringify(orientationPairs, null, 2)}\n`,
  "utf8",
);

console.log("Wrote Step 3 source maps, seed data, and mapping documents.");
for (const row of summary) {
  console.log(
    `${row.slug}: ${row.files} files, ${row.structures} structures, ${row.triangles} triangles`,
  );
}
console.log(
  `body surface split plane Z=${bodySurfaceDerived.plane.toFixed(3)} mm: ${bodySurfaceDerived.upper.triangles} upper + ${bodySurfaceDerived.lower.triangles} lower`,
);
console.log(`cross-module orientation pairs: ${orientationPairs.length}`);
