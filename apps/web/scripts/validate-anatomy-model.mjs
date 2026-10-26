#!/usr/bin/env node
/**
 * Validate an Anatomy Lab model against its provenance manifest.
 *
 *   npm run validate:anatomy-model --workspace=apps/web
 *   node scripts/validate-anatomy-model.mjs --system urinary
 *
 * By default this checks the live heart v2 asset. Pass a GLB and manifest pair
 * to validate a candidate release without touching the live model:
 *
 *   node scripts/validate-anatomy-model.mjs --system urinary \
 *     --glb path/to/candidate.glb \
 *     --manifest path/to/candidate.manifest.json
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
const SYSTEMS = new Set(["heart", "urinary"]);

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function defaultAssets(system) {
  return system === "urinary"
    ? {
        glb: join(modelDir, "urinary.v1.glb"),
        manifest: join(modelDir, "urinary.v1.manifest.json"),
      }
    : {
        glb: join(modelDir, "heart.v2.glb"),
        manifest: join(modelDir, "manifest.json"),
      };
}

function parseArgs(argv) {
  const args = { system: "heart", glb: null, manifest: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--system") args.system = argv[++i];
    else if (arg === "--glb") args.glb = resolve(argv[++i]);
    else if (arg === "--manifest") args.manifest = resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!SYSTEMS.has(args.system)) {
    throw new Error(
      `Unknown system "${args.system}". Expected one of: ${[...SYSTEMS].join(", ")}`,
    );
  }

  const defaults = defaultAssets(args.system);
  args.glb = args.glb ?? defaults.glb;
  args.manifest = args.manifest ?? defaults.manifest;
  return args;
}

function usage() {
  return [
    "Usage: node scripts/validate-anatomy-model.mjs [--system heart|urinary] [--glb <path>] [--manifest <path>]",
    "",
    "Defaults to the live heart v2 asset. --system urinary checks urinary.v1.",
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

  const binHeaderOffset = 20 + jsonLength;
  if (binHeaderOffset + 8 > buffer.byteLength) {
    failures.push("GLB has no BIN chunk header");
    return { json, bin: null };
  }
  const binLength = buffer.readUInt32LE(binHeaderOffset);
  const binType = buffer.readUInt32LE(binHeaderOffset + 4);
  check(binType === 0x004e4942, "Second GLB chunk is not BIN");
  check(
    binHeaderOffset + 8 + binLength <= buffer.byteLength,
    "GLB BIN chunk runs past the end of the file",
  );

  return {
    json,
    bin: buffer.subarray(
      binHeaderOffset + 8,
      Math.min(binHeaderOffset + 8 + binLength, buffer.byteLength),
    ),
  };
}

function readAccessor(glb, index) {
  const accessor = glb.json.accessors?.[index];
  if (!accessor) return null;
  const view = glb.json.bufferViews?.[accessor.bufferView];
  if (!view || !glb.bin) return null;

  const componentSizes = { 5123: 2, 5125: 4, 5126: 4 };
  const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const componentSize = componentSizes[accessor.componentType];
  const componentCount = componentCounts[accessor.type];
  if (!componentSize || !componentCount) return null;

  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const length = accessor.count * componentCount;
  if (byteOffset + length * componentSize > glb.bin.byteLength) {
    failures.push(`Accessor ${index} runs past the end of the BIN chunk`);
    return null;
  }

  if (accessor.componentType === 5126) {
    return new Float32Array(
      glb.bin.buffer,
      glb.bin.byteOffset + byteOffset,
      length,
    );
  }
  if (accessor.componentType === 5123) {
    return new Uint16Array(
      glb.bin.buffer,
      glb.bin.byteOffset + byteOffset,
      length,
    );
  }
  return new Uint32Array(
    glb.bin.buffer,
    glb.bin.byteOffset + byteOffset,
    length,
  );
}

function nodeCentroidX(glb, nodeName) {
  const node = glb.json.nodes?.find((item) => item.name === nodeName);
  if (!node) return null;
  const mesh = glb.json.meshes?.[node.mesh];
  const primitive = mesh?.primitives?.[0];
  if (!primitive) return null;
  const positions = readAccessor(glb, primitive.attributes?.POSITION);
  if (!positions || positions.length === 0) return null;

  let sum = 0;
  for (let i = 0; i < positions.length; i += 3) sum += positions[i];
  return sum / (positions.length / 3);
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
  const parsedGlb = parseGlb(glb);
  if (!parsedGlb) {
    report();
    return;
  }
  const { json } = parsedGlb;

  const isV2 = manifest.schemaVersion === 2;
  check(
    manifest.schemaVersion === 1 || isV2,
    "Manifest schemaVersion must be 1 or 2",
  );
  check(
    manifest.system === args.system,
    `Manifest system "${manifest.system}" does not match --system ${args.system}`,
  );
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
  check(
    typeof json.asset?.copyright === "string" &&
      json.asset.copyright.includes("BodyParts3D") &&
      json.asset.copyright.includes("CC BY-SA 2.1 Japan"),
    "GLB asset copyright must record the BodyParts3D credit and both licence statements",
  );
  check(
    JSON.stringify(json.asset?.extras?.license) ===
      JSON.stringify(manifest.license),
    "GLB asset extras.license must match the manifest licence object",
  );
  const publicJson = JSON.stringify({ manifest, asset: json.asset });
  check(
    !publicJson.includes("commercialRelease"),
    "Public anatomy metadata must not contain commercialRelease",
  );
  check(
    !publicJson.toLowerCase().includes("development asset"),
    'Public anatomy metadata must not contain "development asset"',
  );

  if (args.system === "urinary") {
    check(
      manifest.transform?.scale === 0.001,
      "Urinary manifest transform.scale must be 0.001",
    );
    check(
      isFiniteVector(manifest.transform?.offsetMetres, 3),
      "Urinary manifest transform.offsetMetres must be a finite 3-vector",
    );
    check(
      manifest.transform?.offsetConvention ===
        "bodyPosition = modelPosition + offsetMetres",
      "Urinary manifest must record the offset convention",
    );
    check(
      Array.isArray(json.asset?.extras?.adaptations) &&
        json.asset.extras.adaptations.length > 0,
      "Urinary GLB asset extras must record the urinary adaptations",
    );

    const heartPath = join(modelDir, "heart.v2.glb");
    if (existsSync(heartPath)) {
      const heart = parseGlb(readFileSync(heartPath));
      if (heart) {
        check(
          json.asset?.copyright === heart.json.asset?.copyright,
          "Urinary asset.copyright must use the same wording as heart.v2.glb",
        );
        check(
          JSON.stringify(json.asset?.extras?.license) ===
            JSON.stringify(heart.json.asset?.extras?.license),
          "Urinary asset.extras.license must use the same wording as heart.v2.glb",
        );
      }
    }
  }
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
    nodeNames.every(
      (name) => typeof name === "string" && name.trim().length > 0,
    ),
    "Every GLB node must have a non-empty name",
  );
  check(
    meshNames.every(
      (name) => typeof name === "string" && name.trim().length > 0,
    ),
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

    check(
      sources.length >= 2,
      "A v2 manifest must record both source archives",
    );
    check(
      sourceTrees.has("PART-OF"),
      "A v2 manifest must record the PART-OF archive",
    );
    check(
      sourceTrees.has("IS-A"),
      "A v2 manifest must record the IS-A archive",
    );
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
      check(
        !nodeNames.includes(item.slug),
        `Text-only structure "${item.slug}" must not have a GLB node with the slug as its name`,
      );
      check(
        !nodeNames.includes(item.slug.replace(/-/g, "_")),
        `Text-only structure "${item.slug}" must not have a GLB node named "${item.slug.replace(/-/g, "_")}"`,
      );
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

  if (args.system === "urinary") {
    const textOnly = manifest.textOnly ?? [];
    check(
      manifestStructures.length === 10,
      `Urinary manifest must list 10 mesh structures, found ${manifestStructures.length}`,
    );
    check(
      textOnly.length === 5,
      `Urinary manifest must list 5 text-only structures, found ${textOnly.length}`,
    );
    check(
      manifest.model?.totalStructures === 15,
      "Urinary manifest must record 15 total structures",
    );

    const expectedSharedFiles = new Map([
      ["right-renal-artery", 1],
      ["left-renal-artery", 1],
      ["right-renal-vein", 2],
      ["left-renal-vein", 2],
    ]);
    const sharedStructures = manifest.sharedStructures ?? [];
    check(
      sharedStructures.length === expectedSharedFiles.size,
      `Urinary manifest must record ${expectedSharedFiles.size} shared structures`,
    );
    for (const [slug, fileCount] of expectedSharedFiles) {
      const structure = manifestStructures.find((item) => item.slug === slug);
      check(
        Boolean(structure),
        `Urinary manifest is missing shared structure "${slug}"`,
      );
      if (!structure) continue;
      check(
        Array.isArray(structure.sharedWith) &&
          structure.sharedWith.includes("cardiovascular"),
        `Shared structure "${slug}" must be marked sharedWith cardiovascular`,
      );
      check(
        structure.canonicalOwner === "cardiovascular",
        `Shared structure "${slug}" must keep cardiovascular as canonicalOwner`,
      );
      check(
        Array.isArray(structure.files) && structure.files.length === fileCount,
        `Shared structure "${slug}" must record ${fileCount} source element IDs`,
      );
    }

    const orientation = manifest.orientation;
    const outputAxis = orientation?.outputFrame?.patientLeftAxis;
    const sourceAxis = orientation?.sourceFrame?.patientLeftAxis;
    check(
      outputAxis === "+X" || outputAxis === "-X",
      "Urinary manifest must record the output patient-left X axis",
    );
    check(
      sourceAxis === "+X" || sourceAxis === "-X",
      "Urinary manifest must record the source patient-left X axis",
    );
    check(
      sourceAxis === outputAxis,
      "Urinary source and output frames must agree on the patient-left axis",
    );
    check(
      manifest.checks?.orientationVerified === true,
      "Urinary manifest must confirm the orientation check passed",
    );

    const orientationChecks = orientation?.checks ?? [];
    const requiredPairs = [
      ["left_kidney", "right_kidney"],
      ["left_ureter", "right_ureter"],
    ];
    for (const [left, right] of requiredPairs) {
      check(
        orientationChecks.some(
          (item) => item.left === left && item.right === right,
        ),
        `Urinary orientation checks must include ${left}/${right}`,
      );
    }

    const outputSign = outputAxis === "+X" ? 1 : outputAxis === "-X" ? -1 : 0;
    const sourceSign = sourceAxis === "+X" ? 1 : sourceAxis === "-X" ? -1 : 0;
    for (const pair of orientationChecks) {
      const leftX = nodeCentroidX(parsedGlb, pair.left);
      const rightX = nodeCentroidX(parsedGlb, pair.right);
      check(
        Number.isFinite(leftX) && Number.isFinite(rightX),
        `Cannot read centroids for orientation pair ${pair.left}/${pair.right}`,
      );
      if (Number.isFinite(leftX) && Number.isFinite(rightX) && outputSign) {
        check(
          outputSign * (leftX - rightX) > 0,
          `Left/right swap detected for ${pair.left}/${pair.right} in the output GLB`,
        );
        const recordedLeft = orientation?.outputFrame?.centroidX?.[pair.left];
        const recordedRight = orientation?.outputFrame?.centroidX?.[pair.right];
        check(
          Math.abs(leftX - recordedLeft) < 1e-5 &&
            Math.abs(rightX - recordedRight) < 1e-5,
          `Recorded output centroid X does not match the GLB for ${pair.left}/${pair.right}`,
        );
      }

      const sourceLeft = orientation?.sourceFrame?.centroidX?.[pair.left];
      const sourceRight = orientation?.sourceFrame?.centroidX?.[pair.right];
      check(
        Number.isFinite(sourceLeft) && Number.isFinite(sourceRight),
        `Urinary manifest is missing source centroids for ${pair.left}/${pair.right}`,
      );
      if (
        Number.isFinite(sourceLeft) &&
        Number.isFinite(sourceRight) &&
        sourceSign
      ) {
        check(
          sourceSign * (sourceLeft - sourceRight) > 0,
          `Left/right swap detected for ${pair.left}/${pair.right} in the source frame`,
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
