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
 * heart.v2.glb is the live asset. heart.v1.glb stays in the repository as the
 * rollback asset and must not be edited. The live manifest is kept identical
 * to the v2 provenance manifest.
 */

const ASSET_DIR = join(__dirname, '../../../../web/public/models/anatomy');
const MANIFEST_PATH = join(ASSET_DIR, 'manifest.json');
const V2_MANIFEST_PATH = join(ASSET_DIR, 'heart.v2.manifest.json');
const V2_GLB_PATH = join(ASSET_DIR, 'heart.v2.glb');
const V1_GLB_PATH = join(ASSET_DIR, 'heart.v1.glb');

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
  changes: string[];
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

describe('Anatomy live seed-to-model contract (v2)', () => {
  const manifest = JSON.parse(
    readFileSync(MANIFEST_PATH, 'utf8'),
  ) as V2Manifest;
  const glb = readGlbJson(V2_GLB_PATH);
  const glbBytes = readFileSync(V2_GLB_PATH);

  it('ships the v2 model file referenced by the seed system', () => {
    expect(HEART_SYSTEM.modelUrl).toBe(
      `/models/anatomy/${manifest.model.file}`,
    );
    expect(manifest.model.file).toBe('heart.v2.glb');
    expect(existsSync(V2_GLB_PATH)).toBe(true);
  });

  it('keeps the live manifest and the served GLB in sync', () => {
    expect(manifest.model.bytes).toBe(glbBytes.byteLength);
    expect(manifest.model.sha256).toBe(
      createHash('sha256').update(glbBytes).digest('hex'),
    );
    expect(manifest.model.triangles).toBe(102_568);
  });

  it('keeps the live manifest identical to the v2 provenance manifest', () => {
    const provenance = JSON.parse(
      readFileSync(V2_MANIFEST_PATH, 'utf8'),
    ) as V2Manifest;

    expect(manifest).toEqual(provenance);
  });

  it('has a valid, fully referenced seed', () => {
    expect(() => validateHeartSeed()).not.toThrow();
    expect(HEART_STRUCTURES).toHaveLength(26);

    const meshStructures = HEART_STRUCTURES.filter(
      (structure) => structure.meshName !== null,
    );
    const textOnlyStructures = HEART_STRUCTURES.filter(
      (structure) => structure.meshName === null,
    );
    expect(meshStructures).toHaveLength(17);
    expect(textOnlyStructures).toHaveLength(9);

    for (const structure of HEART_STRUCTURES) {
      expect(structure.references.length).toBeGreaterThan(0);
      if (structure.meshName !== null) {
        expect(structure.meshName).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

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
    expect(manifest.system).toBe(HEART_SYSTEM.slug);
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
    expect(manifest.model.triangles).toBeLessThanOrEqual(150_000);
    expect(manifest.model.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('records both archives, per-file provenance, the v2 changes, and the licence caveat', () => {
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.sources).toHaveLength(2);
    expect(manifest.sources.map((source) => source.tree).sort()).toEqual([
      'IS-A',
      'PART-OF',
    ]);

    const sourceTrees = new Set(manifest.sources.map((source) => source.tree));
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

    expect(manifest.changes).toHaveLength(7);
    expect(manifest.changes.join(' ')).toMatch(/52 source OBJ files/);
    expect(manifest.changes.join(' ')).toMatch(/17 selectable nodes/);
    expect(manifest.changes.join(' ')).toMatch(/9 structures as text-only/);
    expect(manifest.changes.join(' ')).toMatch(/aortic_arch/);
    expect(manifest.changes.join(' ')).toMatch(/pulmonary_arteries/);
    expect(manifest.changes.join(' ')).toMatch(/pulmonary_veins/);

    expect(manifest.license.notice).toContain('BodyParts3D');
    expect(manifest.license.licenseUrl).toContain('bodyparts3d');
    expect(manifest.license.status).toMatch(/clarif|pending|development/i);
  });

  it('keeps the live seed aligned with the v2 target mapping', () => {
    const liveBySlug = new Map(
      HEART_STRUCTURES.map((structure) => [structure.slug, structure]),
    );

    expect(HEART_STRUCTURES).toHaveLength(HEART_V2_TARGET_STRUCTURES.length);
    expect(HEART_STRUCTURES.map((structure) => structure.slug)).toEqual(
      HEART_V2_TARGET_STRUCTURES.map((structure) => structure.slug),
    );
    for (const target of HEART_V2_TARGET_STRUCTURES) {
      const seed = liveBySlug.get(target.slug);
      expect(seed).toBeDefined();
      expect(seed?.meshName).toBe(target.meshName);
      expect(seed?.layer).toBe(target.layer);
    }
  });

  it('keeps the v1 rollback asset intact and out of the live manifest', () => {
    expect(existsSync(V1_GLB_PATH)).toBe(true);

    const v1Bytes = readFileSync(V1_GLB_PATH);
    const v1 = readGlbJson(V1_GLB_PATH);
    const v1Names = new Set(v1.nodes.map((node) => node.name));

    expect(v1.nodes).toHaveLength(14);
    expect(createHash('sha256').update(v1Bytes).digest('hex')).toBe(
      'e7723082d617b7d9198210200c7c4e82a052e699cec5cdc2faf6c652fc6f0db0',
    );
    for (const name of [
      'aortic_arch',
      'pulmonary_arteries',
      'pulmonary_veins',
    ]) {
      expect(v1Names.has(name)).toBe(false);
    }
    expect(manifest.model.file).not.toBe('heart.v1.glb');
  });
});
