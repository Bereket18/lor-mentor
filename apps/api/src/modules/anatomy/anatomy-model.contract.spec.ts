import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HEART_STRUCTURES,
  HEART_SYSTEM,
  validateHeartSeed,
} from '../../../prisma/anatomy-heart.data';
import {
  HEART_V2_MESH_STRUCTURES,
  HEART_V2_TARGET_STRUCTURES,
  HEART_V2_TEXT_ONLY_STRUCTURES,
} from './anatomy-heart.v2.fixture';

/**
 * Seed-to-model contract.
 *
 * The API seed and the shipped GLB are edited in different places, so this
 * test fails loudly when they drift: a renamed mesh, a removed structure, a
 * stale model URL, or a manifest that no longer matches the binary.
 *
 * Phase 2 ships heart.v2.glb alongside the live v1 asset. The live contract
 * below still checks v1 and the current 14-row seed. The v2 target contract
 * checks the approved 26-row mapping and the candidate asset without requiring
 * the schema or seed changes to be applied yet.
 */

const ASSET_DIR = join(__dirname, '../../../../web/public/models/anatomy');
const MANIFEST_PATH = join(ASSET_DIR, 'manifest.json');
const GLB_PATH = join(ASSET_DIR, 'heart.v1.glb');
const V2_MANIFEST_PATH = join(ASSET_DIR, 'heart.v2.manifest.json');
const V2_GLB_PATH = join(ASSET_DIR, 'heart.v2.glb');

interface GlbJson {
  nodes: { name: string; mesh: number; extras?: { layer?: string } }[];
  meshes: { name: string; primitives: { indices?: number }[] }[];
  accessors: { count: number }[];
}

interface V2Manifest {
  schemaVersion: number;
  system: string;
  model: {
    file: string;
    bytes: number;
    sha256: string;
    triangles: number;
    structures: number;
    textOnlyStructures: number;
    totalStructures: number;
  };
  sources: {
    tree: string;
    archive: string;
    archiveBytes: number;
    archiveSha256: string;
    requiredCredit: string;
    licenseUrl: string;
    license: string;
  }[];
  license: { notice: string; licenseUrl: string; status: string };
  structures: {
    slug: string;
    meshName: string;
    layer: string;
    triangles: number;
    fma: string[];
    files: {
      id: string;
      archive: string;
      concept: string;
      name: string;
      sha256: string;
    }[];
  }[];
  textOnly: {
    slug: string;
    layer: string;
    legacyMeshName?: string;
    reason: string;
  }[];
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

describe('Anatomy v2 target contract (candidate, not yet live)', () => {
  const manifest = JSON.parse(
    readFileSync(V2_MANIFEST_PATH, 'utf8'),
  ) as V2Manifest;
  const glb = readGlbJson(V2_GLB_PATH);
  const glbBytes = readFileSync(V2_GLB_PATH);

  it('maps all 26 approved structures into 17 mesh and 9 text-only rows', () => {
    expect(HEART_V2_TARGET_STRUCTURES).toHaveLength(26);
    expect(HEART_V2_MESH_STRUCTURES).toHaveLength(17);
    expect(HEART_V2_TEXT_ONLY_STRUCTURES).toHaveLength(9);
    expect(
      new Set(HEART_V2_TARGET_STRUCTURES.map((structure) => structure.slug))
        .size,
    ).toBe(26);
    expect(
      new Set(HEART_V2_MESH_STRUCTURES.map((structure) => structure.meshName))
        .size,
    ).toBe(17);
  });

  it('ships the v2 candidate without switching the live v1 asset', () => {
    expect(HEART_SYSTEM.modelUrl).toBe('/models/anatomy/heart.v1.glb');
    expect(manifest.model.file).toBe('heart.v2.glb');
    expect(existsSync(V2_GLB_PATH)).toBe(true);
    expect(manifest.model.bytes).toBe(glbBytes.byteLength);
    expect(manifest.model.sha256).toBe(
      createHash('sha256').update(glbBytes).digest('hex'),
    );
  });

  it('has exactly one node for each of the 17 mesh structures', () => {
    const targetNames = HEART_V2_MESH_STRUCTURES.map(
      (structure) => structure.meshName,
    );
    const nodeNames = glb.nodes.map((node) => node.name);

    expect(nodeNames).toHaveLength(17);
    expect([...nodeNames].sort()).toEqual([...targetNames].sort());
  });

  it('does not create nodes for the 9 text-only structures', () => {
    const nodeNames = glb.nodes.map((node) => node.name);

    for (const structure of HEART_V2_TEXT_ONLY_STRUCTURES) {
      expect(nodeNames).not.toContain(structure.legacyMeshName);
      expect(nodeNames).not.toContain(structure.slug.replace(/-/g, '_'));
    }

    expect(manifest.textOnly).toHaveLength(9);
    expect(manifest.model.textOnlyStructures).toBe(9);
    expect(manifest.model.totalStructures).toBe(26);
  });

  it('keeps manifest rows aligned with the 17 mesh nodes', () => {
    expect(manifest.structures).toHaveLength(17);

    const manifestBySlug = new Map(
      manifest.structures.map((structure) => [structure.slug, structure]),
    );

    for (const target of HEART_V2_MESH_STRUCTURES) {
      const entry = manifestBySlug.get(target.slug);
      expect(entry).toBeDefined();
      expect(entry?.meshName).toBe(target.meshName);
      expect(entry?.layer).toBe(target.layer);
      expect(entry?.triangles).toBeGreaterThan(0);
      expect(entry?.fma.length).toBeGreaterThan(0);
      expect(entry?.files.length).toBeGreaterThan(0);

      const node = glb.nodes.find((item) => item.name === target.meshName);
      expect(node?.extras?.layer).toBe(target.layer);
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
    expect(manifest.model.triangles).toBe(102_568);
    expect(manifest.model.triangles).toBeLessThanOrEqual(150_000);
    expect(manifest.model.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('records both archives, per-file provenance, and the licence caveat', () => {
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.sources).toHaveLength(2);
    expect(manifest.sources.map((source) => source.tree).sort()).toEqual([
      'IS-A',
      'PART-OF',
    ]);

    const sourceTrees = new Set(
      manifest.sources.map((source) => source.tree),
    );
    for (const source of manifest.sources) {
      expect(source.requiredCredit).toContain('BodyParts3D');
      expect(source.license).toContain('CC BY 4.0');
      expect(source.license).toContain('CC BY-SA 2.1 Japan');
      expect(source.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    }

    for (const structure of manifest.structures) {
      for (const file of structure.files) {
        expect(sourceTrees.has(file.archive)).toBe(true);
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }

    expect(manifest.license.notice).toContain('BodyParts3D');
    expect(manifest.license.licenseUrl).toContain('bodyparts3d');
    expect(manifest.license.status).toMatch(/pending|development/i);
  });

  it('keeps the live seed a subset until the seed change is approved', () => {
    const liveBySlug = new Map(
      HEART_STRUCTURES.map((structure) => [structure.slug, structure]),
    );

    if (HEART_STRUCTURES.length === 26) {
      for (const target of HEART_V2_TARGET_STRUCTURES) {
        const seed = liveBySlug.get(target.slug);
        expect(seed).toBeDefined();
        expect(seed?.meshName).toBe(target.meshName);
        expect(seed?.layer).toBe(target.layer);
      }
      return;
    }

    expect(HEART_STRUCTURES).toHaveLength(14);
    const targetNames = new Set(
      HEART_V2_MESH_STRUCTURES.map((structure) => structure.meshName),
    );
    for (const structure of HEART_STRUCTURES) {
      expect(targetNames.has(structure.meshName)).toBe(true);
    }
  });
});
