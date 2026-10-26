#!/usr/bin/env node
/**
 * Build an Anatomy Lab model from BodyParts3D 4.0 source geometry.
 *
 * The source archives are NOT committed. Point this script at an extracted
 * archive (or a directory containing the selected FJ*.obj files):
 *
 *   node scripts/build-anatomy-model.mjs --system heart \
 *     --source-dir "C:\path\to\partof_BP3D_4.0_obj_99"
 *
 * For a model that combines the PART-OF and IS-A trees, pass one labelled
 * source directory per tree so each file is read from the archive recorded in
 * the source map:
 *
 *   node scripts/build-anatomy-model.mjs --system urinary \
 *     --source-dir "PART-OF=C:\path\to\partof_BP3D_4.0_obj_99" \
 *     --source-dir "IS-A=C:\path\to\isa_BP3D_4.0_obj_99"
 *
 * --system selects the checked-in source map: anatomy-heart.source.json or
 * anatomy-urinary.source.json. The map drives the output names, title, change
 * log, text-only rows, and any orientation checks.
 *
 * The script:
 *   - validates every source OBJ header against the checked-in source map
 *   - verifies each file's SHA-256 when the source map records one
 *   - converts mm/Z-up geometry to metres/Y-up
 *   - merges source parts into one selectable glTF node per mesh structure
 *   - records the scale, centring offset, and optional left/right check
 *   - writes a versioned GLB plus a provenance manifest
 *
 * It intentionally writes an uncompressed GLB. The model is small enough for
 * the current viewer, and avoiding a decoder keeps the runtime simple.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const modelDir = join(webRoot, "public/models/anatomy");

const SYSTEMS = new Set(["heart", "urinary"]);

function sourceMapPath(system) {
  return join(scriptDir, `anatomy-${system}.source.json`);
}

function defaultOutput(system) {
  return system === "urinary"
    ? { model: "urinary.v1.glb", manifest: "urinary.v1.manifest.json" }
    : { model: "heart.v2.glb", manifest: "manifest.json" };
}

function outputFileName(value, fallback, label) {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("..")
  ) {
    throw new Error(
      `${label} must be a plain file name inside public/models/anatomy`,
    );
  }
  return value;
}

function parseArgs(argv) {
  const args = { sourceDirs: [], system: "heart" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--system") args.system = argv[++i];
    else if (arg === "--source-dir") args.sourceDirs.push(argv[++i]);
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--manifest") args.manifest = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!SYSTEMS.has(args.system)) {
    throw new Error(
      `Unknown system "${args.system}". Expected one of: ${[...SYSTEMS].join(", ")}`,
    );
  }
  if (args.sourceDirs.length === 0 && process.env.BODYPARTS3D_SOURCE_DIR) {
    args.sourceDirs.push(process.env.BODYPARTS3D_SOURCE_DIR);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/build-anatomy-model.mjs [--system heart|urinary] --source-dir <dir> [--source-dir <dir> ...]",
    "",
    "Options:",
    "  --system <name>          Source map to build: heart (default) or urinary.",
    "  --source-dir <dir>       Extracted BodyParts3D 4.0 archive, or a",
    "                           directory containing the selected FJ*.obj files.",
    "                           Repeat for multiple archives. Prefix a directory",
    "                           with TREE= to bind it to a source tree, for",
    "                           example --source-dir PART-OF=C:\\bp3d\\partof.",
    "  --out <path>             Output GLB path.",
    "  --manifest <path>        Output provenance manifest path.",
  ].join("\n");
}

function walk(dir, result = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else result.push(full);
  }
  return result;
}

function indexObjFiles(sourceDir) {
  const files = walk(sourceDir).filter((file) =>
    /[\\/]FJ\d+\.obj$/i.test(file),
  );
  const byId = new Map();
  for (const file of files) {
    const id = file.match(/(FJ\d+)\.obj$/i)?.[1]?.toUpperCase();
    if (id) byId.set(id, file);
  }
  return byId;
}

/**
 * Build lookup tables for one or more source directories. A directory may be
 * labelled with a source tree (`PART-OF=...` or `IS-A=...`). Labelled
 * directories are kept separate so the same element ID can exist in both
 * archives without an ambiguity error. Unlabelled directories are combined
 * into one index for callers that copied all selected files into one place.
 */
function buildSourceIndexes(specs) {
  const combined = new Map();
  const byTree = new Map();

  for (const spec of specs) {
    const separator = spec.indexOf("=");
    const label =
      separator > 0 ? spec.slice(0, separator).trim().toUpperCase() : null;
    const rawPath = separator > 0 ? spec.slice(separator + 1) : spec;
    const sourceDir = isAbsolute(rawPath)
      ? rawPath
      : resolve(process.cwd(), rawPath);

    if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
      throw new Error(`Source directory does not exist: ${sourceDir}`);
    }

    const index = indexObjFiles(sourceDir);
    const target = label ? (byTree.get(label) ?? new Map()) : combined;
    if (label && !byTree.has(label)) byTree.set(label, target);

    for (const [id, file] of index) {
      if (target.has(id)) {
        throw new Error(
          `Source file ${id} appears more than once in ${label ?? "the combined source directories"}`,
        );
      }
      target.set(id, file);
    }
  }

  return { combined, byTree };
}

function resolveSourceFile(file, indexes) {
  if (file.archive) {
    const tree = indexes.byTree.get(file.archive.toUpperCase());
    if (tree) {
      const match = tree.get(file.id);
      if (!match) {
        throw new Error(
          `Missing source file ${file.id}.obj from ${file.archive}. Check the labelled source directory.`,
        );
      }
      return match;
    }
  }

  const match = indexes.combined.get(file.id);
  if (!match) {
    throw new Error(
      `Missing source file ${file.id}.obj. Extract the archive or pass a directory containing the selected files.`,
    );
  }
  return match;
}

function readHeader(text, key) {
  return text.match(new RegExp(`^# ${key}\\s*:\\s*(.+)$`, "m"))?.[1]?.trim();
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseObj(text, fileId) {
  const vertices = [];
  const faces = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("v ")) {
      const parts = line.split(/\s+/);
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      if (![x, y, z].every(Number.isFinite)) {
        throw new Error(`${fileId}: invalid vertex line "${line}"`);
      }
      vertices.push(x, y, z);
    } else if (line.startsWith("f ")) {
      const tokens = line.split(/\s+/).slice(1);
      const indices = tokens.map((token) => {
        const raw = Number(token.split("/")[0]);
        if (!Number.isInteger(raw) || raw === 0) {
          throw new Error(`${fileId}: invalid face token "${token}"`);
        }
        const index = raw > 0 ? raw - 1 : vertices.length / 3 + raw;
        if (index < 0 || index >= vertices.length / 3) {
          throw new Error(`${fileId}: face index out of range "${token}"`);
        }
        return index;
      });

      // BodyParts3D faces are triangles, but triangulating a fan keeps this
      // parser safe for a future source update with quads.
      for (let i = 1; i < indices.length - 1; i += 1) {
        faces.push(indices[0], indices[i], indices[i + 1]);
      }
    }
  }

  if (vertices.length === 0 || faces.length === 0) {
    throw new Error(`${fileId}: no usable geometry`);
  }

  return { vertices, faces };
}

function transformPoint(x, y, z) {
  // BodyParts3D uses millimetres and Z-up. Three.js uses Y-up.
  return [x / 1000, z / 1000, -y / 1000];
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;

    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = positions[ib + 2] - positions[ia + 2];
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = positions[ic + 2] - positions[ia + 2];

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    normals[ia] += nx;
    normals[ia + 1] += ny;
    normals[ia + 2] += nz;
    normals[ib] += nx;
    normals[ib + 1] += ny;
    normals[ib + 2] += nz;
    normals[ic] += nx;
    normals[ic + 1] += ny;
    normals[ic + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (length > 0) {
      normals[i] /= length;
      normals[i + 1] /= length;
      normals[i + 2] /= length;
    } else {
      normals[i + 1] = 1;
    }
  }

  return normals;
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

function centroidX(positions) {
  let sum = 0;
  for (let i = 0; i < positions.length; i += 3) sum += positions[i];
  return sum / (positions.length / 3);
}

/**
 * Compare paired left/right structures in both the source frame and the
 * centred output frame. The build fails if any pair is reversed, or if the
 * source and output frames disagree about which X direction is patient left.
 */
function buildOrientationReport(structures, checks, viewerOrientation) {
  if (!Array.isArray(checks) || checks.length === 0) return null;

  const byMeshName = new Map(
    structures.map((structure) => [structure.meshName, structure]),
  );
  const sourceCentroids = {};
  const outputCentroids = {};
  let sourceSign = null;
  let outputSign = null;

  for (const check of checks) {
    const left = byMeshName.get(check.left);
    const right = byMeshName.get(check.right);
    if (!left || !right) {
      throw new Error(
        `Orientation check references unknown mesh "${!left ? check.left : check.right}"`,
      );
    }

    const sourceDelta = left.sourceCentroidMm - right.sourceCentroidMm;
    const outputDelta = centroidX(left.positions) - centroidX(right.positions);
    if (sourceDelta === 0) {
      throw new Error(
        `Orientation check ${check.left}/${check.right} has identical source X centroids`,
      );
    }
    if (outputDelta === 0) {
      throw new Error(
        `Orientation check ${check.left}/${check.right} has identical output X centroids`,
      );
    }

    const pairSourceSign = Math.sign(sourceDelta);
    const pairOutputSign = Math.sign(outputDelta);
    if (sourceSign === null) sourceSign = pairSourceSign;
    else if (sourceSign !== pairSourceSign) {
      throw new Error(
        `Orientation check ${check.left}/${check.right} disagrees with the other source pairs`,
      );
    }
    if (outputSign === null) outputSign = pairOutputSign;
    else if (outputSign !== pairOutputSign) {
      throw new Error(
        `Orientation check ${check.left}/${check.right} disagrees with the other output pairs`,
      );
    }

    sourceCentroids[check.left] = round(left.sourceCentroidMm);
    sourceCentroids[check.right] = round(right.sourceCentroidMm);
    outputCentroids[check.left] = round(centroidX(left.positions));
    outputCentroids[check.right] = round(centroidX(right.positions));
  }

  if (sourceSign !== outputSign) {
    throw new Error(
      "Left/right orientation changed between the source frame and the output GLB",
    );
  }

  return {
    sourceFrame: {
      units: "millimetres",
      upAxis: "Z",
      patientLeftAxis: sourceSign > 0 ? "+X" : "-X",
      centroidX: sourceCentroids,
    },
    outputFrame: {
      units: "metres",
      upAxis: "Y",
      patientLeftAxis: outputSign > 0 ? "+X" : "-X",
      centroidX: outputCentroids,
    },
    checks: checks.map((check) => ({
      left: check.left,
      right: check.right,
    })),
    viewer: viewerOrientation,
  };
}

function hexToRgba(hex) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`Invalid structure colour: ${hex}`);
  }
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
    1,
  ];
}

function align4(value) {
  return (value + 3) & ~3;
}

function buildGlb(structures, metadata, copyright) {
  const bufferParts = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = [];

  let byteOffset = 0;

  function addBufferView(buffer, target) {
    const offset = align4(byteOffset);
    if (offset > byteOffset) {
      bufferParts.push(Buffer.alloc(offset - byteOffset));
      byteOffset = offset;
    }
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: buffer.byteLength,
      ...(target ? { target } : {}),
    });
    bufferParts.push(buffer);
    byteOffset += buffer.byteLength;
    return bufferViews.length - 1;
  }

  for (const [index, structure] of structures.entries()) {
    const { positions, normals, indices } = structure;

    const positionBuffer = Buffer.from(
      positions.buffer,
      positions.byteOffset,
      positions.byteLength,
    );
    const normalBuffer = Buffer.from(
      normals.buffer,
      normals.byteOffset,
      normals.byteLength,
    );
    // 16-bit indices are valid up to 65,535 vertices and halve the index
    // payload for every structure that fits. Use 32-bit only when needed.
    const useShortIndices = positions.length / 3 <= 0xffff;
    const indexArray = useShortIndices ? Uint16Array.from(indices) : indices;
    const indexBuffer = Buffer.from(
      indexArray.buffer,
      indexArray.byteOffset,
      indexArray.byteLength,
    );

    const positionView = addBufferView(positionBuffer, 34962);
    const normalView = addBufferView(normalBuffer, 34962);
    const indexView = addBufferView(indexBuffer, 34963);

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxX = Math.max(maxX, positions[i]);
      maxY = Math.max(maxY, positions[i + 1]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }

    const positionAccessor =
      accessors.push({
        bufferView: positionView,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [round(minX), round(minY), round(minZ)],
        max: [round(maxX), round(maxY), round(maxZ)],
      }) - 1;
    const normalAccessor =
      accessors.push({
        bufferView: normalView,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3",
      }) - 1;
    const indexAccessor =
      accessors.push({
        bufferView: indexView,
        componentType: useShortIndices ? 5123 : 5125,
        count: indices.length,
        type: "SCALAR",
      }) - 1;

    materials.push({
      name: `mat_${structure.meshName}`,
      pbrMetallicRoughness: {
        baseColorFactor: hexToRgba(structure.color),
        metallicFactor: 0,
        roughnessFactor: 0.62,
      },
      doubleSided: true,
    });

    meshes.push({
      name: structure.meshName,
      primitives: [
        {
          attributes: {
            POSITION: positionAccessor,
            NORMAL: normalAccessor,
          },
          indices: indexAccessor,
          material: index,
        },
      ],
    });

    nodes.push({
      name: structure.meshName,
      mesh: index,
      extras: {
        slug: structure.slug,
        layer: structure.layer,
        fma: structure.fma,
        sourceFiles: structure.files.map((file) => file.id),
        ...(structure.laterality ? { laterality: structure.laterality } : {}),
        ...(structure.sharedWith?.length
          ? { sharedWith: structure.sharedWith }
          : {}),
        ...(structure.canonicalOwner
          ? { canonicalOwner: structure.canonicalOwner }
          : {}),
      },
    });
  }

  const bin = Buffer.concat(bufferParts);
  const json = {
    asset: {
      version: "2.0",
      generator: "LOR Mentor Anatomy Lab model pipeline",
      copyright,
      extras: metadata,
    },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };

  let jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = (4 - (jsonBuffer.byteLength % 4)) % 4;
  if (jsonPadding) {
    jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
  }

  let binBuffer = bin;
  const binPadding = (4 - (binBuffer.byteLength % 4)) % 4;
  if (binPadding) {
    binBuffer = Buffer.concat([binBuffer, Buffer.alloc(binPadding)]);
  }

  const totalLength = 12 + 8 + jsonBuffer.byteLength + 8 + binBuffer.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.byteLength, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binBuffer]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.sourceDirs.length === 0) {
    console.error(
      "A BodyParts3D source directory is required. The source archive is not committed.\n\n" +
        usage(),
    );
    process.exitCode = 1;
    return;
  }

  const configPath = sourceMapPath(args.system);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (config.system !== args.system) {
    throw new Error(
      `Source map ${basename(configPath)} declares system "${config.system}", not "${args.system}"`,
    );
  }

  const sourceIndexes = buildSourceIndexes(args.sourceDirs);
  const sources = Array.isArray(config.sources)
    ? config.sources
    : config.source
      ? [config.source]
      : [];
  if (sources.length === 0) {
    throw new Error("The source map must define source or sources metadata");
  }
  const sourceTrees = new Set(
    sources.map((source) => source.tree?.toUpperCase()).filter(Boolean),
  );
  const sourceFileHashes = new Map();
  const usedFiles = new Set();
  const structures = [];

  for (const structure of config.structures) {
    if (!structure.meshName || !structure.slug) {
      throw new Error("Each structure needs a slug and meshName");
    }
    if (usedFiles.has(structure.meshName)) {
      throw new Error(`Duplicate meshName: ${structure.meshName}`);
    }

    const mergedPositions = [];
    const mergedIndices = [];
    const fileManifest = [];
    const fma = new Set();
    let sourceXSum = 0;
    let sourceVertexCount = 0;

    for (const file of structure.files) {
      if (usedFiles.has(file.id)) {
        throw new Error(
          `Source file ${file.id} is assigned to more than one structure`,
        );
      }
      usedFiles.add(file.id);

      const archive = file.archive?.toUpperCase() ?? null;
      if (archive && sourceTrees.size > 0 && !sourceTrees.has(archive)) {
        throw new Error(
          `${file.id}: source archive ${archive} is not declared in the source map`,
        );
      }

      const objPath = resolveSourceFile(file, sourceIndexes);
      const text = readFileSync(objPath, "utf8");
      const concept = readHeader(text, "Concept ID");
      const name = readHeader(text, "English name");
      if (concept !== file.concept) {
        throw new Error(
          `${file.id}: expected concept ${file.concept}, found ${concept ?? "none"}`,
        );
      }
      if (!name || normalizeName(name) !== normalizeName(file.name)) {
        throw new Error(
          `${file.id}: expected name "${file.name}", found "${name ?? "none"}"`,
        );
      }

      const parsed = parseObj(text, file.id);
      const vertexOffset = mergedPositions.length / 3;
      for (let i = 0; i < parsed.vertices.length; i += 3) {
        sourceXSum += parsed.vertices[i];
        sourceVertexCount += 1;
        const [x, y, z] = transformPoint(
          parsed.vertices[i],
          parsed.vertices[i + 1],
          parsed.vertices[i + 2],
        );
        mergedPositions.push(x, y, z);
      }
      for (const index of parsed.faces) {
        mergedIndices.push(index + vertexOffset);
      }

      fma.add(file.concept);
      const hash = createHash("sha256").update(text).digest("hex");
      if (file.sha256 && hash !== file.sha256.toLowerCase()) {
        throw new Error(
          `${file.id}: source SHA-256 does not match the source map (expected ${file.sha256}, found ${hash})`,
        );
      }
      sourceFileHashes.set(file.id, hash);
      fileManifest.push({
        id: file.id,
        ...(archive ? { archive } : {}),
        concept: file.concept,
        name: file.name,
        sha256: hash,
        triangles: parsed.faces.length / 3,
      });
    }

    const positions = new Float32Array(mergedPositions);
    const indices = new Uint32Array(mergedIndices);

    // Centre the combined model after all source parts have been merged. This
    // keeps the camera framing stable regardless of the BodyParts3D origin.
    structures.push({
      ...structure,
      positions,
      indices,
      files: fileManifest,
      fma: [...fma],
      sourceCentroidMm: sourceXSum / sourceVertexCount,
      triangleCount: indices.length / 3,
    });

    fileManifest.forEach((file) => {
      if (!sourceFileHashes.has(file.id)) {
        throw new Error(`Missing source hash for ${file.id}`);
      }
    });
  }

  const allPositions = structures.flatMap((structure) =>
    Array.from(structure.positions),
  );
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < allPositions.length; i += 3) {
    minX = Math.min(minX, allPositions[i]);
    minY = Math.min(minY, allPositions[i + 1]);
    minZ = Math.min(minZ, allPositions[i + 2]);
    maxX = Math.max(maxX, allPositions[i]);
    maxY = Math.max(maxY, allPositions[i + 1]);
    maxZ = Math.max(maxZ, allPositions[i + 2]);
  }
  const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];

  for (const structure of structures) {
    for (let i = 0; i < structure.positions.length; i += 3) {
      structure.positions[i] -= center[0];
      structure.positions[i + 1] -= center[1];
      structure.positions[i + 2] -= center[2];
    }
    structure.normals = computeNormals(structure.positions, structure.indices);
  }

  const totalTriangles = structures.reduce(
    (sum, structure) => sum + structure.triangleCount,
    0,
  );

  const orientationReport = buildOrientationReport(
    structures,
    config.orientationChecks,
    config.viewerOrientation,
  );

  const primarySource = sources[0];
  const isV2 = Array.isArray(config.sources);
  const textOnly = config.textOnly ?? [];
  const changes = config.changes ?? [];
  const adaptations = config.adaptations ?? [];
  const license = {
    notice:
      "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
    licenseUrl: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html",
    statements: [
      {
        source:
          "BodyParts3D licence page (last updated 2025-02-27) and README_e.html",
        statement:
          "The license for this database is specified in the Creative Commons Attribution 4.0 International.",
      },
      {
        source:
          "Header comment in all 3,492 distributed BodyParts3D 4.0 OBJ files",
        statement:
          "The license for this database is specified in the Creative Commons Attribution-Share Alike 2.1 Japan.",
      },
    ],
    status:
      "Which licence applies is being clarified with the Database Center for Life Science (DBCLS).",
    adaptedModelTerms:
      "The adapted model file is offered under the same terms as the stricter statement, CC BY-SA 2.1 Japan.",
  };
  const copyright =
    "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. A second licence statement (CC BY-SA 2.1 Japan) exists; see extras.license.";

  // heart.v2's published transform object predates the centring fields. Keep
  // that shape unchanged so a heart rebuild stays byte-identical; systems that
  // opt in record the scale and offset used to produce the GLB.
  const manifestTransform =
    config.recordTransformDetails === true
      ? {
          ...config.transform,
          scale: 0.001,
          sourceCentreMm: [
            round(center[0] * 1000),
            round(-center[2] * 1000),
            round(center[1] * 1000),
          ],
          offsetMetres: [round(center[0]), round(center[1]), round(center[2])],
          offsetConvention: "bodyPosition = modelPosition + offsetMetres",
        }
      : config.transform;

  const metadata = {
    title: config.title ?? `LOR Mentor ${config.system} anatomy model`,
    dataset: primarySource.dataset ?? "BodyParts3D 4.0",
    ...(isV2 ? { sources } : { source: primarySource }),
    transform: manifestTransform,
    license,
    ...(adaptations.length > 0 ? { adaptations } : {}),
  };

  const glb = buildGlb(structures, metadata, copyright);
  const fallbackOutput = defaultOutput(args.system);
  const configuredOutput = config.output ?? {};
  const modelPath = args.out
    ? resolve(args.out)
    : join(
        modelDir,
        outputFileName(
          configuredOutput.model,
          fallbackOutput.model,
          "output.model",
        ),
      );
  const manifestPath = args.manifest
    ? resolve(args.manifest)
    : join(
        modelDir,
        outputFileName(
          configuredOutput.manifest,
          fallbackOutput.manifest,
          "output.manifest",
        ),
      );

  const sharedStructures = structures
    .filter((structure) => structure.sharedWith?.length)
    .map((structure) => ({
      slug: structure.slug,
      meshName: structure.meshName,
      sharedWith: structure.sharedWith,
      canonicalOwner: structure.canonicalOwner,
      files: structure.files.map((file) => file.id),
    }));

  const manifest = {
    schemaVersion: isV2 ? 2 : 1,
    system: config.system,
    model: {
      file: basename(modelPath),
      bytes: glb.byteLength,
      sha256: createHash("sha256").update(glb).digest("hex"),
      triangles: totalTriangles,
      structures: structures.length,
      ...(isV2
        ? {
            textOnlyStructures: textOnly.length,
            totalStructures: structures.length + textOnly.length,
          }
        : {}),
    },
    ...(isV2 ? { sources } : { source: primarySource }),
    transform: manifestTransform,
    ...(isV2 ? { changes } : {}),
    ...(adaptations.length > 0 ? { adaptations } : {}),
    ...(sharedStructures.length > 0 ? { sharedStructures } : {}),
    ...(orientationReport ? { orientation: orientationReport } : {}),
    license,
    structures: structures.map((structure) => ({
      slug: structure.slug,
      meshName: structure.meshName,
      layer: structure.layer,
      color: structure.color,
      triangles: structure.triangleCount,
      fma: structure.fma,
      ...(structure.laterality ? { laterality: structure.laterality } : {}),
      ...(structure.sharedWith?.length
        ? { sharedWith: structure.sharedWith }
        : {}),
      ...(structure.canonicalOwner
        ? { canonicalOwner: structure.canonicalOwner }
        : {}),
      files: structure.files,
    })),
    ...(isV2 ? { textOnly } : {}),
    checks: {
      uniqueMeshNames: true,
      uniqueSourceFiles: true,
      sourceHeadersVerified: true,
      ...(isV2 ? { sourceHashesVerified: true } : {}),
      ...(orientationReport ? { orientationVerified: true } : {}),
      unrepresentedStructures:
        "deferred; see docs/anatomy/provenance/README.md",
    },
  };

  writeFileSync(modelPath, glb);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${modelPath}`);
  console.log(
    `  ${structures.length} mesh structures${textOnly.length > 0 ? ` + ${textOnly.length} text-only` : ""}, ${totalTriangles.toLocaleString()} triangles, ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log(`Wrote ${manifestPath}`);
  console.log(`  model sha256 ${manifest.model.sha256}`);
}

main();
