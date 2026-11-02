#!/usr/bin/env node
/**
 * Cross-module left/right orientation guard.
 *
 * The large Step 3 systems are split into separate GLBs, so the build-time
 * orientation guard cannot compare every left/right pair: the counterpart
 * lives in another file. This script reads the checked-in pair list and
 * compares the X centroid of each mesh in its own GLB with the X centroid of
 * the source OBJ recorded in the pair list.
 *
 * Run: node scripts/check-anatomy-orientation.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "../..");
const modelDir = join(webRoot, "public/models/anatomy");
const pairsPath = join(
  repoRoot,
  "docs/anatomy/provenance/step-3-orientation-pairs.json",
);

const COMPONENT_BYTES = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COUNTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

function readGlb(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${path}: not a GLB file`);
  }
  const length = buffer.readUInt32LE(8);
  if (length !== buffer.byteLength) {
    throw new Error(`${path}: GLB length header does not match the file size`);
  }

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.byteLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    else if (chunkType === 0x004e4942) bin = chunk;
    offset += 8 + chunkLength;
  }
  if (!json || !bin) throw new Error(`${path}: missing JSON or BIN chunk`);
  return { json, bin };
}

function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Unknown accessor ${accessorIndex}`);
  const view = glb.json.bufferViews?.[accessor.bufferView];
  if (!view)
    throw new Error(`Unknown bufferView for accessor ${accessorIndex}`);
  const components = TYPE_COUNTS[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  if (!components || !componentBytes) {
    throw new Error(`Unsupported accessor ${accessorIndex}`);
  }
  if (componentBytes !== 4) {
    throw new Error(`POSITION accessor ${accessorIndex} is not 32-bit float`);
  }
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? components * componentBytes;
  const values = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const start = base + i * stride;
    for (let c = 0; c < components; c += 1) {
      values.push(glb.bin.readFloatLE(start + c * componentBytes));
    }
  }
  return values;
}

function meshCentroidX(glb, meshName) {
  const node = glb.json.nodes?.find((item) => item.name === meshName);
  if (!node || node.mesh === undefined) {
    throw new Error(`No node named "${meshName}"`);
  }
  const primitive = glb.json.meshes?.[node.mesh]?.primitives?.[0];
  const positions = readAccessor(glb, primitive?.attributes?.POSITION);
  if (!positions || positions.length === 0) {
    throw new Error(`Node "${meshName}" has no POSITION data`);
  }
  let sum = 0;
  for (let i = 0; i < positions.length; i += 3) sum += positions[i];
  return sum / (positions.length / 3);
}

function main() {
  if (!existsSync(pairsPath)) {
    throw new Error(`Missing pair list: ${pairsPath}`);
  }
  const pairs = JSON.parse(readFileSync(pairsPath, "utf8"));
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error("The cross-module pair list is empty");
  }

  const glbs = new Map();
  const failures = [];
  const offsetsByModule = new Map();
  let sourceSign = null;

  for (const pair of pairs) {
    const leftModule = pair.left?.module;
    const rightModule = pair.right?.module;
    for (const side of ["left", "right"]) {
      const entry = pair[side];
      if (
        !entry?.module ||
        !entry.meshName ||
        !Number.isFinite(entry.sourceCentroidX)
      ) {
        failures.push(
          `Malformed ${side} entry in pair ${JSON.stringify(pair)}`,
        );
        continue;
      }
      const glbPath = join(modelDir, `${entry.module}.v1.glb`);
      if (!glbs.has(glbPath)) glbs.set(glbPath, readGlb(glbPath));
    }
    if (failures.length > 0) continue;

    const leftGlb = glbs.get(join(modelDir, `${leftModule}.v1.glb`));
    const rightGlb = glbs.get(join(modelDir, `${rightModule}.v1.glb`));
    const leftOutput = meshCentroidX(leftGlb, pair.left.meshName);
    const rightOutput = meshCentroidX(rightGlb, pair.right.meshName);
    const sourceDelta = pair.left.sourceCentroidX - pair.right.sourceCentroidX;

    if (sourceDelta === 0) {
      failures.push(
        `${pair.left.meshName}/${pair.right.meshName}: identical source X centroids`,
      );
      continue;
    }

    const pairSourceSign = Math.sign(sourceDelta);
    if (sourceSign === null) sourceSign = pairSourceSign;
    else if (sourceSign !== pairSourceSign) {
      failures.push(
        `${pair.left.meshName}/${pair.right.meshName}: source orientation disagrees with the other pairs`,
      );
    }

    // Each GLB is centred on its own bounding box after the millimetre-to-metre
    // transform. That per-module offset is harmless for one loaded system but
    // makes raw cross-file centroids incomparable. Recover the offset from the
    // source and output centroid of every pair, require it to be constant per
    // module, then compare the left/right delta in the common source frame.
    for (const [side, entry, output] of [
      ["left", pair.left, leftOutput],
      ["right", pair.right, rightOutput],
    ]) {
      const offset = entry.sourceCentroidX / 1000 - output;
      if (!offsetsByModule.has(entry.module))
        offsetsByModule.set(entry.module, []);
      offsetsByModule.get(entry.module).push({ side, offset });
    }
  }

  for (const [module, entries] of offsetsByModule) {
    const values = entries.map((entry) => entry.offset);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max - min > 0.0005) {
      failures.push(
        `${module}: per-module centring offset is not constant (${min.toFixed(6)} to ${max.toFixed(6)} m); the transform may have scaled or reflected X`,
      );
    }
  }

  if (failures.length === 0) {
    const offsetFor = (module) => offsetsByModule.get(module)[0].offset;
    for (const pair of pairs) {
      const leftOutput =
        meshCentroidX(
          glbs.get(join(modelDir, `${pair.left.module}.v1.glb`)),
          pair.left.meshName,
        ) + offsetFor(pair.left.module);
      const rightOutput =
        meshCentroidX(
          glbs.get(join(modelDir, `${pair.right.module}.v1.glb`)),
          pair.right.meshName,
        ) + offsetFor(pair.right.module);
      const sourceDelta =
        pair.left.sourceCentroidX - pair.right.sourceCentroidX;
      const outputDelta = leftOutput - rightOutput;
      const expectedDelta = sourceDelta / 1000;
      if (Math.abs(outputDelta - expectedDelta) > 0.0005) {
        failures.push(
          `${pair.left.meshName}/${pair.right.meshName}: adjusted output X delta ${outputDelta.toFixed(6)} m does not match source delta ${expectedDelta.toFixed(6)} m`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error("Cross-module orientation check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `Cross-module orientation check passed: ${pairs.length} pairs across ${glbs.size} GLBs.`,
  );
  console.log(
    `Patient left is ${sourceSign > 0 ? "+X" : "-X"} in the source frame; each GLB is independently centred, and the offset-adjusted X deltas preserve that sign.`,
  );
}

main();
