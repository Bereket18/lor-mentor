#!/usr/bin/env node
/**
 * Validate an Anatomy Lab model against its provenance manifest.
 *
 *   npm run validate:anatomy-model --workspace=apps/web
 *
 * By default this checks the live v1 asset. Pass a GLB and manifest pair to
 * validate a candidate release without switching the live model:
 *
 *   node scripts/validate-anatomy-model.mjs \
 *     --glb public/models/anatomy/heart.v2.glb \
 *     --manifest public/models/anatomy/heart.v2.manifest.json
 *
 * This checks the asset itself, not the seed. The seed-to-model contract is
 * covered by apps/api/src/modules/anatomy/anatomy-model.contract.spec.ts.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelDir = resolve(scriptDir, "../public/models/anatomy");

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TRIANGLES = 150_000;

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function parseArgs(argv) {
  const args = {
    glb: join(modelDir, "heart.v1.glb"),
    manifest: join(modelDir, "manifest.json"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--glb") args.glb = resolve(argv[++i]);
    else if (arg === "--manifest") args.manifest = resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/validate-anatomy-model.mjs [--glb <path>] [--manifest <path>]",
    "",
    "Defaults to the live v1 asset and manifest.",
  ].join("\n");
}

function parseGlb(buffer) {
  check(buffer.byteLength >= 20, "GLB is shorter than a valid header");
  if (buffer.byteLength < 20) return null;

  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const totalLength = buffer.readUInt32LE(8);
  check(magic === 0x46546c67, "GLB magic is not glTF");
  check(version === 2, `GLB version ${version} is not 2`);
  check(
    totalLength === buffer.byteLength,
    `GLB header length ${totalLength} does not match file size ${buffer.byteLength}`,
  );

  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  check(jsonType === 0x4e4f534a, "First GLB chunk is not JSON");
  check(
    20 + jsonLength <= buffer.byteLength,
    "GLB JSON chunk runs past the end of the file",
  );

  let json;
  try {
    json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  } catch (error) {
    failures.push(`GLB JSON chunk is not valid JSON: ${error.message}`);
    return null;
  }

  return json;
}

function isFiniteVector(value, length) {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  for (const [label, path] of [
    ["model", args.glb],
    ["manifest", args.manifest],
  ]) {
    if (!existsSync(path)) {
      console.error(`Missing ${label}: ${path}`);
      process.exit(1);
    }
  }

  const glb = readFileSync(args.glb);
  const manifest = JSON.parse(readFileSync(args.manifest, "utf8"));
  const json = parseGlb(glb);
  if (!json) {
    report();
    return;
  }

  const isV2 = manifest.schemaVersion === 2;
  check(
    manifest.schemaVersion === 1 || isV2,
    "Manifest schemaVersion must be 1 or 2",
  );
  check(manifest.system === "heart", "Manifest system must be heart");
  check(manifest.model, "Manifest is missing model metadata");
  check(
    manifest.model?.file === basename(args.glb),
    `Manifest model file ${manifest.model?.file} does not match ${basename(args.glb)}`,
  );
  check(
    manifest.model?.bytes === glb.byteLength,
    `Manifest byte count ${manifest.model?.bytes} does not match ${glb.byteLength}`,
  );
  check(
    glb.byteLength <= MAX_BYTES,
    `GLB is ${glb.byteLength} bytes; the release limit is ${MAX_BYTES}`,
  );

  const digest = createHash("sha256").update(glb).digest("hex");
  check(
    manifest.model?.sha256 === digest,
    `Manifest SHA-256 does not match the GLB (${digest})`,
  );

  check(json.asset?.version === "2.0", "GLB asset version must be 2.0");
  check(
    json.asset?.extras?.license?.notice?.includes("BodyParts3D"),
    "GLB asset extras must record the BodyParts3D credit",
  );
  check(json.scene === 0, "GLB must declare scene 0");
  check(
    Array.isArray(json.scenes) && json.scenes.length === 1,
    "GLB must contain exactly one scene",
  );
  check(
    !json.buffers?.some((buffer) => typeof buffer.uri === "string"),
    "GLB must not reference external buffers",
  );
  check(
    !json.images || json.images.length === 0,
    "GLB must remain texture-free for this release",
  );

  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const nodeNames = nodes.map((node) => node.name);
  const meshNames = meshes.map((mesh) => mesh.name);

  check(
    nodeNames.every((name) => typeof name === "string" && name.trim().length > 0),
    "Every GLB node must have a non-empty name",
  );
  check(
    meshNames.every((name) => typeof name === "string" && name.trim().length > 0),
    "Every GLB mesh must have a non-empty name",
  );
  check(
    json.scenes?.[0]?.nodes?.length === nodes.length,
    "Every node must be part of the root scene",
  );
  check(
    new Set(nodeNames).size === nodeNames.length,
    "GLB node names must be unique",
  );
  check(
    new Set(meshNames).size === meshNames.length,
    "GLB mesh names must be unique",
  );
  check(
    nodeNames.every((name) => meshNames.includes(name)),
    "Every selectable node must reference a mesh with the same name",
  );
  check(
    nodes.every(
      (node) => Number.isInteger(node.mesh) && Boolean(meshes[node.mesh]),
    ),
    "Every node must reference a valid mesh index",
  );

  const manifestStructures = manifest.structures ?? [];
  const manifestMeshNames = manifestStructures.map((item) => item.meshName);
  check(
    new Set(manifestMeshNames).size === manifestMeshNames.length,
    "Manifest mesh names must be unique",
  );
  check(
    manifestMeshNames.length === nodeNames.length,
    `Manifest lists ${manifestMeshNames.length} mesh structures but GLB has ${nodeNames.length} nodes`,
  );
  for (const name of manifestMeshNames) {
    check(
      nodeNames.filter((nodeName) => nodeName === name).length === 1,
      `Mesh "${name}" must appear exactly once in the GLB`,
    );
  }

  if (isV2) {
    const sources = manifest.sources ?? [];
    const sourceTrees = new Set(sources.map((source) => source.tree));
    const textOnly = manifest.textOnly ?? [];
    const textOnlySlugs = textOnly.map((item) => item.slug);

    check(sources.length >= 2, "A v2 manifest must record both source archives");
    check(sourceTrees.has("PART-OF"), "A v2 manifest must record the PART-OF archive");
    check(sourceTrees.has("IS-A"), "A v2 manifest must record the IS-A archive");
    for (const source of sources) {
      check(
        typeof source.archive === "string" && source.archive.length > 0,
        `Source ${source.tree ?? "(unknown)"} needs an archive name`,
      );
      check(
        Number.isInteger(source.archiveBytes) && source.archiveBytes > 0,
        `Source ${source.tree ?? "(unknown)"} needs a positive archive size`,
      );
      check(
        typeof source.archiveSha256 === "string" &&
          /^[a-f0-9]{64}$/.test(source.archiveSha256),
        `Source ${source.tree ?? "(unknown)"} needs a SHA-256`,
      );
      check(
        typeof source.requiredCredit === "string" &&
          source.requiredCredit.includes("BodyParts3D"),
        `Source ${source.tree ?? "(unknown)"} needs the BodyParts3D credit`,
      );
    }

    check(
      manifest.model?.textOnlyStructures === textOnly.length,
      `Manifest lists ${textOnly.length} text-only structures but model metadata says ${manifest.model?.textOnlyStructures}`,
    );
    check(
      manifest.model?.totalStructures ===
        manifestStructures.length + textOnly.length,
      "Manifest total structure count does not match mesh + text-only rows",
    );
    check(
      new Set(textOnlySlugs).size === textOnlySlugs.length,
      "Text-only slugs must be unique",
    );
    check(
      textOnlySlugs.every(
        (slug) => !manifestStructures.some((item) => item.slug === slug),
      ),
      "A structure cannot be both a mesh and text-only",
    );

    for (const item of textOnly) {
      check(
        typeof item.slug === "string" && item.slug.length > 0,
        "Every text-only structure needs a slug",
      );
      check(
        typeof item.layer === "string" && item.layer.length > 0,
        `Text-only structure "${item.slug}" needs a layer`,
      );
      check(
        typeof item.reason === "string" && item.reason.length > 0,
        `Text-only structure "${item.slug}" needs a reason`,
      );
      if (item.legacyMeshName) {
        check(
          !nodeNames.includes(item.legacyMeshName),
          `Text-only structure "${item.slug}" must not have a GLB node named "${item.legacyMeshName}"`,
        );
      }
    }

    for (const structure of manifestStructures) {
      for (const file of structure.files ?? []) {
        check(
          sourceTrees.has(file.archive),
          `Source file ${file.id} references undeclared archive ${file.archive}`,
        );
      }
    }
  }

  let triangleTotal = 0;
  for (const [index, node] of nodes.entries()) {
    const mesh = meshes[node.mesh];
    check(Boolean(mesh), `Node "${node.name}" has no mesh`);
    if (!mesh) continue;
    check(
      mesh.primitives?.length === 1,
      `Mesh "${mesh.name}" must have exactly one primitive`,
    );
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = json.accessors?.[primitive.attributes?.POSITION];
      const normalAccessor = json.accessors?.[primitive.attributes?.NORMAL];
      const indexAccessor = json.accessors?.[primitive.indices];
      check(
        positionAccessor?.type === "VEC3",
        `Mesh "${mesh.name}" POSITION accessor must be VEC3`,
      );
      check(
        Number.isInteger(positionAccessor?.count) && positionAccessor.count > 0,
        `Mesh "${mesh.name}" POSITION accessor must contain vertices`,
      );
      check(
        isFiniteVector(positionAccessor?.min, 3) &&
          isFiniteVector(positionAccessor?.max, 3),
        `Mesh "${mesh.name}" POSITION accessor needs finite min/max`,
      );
      check(
        normalAccessor?.type === "VEC3" &&
          normalAccessor?.count === positionAccessor?.count,
        `Mesh "${mesh.name}" NORMAL accessor must match POSITION`,
      );
      check(
        indexAccessor?.type === "SCALAR",
        `Mesh "${mesh.name}" needs a scalar index accessor`,
      );
      check(
        Number.isInteger(indexAccessor?.count) && indexAccessor.count > 0,
        `Mesh "${mesh.name}" index accessor must contain indices`,
      );
      check(
        indexAccessor?.count % 3 === 0,
        `Mesh "${mesh.name}" index count must be a multiple of 3`,
      );
      check(
        indexAccessor?.componentType === 5123 ||
          indexAccessor?.componentType === 5125,
        `Mesh "${mesh.name}" indices must be unsigned 16- or 32-bit`,
      );
      triangleTotal += Math.floor((indexAccessor?.count ?? 0) / 3);
    }

    const manifestStructure = manifestStructures[index];
    check(
      manifestStructure?.meshName === node.name,
      `Manifest structure ${index} does not match GLB node "${node.name}"`,
    );
    check(
      manifestStructure?.layer === node.extras?.layer,
      `Layer mismatch for "${node.name}"`,
    );
  }

  check(
    triangleTotal === manifest.model?.triangles,
    `Triangle total ${triangleTotal} does not match manifest ${manifest.model?.triangles}`,
  );
  check(
    triangleTotal <= MAX_TRIANGLES,
    `Model has ${triangleTotal} triangles; the release limit is ${MAX_TRIANGLES}`,
  );
  check(
    manifestStructures.length === manifest.model?.structures,
    "Manifest structure count does not match its own model metadata",
  );

  for (const structure of manifestStructures) {
    check(
      Array.isArray(structure.files) && structure.files.length > 0,
      `Structure "${structure.slug}" has no source files`,
    );
    check(
      Array.isArray(structure.fma) && structure.fma.length > 0,
      `Structure "${structure.slug}" has no FMA concepts`,
    );
    check(
      typeof structure.triangles === "number" && structure.triangles > 0,
      `Structure "${structure.slug}" has no triangle count`,
    );
  }

  if (isV2) {
    for (const source of manifest.sources ?? []) {
      check(
        typeof source.license === "string" &&
          source.license.includes("CC BY 4.0") &&
          source.license.includes("CC BY-SA 2.1 Japan"),
        `Source ${source.tree} must record both licence statements`,
      );
    }
  } else {
    check(
      typeof manifest.source?.requiredCredit === "string" &&
        manifest.source.requiredCredit.includes("BodyParts3D"),
      "Manifest must record the BodyParts3D credit",
    );
  }
  check(
    typeof manifest.source?.licenseUrl === "string" ||
      (manifest.sources ?? []).every(
        (source) => typeof source.licenseUrl === "string",
      ),
    "Manifest must record the licence URL",
  );
  check(
    typeof manifest.license?.status === "string",
    "Manifest must record the licence status",
  );
  check(
    typeof manifest.license?.notice === "string" &&
      manifest.license.notice.includes("BodyParts3D"),
    "Manifest must record the BodyParts3D notice",
  );
  check(
    manifest.checks?.uniqueMeshNames === true &&
      manifest.checks?.uniqueSourceFiles === true &&
      manifest.checks?.sourceHeadersVerified === true,
    "Manifest checks must confirm unique names, unique files, and verified headers",
  );
  if (isV2) {
    check(
      manifest.checks?.sourceHashesVerified === true,
      "A v2 manifest must confirm source hashes were verified",
    );
  }

  report({
    bytes: glb.byteLength,
    triangles: triangleTotal,
    structures: nodes.length,
    textOnly: manifest.textOnly?.length ?? 0,
  });
}

function report(summary) {
  if (failures.length > 0) {
    console.error("Anatomy model validation failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log("Anatomy model validation passed.");
  if (summary) {
    console.log(
      `  ${summary.structures} mesh structures${summary.textOnly > 0 ? ` + ${summary.textOnly} text-only` : ""}, ${summary.triangles.toLocaleString("en-US")} triangles, ${(summary.bytes / 1024 / 1024).toFixed(2)} MB`,
    );
  }
}

main();
