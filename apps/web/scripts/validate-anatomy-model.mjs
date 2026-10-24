#!/usr/bin/env node
/**
 * Validate the shipped Anatomy Lab model against its provenance manifest.
 *
 *   npm run validate:anatomy-model --workspace=apps/web
 *
 * This checks the asset itself, not the seed. The seed-to-model contract is
 * covered by apps/api/src/modules/anatomy/anatomy-model.contract.spec.ts.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelDir = resolve(scriptDir, "../public/models/anatomy");
const glbPath = join(modelDir, "heart.v1.glb");
const manifestPath = join(modelDir, "manifest.json");

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
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

function main() {
  for (const [label, path] of [
    ["model", glbPath],
    ["manifest", manifestPath],
  ]) {
    if (!existsSync(path)) {
      console.error(`Missing ${label}: ${path}`);
      process.exit(1);
    }
  }

  const glb = readFileSync(glbPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const json = parseGlb(glb);
  if (!json) {
    report();
    return;
  }

  check(manifest.schemaVersion === 1, "Manifest schemaVersion must be 1");
  check(manifest.system === "heart", "Manifest system must be heart");
  check(manifest.model, "Manifest is missing model metadata");
  check(
    manifest.model?.bytes === glb.byteLength,
    `Manifest byte count ${manifest.model?.bytes} does not match ${glb.byteLength}`,
  );

  const digest = createHash("sha256").update(glb).digest("hex");
  check(
    manifest.model?.sha256 === digest,
    `Manifest SHA-256 does not match the GLB (${digest})`,
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

  const manifestStructures = manifest.structures ?? [];
  const manifestMeshNames = manifestStructures.map((item) => item.meshName);
  check(
    new Set(manifestMeshNames).size === manifestMeshNames.length,
    "Manifest mesh names must be unique",
  );
  check(
    manifestMeshNames.length === nodeNames.length,
    `Manifest lists ${manifestMeshNames.length} structures but GLB has ${nodeNames.length} nodes`,
  );
  for (const name of manifestMeshNames) {
    check(
      nodeNames.filter((nodeName) => nodeName === name).length === 1,
      `Mesh "${name}" must appear exactly once in the GLB`,
    );
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
      const indexAccessor = json.accessors?.[primitive.indices];
      check(
        positionAccessor?.type === "VEC3",
        `Mesh "${mesh.name}" POSITION accessor must be VEC3`,
      );
      check(
        Array.isArray(positionAccessor?.min) &&
          positionAccessor.min.every(Number.isFinite) &&
          Array.isArray(positionAccessor?.max) &&
          positionAccessor.max.every(Number.isFinite),
        `Mesh "${mesh.name}" POSITION accessor needs finite min/max`,
      );
      check(
        indexAccessor?.type === "SCALAR",
        `Mesh "${mesh.name}" needs a scalar index accessor`,
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

  check(
    typeof manifest.source?.requiredCredit === "string" &&
      manifest.source.requiredCredit.includes("BodyParts3D"),
    "Manifest must record the BodyParts3D credit",
  );
  check(
    typeof manifest.source?.licenseUrl === "string",
    "Manifest must record the licence URL",
  );
  check(
    typeof manifest.license?.status === "string",
    "Manifest must record the licence status",
  );

  report({
    bytes: glb.byteLength,
    triangles: triangleTotal,
    structures: nodes.length,
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
      `  ${summary.structures} structures, ${summary.triangles.toLocaleString("en-US")} triangles, ${(summary.bytes / 1024 / 1024).toFixed(2)} MB`,
    );
  }
}

main();
