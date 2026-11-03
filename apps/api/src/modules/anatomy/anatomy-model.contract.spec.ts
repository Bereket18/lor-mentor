import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HEART_STRUCTURES,
  HEART_SYSTEM,
  validateHeartSeed,
} from '../../../prisma/anatomy-heart.data';
import {
  URINARY_STRUCTURES,
  URINARY_SYSTEM,
  validateUrinarySeed,
} from '../../../prisma/anatomy-urinary.data';
import { ANATOMY_SEED_REGISTRY } from '../../../prisma/anatomy-registry';
import {
  HEART_V2_MESH_STRUCTURES,
  HEART_V2_TARGET_STRUCTURES,
  HEART_V2_TEXT_ONLY_STRUCTURES,
} from './anatomy-heart.v2.fixture';
import {
  URINARY_V1_MESH_STRUCTURES,
  URINARY_V1_TARGET_STRUCTURES,
  URINARY_V1_TEXT_ONLY_STRUCTURES,
} from './anatomy-urinary.v1.fixture';

/**
 * Seed-to-model contract.
 *
 * The API seed and the shipped GLB are edited in different places, so this
 * test fails loudly when they drift: a renamed mesh, a removed structure, a
 * stale model URL, or a manifest that no longer matches the binary.
 *
 * heart.v2.glb is the live heart asset. heart.v1.glb stays in the repository
 * as the rollback asset and must not be edited. The live manifest is kept
 * identical to the v2 provenance manifest.
 *
 * urinary.v1.glb is a draft asset and is not wired into the seed yet. Its
 * fixture records the approved 15-row mapping so this test catches drift
 * between the fixture, the GLB, and the provenance manifest before promotion.
 */

const ASSET_DIR = join(__dirname, '../../../../web/public/models/anatomy');
const MANIFEST_PATH = join(ASSET_DIR, 'manifest.json');
const V2_MANIFEST_PATH = join(ASSET_DIR, 'heart.v2.manifest.json');
const V2_GLB_PATH = join(ASSET_DIR, 'heart.v2.glb');
const V1_GLB_PATH = join(ASSET_DIR, 'heart.v1.glb');
const URINARY_MANIFEST_PATH = join(ASSET_DIR, 'urinary.v1.manifest.json');
const URINARY_GLB_PATH = join(ASSET_DIR, 'urinary.v1.glb');

interface GlbJson {
  asset?: {
    version?: string;
    copyright?: string;
    extras?: { license?: unknown; adaptations?: string[] };
  };
  nodes: {
    name: string;
    mesh: number;
    extras?: {
      layer?: string;
      sharedWith?: string[];
      canonicalOwner?: string;
    };
  }[];
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

interface UrinaryManifest {
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
  transform: {
    scale: number;
    sourceCentreMm: number[];
    offsetMetres: number[];
    offsetConvention: string;
  };
  changes: string[];
  adaptations: string[];
  sharedStructures: {
    slug: string;
    meshName: string;
    sharedWith: string[];
    canonicalOwner: string;
    files: string[];
  }[];
  orientation: {
    sourceFrame: {
      units: string;
      upAxis: string;
      patientLeftAxis: string;
      centroidX: Record<string, number>;
    };
    outputFrame: {
      units: string;
      upAxis: string;
      patientLeftAxis: string;
      centroidX: Record<string, number>;
    };
    checks: { left: string; right: string }[];
    viewer: string;
  };
  license: {
    notice: string;
    licenseUrl: string;
    status: string;
    adaptedModelTerms: string;
  };
  structures: {
    slug: string;
    meshName: string;
    layer: string;
    triangles: number;
    fma: string[];
    laterality?: string;
    sharedWith?: string[];
    canonicalOwner?: string;
    files: {
      id: string;
      archive: string;
      concept: string;
      name: string;
      sha256: string;
      triangles?: number;
    }[];
  }[];
  textOnly: {
    slug: string;
    layer: string;
    laterality?: string;
    reason: string;
  }[];
  checks: {
    uniqueMeshNames: boolean;
    uniqueSourceFiles: boolean;
    sourceHeadersVerified: boolean;
    sourceHashesVerified: boolean;
    orientationVerified: boolean;
  };
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

describe('Urinary draft seed-to-model contract (v1)', () => {
  const manifest = JSON.parse(
    readFileSync(URINARY_MANIFEST_PATH, 'utf8'),
  ) as UrinaryManifest;
  const glb = readGlbJson(URINARY_GLB_PATH);
  const glbBytes = readFileSync(URINARY_GLB_PATH);

  it('ships the urinary model file referenced by the seed system', () => {
    expect(URINARY_SYSTEM.modelUrl).toBe(
      `/models/anatomy/${manifest.model.file}`,
    );
    expect(manifest.model.file).toBe('urinary.v1.glb');
    expect(existsSync(URINARY_GLB_PATH)).toBe(true);
  });

  it('keeps the urinary manifest and GLB in sync', () => {
    expect(manifest.model.bytes).toBe(glbBytes.byteLength);
    expect(manifest.model.sha256).toBe(
      createHash('sha256').update(glbBytes).digest('hex'),
    );
    expect(manifest.model.triangles).toBe(20_364);
    expect(manifest.model.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('has a valid, fully referenced urinary seed', () => {
    expect(() => validateUrinarySeed()).not.toThrow();
    expect(URINARY_SYSTEM.isPublished).toBe(false);
    expect(URINARY_SYSTEM.isSample).toBe(false);
    expect(URINARY_STRUCTURES).toHaveLength(15);

    const meshStructures = URINARY_STRUCTURES.filter(
      (structure) => structure.meshName !== null,
    );
    const textOnlyStructures = URINARY_STRUCTURES.filter(
      (structure) => structure.meshName === null,
    );
    expect(meshStructures).toHaveLength(10);
    expect(textOnlyStructures).toHaveLength(5);

    for (const structure of URINARY_STRUCTURES) {
      expect(structure.references.length).toBeGreaterThan(0);
      if (structure.meshName !== null) {
        expect(structure.meshName).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it('maps all 15 approved structures into 10 mesh and 5 text-only rows', () => {
    expect(URINARY_V1_TARGET_STRUCTURES).toHaveLength(15);
    expect(URINARY_V1_MESH_STRUCTURES).toHaveLength(10);
    expect(URINARY_V1_TEXT_ONLY_STRUCTURES).toHaveLength(5);
    expect(
      new Set(URINARY_V1_TARGET_STRUCTURES.map((structure) => structure.slug))
        .size,
    ).toBe(15);
    expect(
      new Set(URINARY_V1_MESH_STRUCTURES.map((structure) => structure.meshName))
        .size,
    ).toBe(10);
    expect(
      URINARY_V1_TEXT_ONLY_STRUCTURES.every((structure) =>
        Boolean(structure.textOnlyReason),
      ),
    ).toBe(true);
  });

  it('has exactly one node for each of the 10 mesh structures', () => {
    const targetNames = URINARY_V1_MESH_STRUCTURES.map(
      (structure) => structure.meshName,
    );
    const nodeNames = glb.nodes.map((node) => node.name);

    expect(nodeNames).toHaveLength(10);
    expect([...nodeNames].sort()).toEqual([...targetNames].sort());
  });

  it('does not create nodes for the 5 text-only structures', () => {
    const nodeNames = glb.nodes.map((node) => node.name);

    for (const structure of URINARY_V1_TEXT_ONLY_STRUCTURES) {
      expect(nodeNames).not.toContain(structure.slug);
      expect(nodeNames).not.toContain(structure.slug.replace(/-/g, '_'));
    }

    expect(manifest.textOnly.map((item) => item.slug)).toEqual(
      URINARY_V1_TEXT_ONLY_STRUCTURES.map((structure) => structure.slug),
    );
    expect(manifest.textOnly).toHaveLength(5);
    expect(manifest.model.textOnlyStructures).toBe(5);
    expect(manifest.model.totalStructures).toBe(15);
  });

  it('keeps urinary manifest rows aligned with the 10 mesh nodes', () => {
    expect(manifest.system).toBe(URINARY_SYSTEM.slug);
    expect(manifest.structures).toHaveLength(10);

    const manifestBySlug = new Map(
      manifest.structures.map((structure) => [structure.slug, structure]),
    );

    for (const target of URINARY_V1_MESH_STRUCTURES) {
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
  });

  it('records both archives, all 12 source files, changes, adaptations, and the licence caveat', () => {
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

    const files = manifest.structures.flatMap((structure) => structure.files);
    expect(files).toHaveLength(12);
    expect(new Set(files.map((file) => file.id)).size).toBe(12);
    for (const file of files) {
      expect(file.id).toMatch(/^FJ\d+$/);
      expect(sourceTrees.has(file.archive)).toBe(true);
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    }

    expect(manifest.changes).toHaveLength(6);
    const changes = manifest.changes.join(' ');
    expect(changes).toMatch(/12 source OBJ files/);
    expect(changes).toMatch(/10 selectable nodes/);
    expect(changes).toMatch(/5 structures as text-only/);
    expect(changes).toMatch(/renal vessels/);

    expect(manifest.adaptations.length).toBeGreaterThan(0);
    expect(manifest.adaptations.join(' ')).toMatch(
      /sharedWith: cardiovascular/,
    );

    expect(manifest.license.notice).toContain('BodyParts3D');
    expect(manifest.license.licenseUrl).toContain('bodyparts3d');
    expect(manifest.license.status).toMatch(/clarif|pending|development/i);
  });

  it('marks the four renal vessels as shared cardiovascular context', () => {
    const expectedSharedFiles = new Map([
      ['right-renal-artery', ['FJ2038']],
      ['left-renal-artery', ['FJ2046']],
      ['right-renal-vein', ['FJ3577', 'FJ3578']],
      ['left-renal-vein', ['FJ3477', 'FJ3478']],
    ]);

    expect(manifest.sharedStructures).toHaveLength(expectedSharedFiles.size);

    for (const [slug, fileIds] of expectedSharedFiles) {
      const shared = manifest.sharedStructures.find(
        (structure) => structure.slug === slug,
      );
      expect(shared).toBeDefined();
      expect(shared?.sharedWith).toContain('cardiovascular');
      expect(shared?.canonicalOwner).toBe('cardiovascular');
      expect(shared?.files).toEqual(fileIds);

      const structure = manifest.structures.find((item) => item.slug === slug);
      expect(structure).toBeDefined();
      expect(structure?.sharedWith).toContain('cardiovascular');
      expect(structure?.canonicalOwner).toBe('cardiovascular');

      const node = glb.nodes.find((item) => item.name === structure?.meshName);
      expect(node?.extras?.sharedWith).toContain('cardiovascular');
      expect(node?.extras?.canonicalOwner).toBe('cardiovascular');
    }
  });

  it('records the transform and verifies left/right orientation in both frames', () => {
    expect(manifest.transform.scale).toBe(0.001);
    expect(manifest.transform.offsetMetres).toHaveLength(3);
    expect(manifest.transform.offsetMetres.every(Number.isFinite)).toBe(true);
    expect(manifest.transform.offsetConvention).toBe(
      'bodyPosition = modelPosition + offsetMetres',
    );

    const pairs = [
      ['left_kidney', 'right_kidney'],
      ['left_ureter', 'right_ureter'],
      ['left_renal_artery', 'right_renal_artery'],
      ['left_renal_vein', 'right_renal_vein'],
    ] as const;

    expect(manifest.orientation.sourceFrame.patientLeftAxis).toBe('+X');
    expect(manifest.orientation.outputFrame.patientLeftAxis).toBe('+X');
    expect(manifest.orientation.checks).toHaveLength(pairs.length);
    expect(manifest.checks.orientationVerified).toBe(true);

    for (const [left, right] of pairs) {
      expect(manifest.orientation.checks).toContainEqual({ left, right });

      const sourceLeft = manifest.orientation.sourceFrame.centroidX[left];
      const sourceRight = manifest.orientation.sourceFrame.centroidX[right];
      expect(sourceLeft).toBeGreaterThan(sourceRight);

      const outputLeft = manifest.orientation.outputFrame.centroidX[left];
      const outputRight = manifest.orientation.outputFrame.centroidX[right];
      expect(outputLeft).toBeGreaterThan(outputRight);
    }
  });

  it('uses the same licence wording as heart.v2 and no release-status strings', () => {
    const heartManifest = JSON.parse(
      readFileSync(V2_MANIFEST_PATH, 'utf8'),
    ) as V2Manifest;
    const heartGlb = readGlbJson(V2_GLB_PATH);

    expect(manifest.license).toEqual(heartManifest.license);
    expect(glb.asset?.copyright).toBe(heartGlb.asset?.copyright);
    expect(glb.asset?.extras?.license).toEqual(heartGlb.asset?.extras?.license);
    expect(glb.asset?.extras?.adaptations).toEqual(manifest.adaptations);

    const publicMetadata = JSON.stringify({ manifest, asset: glb.asset });
    expect(publicMetadata).not.toContain('commercialRelease');
    expect(publicMetadata.toLowerCase()).not.toContain('development asset');
  });

  it('keeps the urinary seed aligned with the v1 target mapping', () => {
    const liveBySlug = new Map(
      URINARY_STRUCTURES.map((structure) => [structure.slug, structure]),
    );

    expect(URINARY_STRUCTURES).toHaveLength(
      URINARY_V1_TARGET_STRUCTURES.length,
    );
    expect(URINARY_STRUCTURES.map((structure) => structure.slug)).toEqual(
      URINARY_V1_TARGET_STRUCTURES.map((structure) => structure.slug),
    );
    for (const target of URINARY_V1_TARGET_STRUCTURES) {
      const seed = liveBySlug.get(target.slug);
      expect(seed).toBeDefined();
      expect(seed?.meshName).toBe(target.meshName);
      expect(seed?.layer).toBe(target.layer);
    }
  });
});

interface GeneratedManifest {
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
    license: string;
  }[];
  changes: string[];
  adaptations: string[];
  license: {
    notice: string;
    licenseUrl: string;
    status: string;
  };
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
  textOnly: { slug: string; layer: string; reason: string }[];
}

describe('Generated Step 3 seed-to-model contracts', () => {
  // Systems whose AI-drafted teaching text has been loaded into the seed from
  // docs/anatomy/drafts via scripts/apply-anatomy-teaching-draft.mjs. Every
  // other generated system is still an empty-text draft. Loaded text is
  // unverified, so it must not change the unpublished / unreviewed state.
  const SYSTEMS_WITH_LOADED_TEACHING_TEXT = new Set([
    'respiratory',
    'endocrine',
    'lymphatic',
    'sensory-ear',
    'body-surface-upper',
    'body-surface-lower',
    'nervous-central',
    'male-reproductive',
    'digestive-upper',
    'digestive-lower',
    'digestive-liver',
  ]);

  const generatedEntries = ANATOMY_SEED_REGISTRY.filter(
    (entry) => entry.system.slug !== 'heart' && entry.system.slug !== 'urinary',
  );

  it('registers all 16 generated modules', () => {
    expect(generatedEntries).toHaveLength(16);
    expect(
      new Set(generatedEntries.map((entry) => entry.system.slug)).size,
    ).toBe(16);
  });

  it('splits the generated modules into eleven loaded and five empty', () => {
    const loaded = generatedEntries
      .map((entry) => entry.system.slug)
      .filter((slug) => SYSTEMS_WITH_LOADED_TEACHING_TEXT.has(slug));
    const empty = generatedEntries
      .map((entry) => entry.system.slug)
      .filter((slug) => !SYSTEMS_WITH_LOADED_TEACHING_TEXT.has(slug));

    expect(loaded.sort()).toEqual([
      'body-surface-lower',
      'body-surface-upper',
      'digestive-liver',
      'digestive-lower',
      'digestive-upper',
      'endocrine',
      'lymphatic',
      'male-reproductive',
      'nervous-central',
      'respiratory',
      'sensory-ear',
    ]);
    expect(empty.sort()).toEqual([
      'digestive-hepatobiliary',
      'nervous-left',
      'nervous-right',
      'sensory-eye-left',
      'sensory-eye-right',
    ]);
  });

  for (const entry of generatedEntries) {
    const slug = entry.system.slug;
    const hasTeachingText = SYSTEMS_WITH_LOADED_TEACHING_TEXT.has(slug);

    describe(slug, () => {
      const manifestPath = join(ASSET_DIR, `${slug}.v1.manifest.json`);
      const glbPath = join(ASSET_DIR, `${slug}.v1.glb`);

      function loadManifest(): GeneratedManifest {
        return JSON.parse(
          readFileSync(manifestPath, 'utf8'),
        ) as GeneratedManifest;
      }

      it('is an unpublished draft with a valid seed', () => {
        expect(entry.system.isPublished).toBe(false);
        expect(entry.system.isSample).toBe(false);
        expect(entry.system.modelUrl).toBe(`/models/anatomy/${slug}.v1.glb`);
        expect(() => entry.validate()).not.toThrow();

        for (const structure of entry.structures) {
          expect(structure.meshName).not.toBeNull();
          expect(structure.meshName).toMatch(/^[a-z0-9_]+$/);
          expect(structure.references.length).toBeGreaterThan(0);
          expect(structure.references.join(' ')).toMatch(/^FMA:\d+/);
          const teachingText = [
            structure.summary,
            structure.location,
            structure.function,
            structure.bloodSupply,
            structure.clinicalNotes,
          ];
          if (hasTeachingText) {
            expect((structure.latinName ?? '').trim().length).toBeGreaterThan(
              0,
            );
            for (const value of teachingText) {
              expect(value.trim().length).toBeGreaterThan(0);
            }
          } else {
            expect(teachingText).toEqual(['', '', '', '', '']);
          }
        }
      });

      it('keeps the manifest and GLB in sync', () => {
        const manifest = loadManifest();
        const glbBytes = readFileSync(glbPath);

        expect(manifest.system).toBe(slug);
        expect(manifest.schemaVersion).toBe(2);
        expect(manifest.model.file).toBe(`${slug}.v1.glb`);
        expect(manifest.model.bytes).toBe(glbBytes.byteLength);
        expect(manifest.model.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
        expect(manifest.model.sha256).toBe(
          createHash('sha256').update(glbBytes).digest('hex'),
        );
        expect(manifest.model.triangles).toBeLessThanOrEqual(150_000);
      });

      it('has one GLB node and one manifest row per seed structure', () => {
        const manifest = loadManifest();
        const glb = readGlbJson(glbPath);
        const seedMeshNames = entry.structures.map(
          (structure) => structure.meshName,
        );
        const nodeNames = glb.nodes.map((node) => node.name);

        expect(manifest.textOnly).toHaveLength(0);
        expect(manifest.model.textOnlyStructures).toBe(0);
        expect(manifest.model.structures).toBe(entry.structures.length);
        expect(manifest.model.totalStructures).toBe(entry.structures.length);
        expect(manifest.structures).toHaveLength(entry.structures.length);
        expect(nodeNames).toHaveLength(entry.structures.length);
        expect([...nodeNames].sort()).toEqual([...seedMeshNames].sort());

        const manifestBySlug = new Map(
          manifest.structures.map((structure) => [structure.slug, structure]),
        );
        for (const seed of entry.structures) {
          const row = manifestBySlug.get(seed.slug);
          expect(row).toBeDefined();
          expect(row?.meshName).toBe(seed.meshName);
          expect(row?.layer).toBe(seed.layer);
          expect(row?.triangles).toBeGreaterThan(0);
          expect(row?.fma.length).toBeGreaterThan(0);
          expect(row?.files.length).toBeGreaterThan(0);

          const node = glb.nodes.find((item) => item.name === seed.meshName);
          expect(node).toBeDefined();
          expect(node?.extras?.layer).toBe(seed.layer);
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

      it('records provenance, the BodyParts3D credit, and both licence statements', () => {
        const manifest = loadManifest();
        const sourceTrees = new Set(
          manifest.sources.map((source) => source.tree),
        );

        expect(sourceTrees.has('PART-OF')).toBe(true);
        expect(sourceTrees.has('IS-A')).toBe(true);
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

        expect(manifest.changes.length).toBeGreaterThan(0);
        expect(manifest.adaptations.length).toBeGreaterThan(0);
        expect(manifest.license.notice).toContain('BodyParts3D');
        expect(manifest.license.licenseUrl).toContain('bodyparts3d');
      });
    });
  }
});
