import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HEART_STRUCTURES,
  HEART_SYSTEM,
  validateHeartSeed,
} from '../../../prisma/anatomy-heart.data';

/**
 * Seed-to-model contract.
 *
 * The API seed and the shipped GLB are edited in different places, so this
 * test fails loudly when they drift: a renamed mesh, a removed structure, a
 * stale model URL, or a manifest that no longer matches the binary.
 */

const ASSET_DIR = join(__dirname, '../../../../web/public/models/anatomy');
const MANIFEST_PATH = join(ASSET_DIR, 'manifest.json');
const GLB_PATH = join(ASSET_DIR, 'heart.v1.glb');

interface GlbJson {
  nodes: { name: string; mesh: number; extras?: { layer?: string } }[];
  meshes: { name: string; primitives: { indices?: number }[] }[];
  accessors: { count: number }[];
}

function readGlbJson(path: string): GlbJson {
  const buffer = readFileSync(path);
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.byteLength);
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8'),
  ) as GlbJson;
}

describe('Anatomy seed-to-model contract', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    schemaVersion: number;
    system: string;
    model: { file: string; bytes: number; sha256: string; triangles: number; structures: number };
    source: { archive: string; archiveBytes: number; requiredCredit: string; licenseUrl: string };
    license: { status: string };
    structures: {
      slug: string;
      meshName: string;
      layer: string;
      triangles: number;
      fma: string[];
      files: { id: string; concept: string; name: string; sha256: string }[];
    }[];
  };
  const glb = readGlbJson(GLB_PATH);
  const glbBytes = readFileSync(GLB_PATH);

  it('ships the model file referenced by the seed system', () => {
    expect(HEART_SYSTEM.modelUrl).toBe(
      `/models/anatomy/${manifest.model.file}`,
    );
    expect(manifest.model.file).toBe('heart.v1.glb');
    expect(existsSync(GLB_PATH)).toBe(true);
  });

  it('keeps the manifest and the GLB binary in sync', () => {
    expect(manifest.model.bytes).toBe(glbBytes.byteLength);
    expect(manifest.model.sha256).toBe(
      createHash('sha256').update(glbBytes).digest('hex'),
    );
  });

  it('has a valid, fully referenced seed', () => {
    expect(() => validateHeartSeed()).not.toThrow();
    expect(HEART_STRUCTURES).toHaveLength(14);
    for (const structure of HEART_STRUCTURES) {
      expect(structure.references.length).toBeGreaterThan(0);
      expect(structure.meshName).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('has exactly one GLB node per seeded structure', () => {
    const seedNames = HEART_STRUCTURES.map((structure) => structure.meshName);
    const nodeNames = glb.nodes.map((node) => node.name);

    expect(new Set(seedNames).size).toBe(seedNames.length);
    expect([...nodeNames].sort()).toEqual([...seedNames].sort());

    for (const structure of HEART_STRUCTURES) {
      expect(nodeNames.filter((name) => name === structure.meshName)).toHaveLength(1);
    }
  });

  it('keeps slugs, layers, and triangle counts aligned', () => {
    expect(manifest.system).toBe(HEART_SYSTEM.slug);
    expect(manifest.structures).toHaveLength(HEART_STRUCTURES.length);

    const manifestBySlug = new Map(
      manifest.structures.map((structure) => [structure.slug, structure]),
    );

    for (const structure of HEART_STRUCTURES) {
      const entry = manifestBySlug.get(structure.slug);
      expect(entry).toBeDefined();
      expect(entry?.meshName).toBe(structure.meshName);
      expect(entry?.layer).toBe(structure.layer);
      expect(entry?.triangles).toBeGreaterThan(0);

      const node = glb.nodes.find((item) => item.name === structure.meshName);
      expect(node?.extras?.layer).toBe(structure.layer);
    }

    const totalTriangles = glb.nodes.reduce((total, node) => {
      const mesh = glb.meshes[node.mesh];
      const meshTriangles = mesh.primitives.reduce((sum, primitive) => {
        const accessor =
          primitive.indices === undefined
            ? undefined
            : glb.accessors[primitive.indices];
        return sum + Math.floor((accessor?.count ?? 0) / 3);
      }, 0);
      return total + meshTriangles;
    }, 0);
    expect(totalTriangles).toBe(manifest.model.triangles);
  });

  it('records provenance and licence metadata', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.source.archive).toMatch(/^partof_BP3D_4\.0_obj_99\.zip$/);
    expect(manifest.source.archiveBytes).toBe(64_888_505);
    expect(manifest.source.requiredCredit).toContain('BodyParts3D');
    expect(manifest.source.licenseUrl).toContain('bodyparts3d');
    expect(manifest.license.status).toMatch(/pending|development/i);

    for (const structure of manifest.structures) {
      expect(structure.fma.length).toBeGreaterThan(0);
      expect(structure.files.length).toBeGreaterThan(0);
      for (const file of structure.files) {
        expect(file.id).toMatch(/^FJ\d+$/);
        expect(file.concept).toMatch(/^FMA\d+$/);
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });
});
