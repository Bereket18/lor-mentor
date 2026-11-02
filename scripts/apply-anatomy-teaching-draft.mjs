#!/usr/bin/env node
/**
 * Apply an AI-drafted teaching-text markdown file to an anatomy seed module.
 *
 * The draft uses one "### <slug>" block per structure. Inside a block, each
 * line of the form "- <field>: <value>" sets one field. The recognised fields
 * are the six the seed stores for teaching:
 *
 *   latinName, summary, location, function, bloodSupply, clinicalNotes
 *
 * Rules, enforced rather than optional:
 *   - Structures are matched by slug only. Names are never used.
 *   - A draft slug that does not exist in the target seed file refuses the
 *     whole load (unknown slug), naming the offending slug and line.
 *   - A slug that appears twice in the draft, or twice in the target seed
 *     file, refuses the whole load (duplicate slug).
 *   - Only the six fields above are written. name, meshName, layer,
 *     relatedSlugs, references, isReviewed and isPublished are never touched,
 *     so loaded rows stay unreviewed and the module stays unpublished.
 *
 * Usage:
 *   node scripts/apply-anatomy-teaching-draft.mjs \
 *     --draft docs/anatomy/drafts/respiratory-teaching-draft.md \
 *     --data apps/api/prisma/anatomy-respiratory.data.ts
 *
 * Options:
 *   --draft <path>    draft markdown (default: respiratory draft)
 *   --data <path>     target seed module (default: respiratory data)
 *   --array <name>    seed array constant (default: the *_STRUCTURES array)
 *   --check           parse and validate only; write nothing
 *   --allow-partial   do not warn when the draft leaves seed rows empty
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const FIELDS = [
  "latinName",
  "summary",
  "location",
  "function",
  "bloodSupply",
  "clinicalNotes",
];

const TEACHING_FIELDS = [
  "summary",
  "location",
  "function",
  "bloodSupply",
  "clinicalNotes",
];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

const draftPath = resolve(
  ROOT,
  readFlag("--draft") ?? "docs/anatomy/drafts/respiratory-teaching-draft.md",
);
const dataPath = resolve(
  ROOT,
  readFlag("--data") ?? "apps/api/prisma/anatomy-respiratory.data.ts",
);
const arrayHint = readFlag("--array");
const checkOnly = process.argv.includes("--check");
const allowPartial = process.argv.includes("--allow-partial");

/** A TypeScript string literal with backslashes and single quotes escaped. */
function tsString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function collapse(value) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Parse the draft into slug -> { field: value }. Refuses duplicate slugs and
 * duplicate fields within a block.
 */
function parseDraft(text, source) {
  const blocks = new Map();
  let current = null;
  let field = null;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    const lineNumber = index + 1;

    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      const slug = heading[1].trim();
      if (!SLUG_PATTERN.test(slug)) {
        throw new Error(
          `${source}:${lineNumber}: invalid slug "${slug}" (expected kebab-case).`,
        );
      }
      if (blocks.has(slug)) {
        throw new Error(
          `${source}:${lineNumber}: duplicate slug "${slug}" in the draft.`,
        );
      }
      current = { slug, line: lineNumber, fields: {} };
      blocks.set(slug, current);
      field = null;
      return;
    }

    if (!current) return;

    // A horizontal rule or the reviewer checklist ends the current block.
    if (/^(---|===)/.test(line.trim())) {
      current = null;
      field = null;
      return;
    }

    const assignment = line.match(/^-\s+([A-Za-z][A-Za-z0-9]*)\s*:\s?(.*)$/);
    if (assignment) {
      const key = assignment[1];
      if (!FIELDS.includes(key)) {
        throw new Error(
          `${source}:${lineNumber}: unknown field "${key}" on "${current.slug}".`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(current.fields, key)) {
        throw new Error(
          `${source}:${lineNumber}: duplicate field "${key}" on "${current.slug}".`,
        );
      }
      field = key;
      current.fields[key] = assignment[2];
      return;
    }

    if (field && line.trim() !== "") {
      current.fields[field] += ` ${line.trim()}`;
    }
  });

  if (blocks.size === 0) {
    throw new Error(`${source}: no "### <slug>" blocks found.`);
  }
  return blocks;
}

/** Collect the seed objects from the target module, keyed by slug. */
function collectStructures(sourceText, fileName, hint) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let arrayName = null;
  let arrayNode = null;
  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (
        !arrayNode &&
        ts.isIdentifier(declaration.name) &&
        ts.isArrayLiteralExpression(declaration.initializer) &&
        (hint
          ? declaration.name.text === hint
          : /_STRUCTURES$/.test(declaration.name.text))
      ) {
        arrayName = declaration.name.text;
        arrayNode = declaration.initializer;
      }
    }
  });

  if (!arrayNode) {
    throw new Error(
      `${fileName}: could not find the seed array${hint ? ` "${hint}"` : ""}.`,
    );
  }

  const bySlug = new Map();
  for (const element of arrayNode.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;
    const properties = new Map();
    for (const property of element.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      ) {
        properties.set(property.name.text, property);
      }
    }
    const slugProperty = properties.get("slug");
    if (!slugProperty || !ts.isStringLiteral(slugProperty.initializer))
      continue;
    const slug = slugProperty.initializer.text;
    if (bySlug.has(slug)) {
      throw new Error(`${fileName}: duplicate slug "${slug}" in ${arrayName}.`);
    }
    bySlug.set(slug, { slug, properties, node: element });
  }

  if (bySlug.size === 0) {
    throw new Error(`${fileName}: ${arrayName} contains no slug entries.`);
  }
  return { arrayName, bySlug, sourceFile };
}

function main() {
  const draftText = readFileSync(draftPath, "utf8");
  const dataText = readFileSync(dataPath, "utf8");

  const draft = parseDraft(draftText, draftPath);
  const { arrayName, bySlug, sourceFile } = collectStructures(
    dataText,
    dataPath,
    arrayHint,
  );

  // Validate every draft block before writing anything.
  for (const block of draft.values()) {
    for (const field of FIELDS) {
      const value = collapse(block.fields[field] ?? "");
      if (value === "") {
        throw new Error(
          `${draftPath}:${block.line}: "${block.slug}" is missing "${field}".`,
        );
      }
      block.fields[field] = value;
    }
    for (const field of TEACHING_FIELDS) {
      if (block.fields[field] === "") {
        throw new Error(
          `${draftPath}:${block.line}: "${block.slug}" has an empty "${field}".`,
        );
      }
    }
  }

  const edits = [];
  for (const block of draft.values()) {
    const target = bySlug.get(block.slug);
    if (!target) {
      throw new Error(
        `Unknown slug "${block.slug}" (${draftPath}:${block.line}); it is not in ${arrayName}. Refusing to load.`,
      );
    }
    for (const field of FIELDS) {
      const property = target.properties.get(field);
      if (!property) {
        throw new Error(
          `"${block.slug}" has no "${field}" property in ${dataPath}.`,
        );
      }
      const initializer = property.initializer;
      const colon = dataText.indexOf(":", property.name.getEnd());
      if (colon === -1) {
        throw new Error(
          `"${block.slug}.${field}" has no value colon in ${dataPath}.`,
        );
      }
      // Replace from just after the colon so the space before the old value
      // does not survive as trailing whitespace.
      const start = colon + 1;
      const end = initializer.getEnd();

      let replacement;
      if (field === "latinName") {
        replacement = ` ${tsString(block.fields[field])}`;
      } else {
        const lineStart = dataText.lastIndexOf("\n", property.getStart()) + 1;
        const indent = dataText.slice(lineStart, property.getStart());
        replacement = `\n${indent}  ${tsString(block.fields[field])}`;
      }
      edits.push({ start, end, replacement });
    }
  }

  const untouched = [...bySlug.keys()].filter((slug) => !draft.has(slug));
  if (untouched.length > 0 && !allowPartial) {
    console.warn(
      `Warning: ${untouched.length} seed row(s) have no draft block and keep empty text: ${untouched.join(", ")}.`,
    );
  }

  let output = dataText;
  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) {
    output =
      output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
  }

  const summary =
    `${checkOnly ? "Checked" : "Loaded"} ${draft.size} draft block(s) into ` +
    `${arrayName} (${edits.length} fields). ` +
    `${untouched.length} seed row(s) untouched.`;
  console.log(summary);

  if (!checkOnly) {
    writeFileSync(dataPath, output, "utf8");
    console.log(`Wrote ${dataPath}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`apply-anatomy-teaching-draft failed: ${error.message}`);
  process.exit(1);
}
