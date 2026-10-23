/**
 * Generate a committed placeholder GLB for the Anatomy Lab viewer.
 *
 * The mesh list is read from the API seed, so every node name in the generated
 * file is guaranteed to match an AnatomyStructure.meshName value. This keeps
 * the demo model and the database seed from drifting apart while the real
 * anatomy asset is being prepared.
 *
 * Run from the repo root:
 *   npm run generate:anatomy-model --workspace=apps/web
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const seedPath = resolve(repoRoot, "apps/api/prisma/seed-anatomy.ts");
const outputPath = resolve(
  scriptDir,
  "../public/models/anatomy/heart.glb",
);

const seedSource = readFileSync(seedPath, "utf8");
const meshNames = [
  ...seedSource.matchAll(/meshName:\s*['"]([^'"]+)['"]/g),
].map((match) => match[1]);

if (meshNames.length === 0) {
  throw new Error(`No meshName values found in ${seedPath}`);
}

const seen = new Set();
for (const name of meshNames) {
  if (seen.has(name)) {
    throw new Error(`Duplicate meshName in seed: ${name}`);
  }
  seen.add(name);
}

// A low-poly sphere is enough to make every structure visible and clickable
// while the production anatomy model is still being authored.
const SEGMENTS = 12;
const RINGS = 8;
const RADIUS = 0.22;
const positions = [];
const normals = [];
const indices = [];

for (let ring = 0; ring <= RINGS; ring += 1) {
  const phi = (Math.PI * ring) / RINGS;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  for (let segment = 0; segment <= SEGMENTS; segment += 1) {
    const theta = (2 * Math.PI * segment) / SEGMENTS;
    const x = Math.sin(theta) * sinPhi;
    const y = cosPhi;
    const z = Math.cos(theta) * sinPhi;

    positions.push(x * RADIUS, y * RADIUS, z * RADIUS);
    normals.push(x, y, z);
  }
}

for (let ring = 0; ring < RINGS; ring += 1) {
  for (let segment = 0; segment < SEGMENTS; segment += 1) {
    const a = ring * (SEGMENTS + 1) + segment;
    const b = a + SEGMENTS + 1;
    const c = b + 1;
    const d = a + 1;

    // Double-sided material means winding is not visible in the preview; this
    // ordering is still the conventional outward-facing one.
    indices.push(a, b, d, b, c, d);
  }
}

const positionBuffer = Buffer.from(new Float32Array(positions).buffer);
const normalBuffer = Buffer.from(new Float32Array(normals).buffer);
const indexBuffer = Buffer.from(new Uint16Array(indices).buffer);
const binaryBuffer = Buffer.concat([
  positionBuffer,
  normalBuffer,
  indexBuffer,
]);

const rowSizes = [4, 4, 4, 4, 4, 4, 2];
const spacing = 0.7;
const nodes = [
  {
    name: "heart-placeholder",
    children: meshNames.map((_, index) => index + 1),
  },
];

let meshIndex = 0;
for (const [row, rowSize] of rowSizes.entries()) {
  for (let column = 0; column < rowSize; column += 1) {
    const meshName = meshNames[meshIndex];
    if (!meshName) break;

    nodes.push({
      name: meshName,
      mesh: meshIndex,
      translation: [
        (column - (rowSize - 1) / 2) * spacing,
        (3 - row) * spacing,
        ((meshIndex % 3) - 1) * 0.18,
      ],
      extras: { meshName },
    });
    meshIndex += 1;
  }
}

if (meshIndex !== meshNames.length) {
  throw new Error(
    `Placeholder layout has room for ${meshIndex} meshes but the seed has ${meshNames.length}.`,
  );
}

const meshes = meshNames.map((name) => ({
  name,
  primitives: [
    {
      attributes: { POSITION: 0, NORMAL: 1 },
      indices: 2,
      material: 0,
    },
  ],
}));

const gltf = {
  asset: {
    version: "2.0",
    generator: "Lor Mentor anatomy placeholder generator",
  },
  scene: 0,
  scenes: [{ name: "Heart placeholder", nodes: [0] }],
  nodes,
  meshes,
  materials: [
    {
      name: "heart-tissue",
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [0.72, 0.16, 0.2, 1],
        metallicFactor: 0.05,
        roughnessFactor: 0.55,
      },
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: positions.length / 3,
      type: "VEC3",
      min: [-RADIUS, -RADIUS, -RADIUS],
      max: [RADIUS, RADIUS, RADIUS],
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: normals.length / 3,
      type: "VEC3",
    },
    {
      bufferView: 2,
      componentType: 5123,
      count: indices.length,
      type: "SCALAR",
    },
  ],
  bufferViews: [
    {
      buffer: 0,
      byteOffset: 0,
      byteLength: positionBuffer.length,
      target: 34962,
    },
    {
      buffer: 0,
      byteOffset: positionBuffer.length,
      byteLength: normalBuffer.length,
      target: 34962,
    },
    {
      buffer: 0,
      byteOffset: positionBuffer.length + normalBuffer.length,
      byteLength: indexBuffer.length,
      target: 34963,
    },
  ],
  buffers: [{ byteLength: binaryBuffer.length }],
};

const jsonBuffer = Buffer.from(JSON.stringify(gltf), "utf8");
const jsonPadded = Buffer.concat([
  jsonBuffer,
  Buffer.alloc((4 - (jsonBuffer.length % 4)) % 4, 0x20),
]);
const binaryPadded = Buffer.concat([
  binaryBuffer,
  Buffer.alloc((4 - (binaryBuffer.length % 4)) % 4, 0x00),
]);

const totalLength = 12 + 8 + jsonPadded.length + 8 + binaryPadded.length;
const glb = Buffer.alloc(totalLength);
let offset = 0;

glb.writeUInt32LE(0x46546c67, offset); // "glTF"
offset += 4;
glb.writeUInt32LE(2, offset);
offset += 4;
glb.writeUInt32LE(totalLength, offset);
offset += 4;

glb.writeUInt32LE(jsonPadded.length, offset);
offset += 4;
glb.writeUInt32LE(0x4e4f534a, offset); // "JSON"
offset += 4;
jsonPadded.copy(glb, offset);
offset += jsonPadded.length;

glb.writeUInt32LE(binaryPadded.length, offset);
offset += 4;
glb.writeUInt32LE(0x004e4942, offset); // "BIN"
offset += 4;
binaryPadded.copy(glb, offset);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, glb);

console.log(
  `Generated ${outputPath} (${glb.length} bytes, ${meshNames.length} named meshes).`,
);
console.log(`Mesh names: ${meshNames.join(", ")}`);
