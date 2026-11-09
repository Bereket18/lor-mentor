import type { PrismaClient } from '@prisma/client';

import type { AnatomyStructureSeed } from '../../../prisma/anatomy-heart.data';
import type { AnatomySeedEntry } from '../../../prisma/anatomy-registry';
import {
  TEACHING_FIELDS,
  assertLocalDatabaseTarget,
  buildPlan,
  shouldWriteSystem,
  skipStructureReason,
  skipSystemReason,
  systemDescriptionFromSeed,
  teachingFieldsDiffer,
  teachingFieldsFromSeed,
} from '../../../prisma/sync-teaching-text';

/**
 * `sync-teaching-text` writes loaded teaching text into a local database. These
 * tests pin the safety rules: it never targets a non-local or production
 * database, and its write payloads can never carry review, publication,
 * revision or approval state.
 */

const FORBIDDEN_FIELDS = [
  'isReviewed',
  'reviewedAt',
  'reviewedById',
  'reviewedRevisionId',
  'isPublished',
  'isSample',
  'contentRevision',
  'publicationApprovedAt',
  'publicationApprovedById',
  'publicationApprovedRevision',
] as const;

function structure(
  overrides: Partial<AnatomyStructureSeed> = {},
): AnatomyStructureSeed {
  return {
    slug: 'alpha',
    name: 'Alpha',
    latinName: null,
    summary: 'Alpha summary',
    location: 'Alpha location',
    function: 'Alpha function',
    bloodSupply: 'Alpha supply',
    clinicalNotes: 'Alpha notes',
    meshName: 'alpha',
    layer: 'example-layer',
    relatedSlugs: [],
    references: [],
    ...overrides,
  };
}

function seedEntry(
  slug: string,
  structures: AnatomyStructureSeed[],
): AnatomySeedEntry {
  return {
    system: {
      slug,
      name: slug,
      latinName: null,
      description: `${slug} description`,
      modelUrl: null,
      isSample: false,
      isPublished: false,
      sortOrder: 0,
    },
    structures,
    layerOrder: [],
    validate: () => undefined,
  };
}

interface StoredRow {
  id: string;
  slug: string;
  isReviewed: boolean;
  latinName: string | null;
  summary: string;
  location: string;
  function: string;
  bloodSupply: string;
  clinicalNotes: string;
}

function storedRow(
  id: string,
  seed: AnatomyStructureSeed,
  overrides: Partial<StoredRow> = {},
): StoredRow {
  return {
    id,
    slug: seed.slug,
    isReviewed: false,
    latinName: seed.latinName,
    summary: seed.summary,
    location: seed.location,
    function: seed.function,
    bloodSupply: seed.bloodSupply,
    clinicalNotes: seed.clinicalNotes,
    ...overrides,
  };
}

function fakePrisma({
  systems,
  rowsBySystem,
  findMany = jest.fn(),
}: {
  systems: Record<
    string,
    { id: string; description: string; isPublished: boolean }
  >;
  rowsBySystem: Record<string, StoredRow[]>;
  findMany?: jest.Mock;
}): PrismaClient {
  findMany.mockImplementation(
    async ({ where }: { where: { systemId: string } }) =>
      rowsBySystem[where.systemId] ?? [],
  );

  return {
    anatomySystem: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        systems[where.slug] ?? null,
    },
    anatomyStructure: { findMany },
  } as unknown as PrismaClient;
}

describe('sync teaching text database target', () => {
  const localUrl = 'postgresql://user:secret@localhost:5432/lor_mentor';

  it('refuses to run in production', () => {
    expect(() =>
      assertLocalDatabaseTarget({
        nodeEnv: 'production',
        databaseUrl: localUrl,
      }),
    ).toThrow(/production/);
  });

  it('requires DATABASE_URL', () => {
    expect(() => assertLocalDatabaseTarget({})).toThrow(/DATABASE_URL is required/);
  });

  it('refuses an unparseable DATABASE_URL', () => {
    expect(() =>
      assertLocalDatabaseTarget({ databaseUrl: 'not a url' }),
    ).toThrow(/not a valid connection URL/);
  });

  it('refuses a non-local host', () => {
    expect(() =>
      assertLocalDatabaseTarget({
        databaseUrl: 'postgresql://user:secret@db.example.com:5432/lor_mentor',
      }),
    ).toThrow(/non-local host "db\.example\.com"/);
  });

  it('allows localhost and 127.0.0.1', () => {
    expect(() =>
      assertLocalDatabaseTarget({ databaseUrl: localUrl }),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabaseTarget({
        databaseUrl: 'postgresql://user:secret@127.0.0.1:5432/lor_mentor',
      }),
    ).not.toThrow();
  });
});

describe('sync teaching text skip rules', () => {
  it('skips a published system', () => {
    expect(skipSystemReason({ isPublished: false })).toBeNull();
    expect(skipSystemReason({ isPublished: true })).toBe('system is published');
  });

  it('skips a faculty-reviewed structure', () => {
    expect(skipStructureReason({ isReviewed: false })).toBeNull();
    expect(skipStructureReason({ isReviewed: true })).toBe(
      'structure is faculty reviewed',
    );
  });
});

describe('sync teaching text write payloads', () => {
  it('writes exactly the six teaching fields', () => {
    const payload = teachingFieldsFromSeed(structure());

    expect(Object.keys(payload).sort()).toEqual([...TEACHING_FIELDS].sort());
    for (const field of FORBIDDEN_FIELDS) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  it('writes only the system description', () => {
    const payload = systemDescriptionFromSeed({ description: 'Example.' });

    expect(payload).toEqual({ description: 'Example.' });
    for (const field of FORBIDDEN_FIELDS) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  it('detects identical and changed teaching fields', () => {
    const next = teachingFieldsFromSeed(structure());
    expect(teachingFieldsDiffer(next, next)).toBe(false);

    expect(
      teachingFieldsDiffer({ ...next, summary: 'Different.' }, next),
    ).toBe(true);
    expect(
      teachingFieldsDiffer({ ...next, latinName: 'Atrium dextrum' }, next),
    ).toBe(true);
    expect(
      teachingFieldsDiffer({ ...next, clinicalNotes: null }, next),
    ).toBe(true);
  });
});

describe('sync teaching text plan', () => {
  it('never plans changes for a published system', async () => {
    const findMany = jest.fn();
    const seed = structure();
    const entry = seedEntry('published', [seed]);
    const prisma = fakePrisma({
      systems: {
        published: {
          id: 'system_published',
          description: 'Old description.',
          isPublished: true,
        },
      },
      rowsBySystem: { system_published: [storedRow('row_1', seed)] },
      findMany,
    });

    const [plan] = await buildPlan(prisma, [entry]);

    expect(findMany).not.toHaveBeenCalled();
    expect(plan.systemSkipReason).toBe('system is published');
    expect(shouldWriteSystem(plan)).toBe(false);
    expect(plan.changes).toEqual([]);
    expect(plan.reviewedSkipped).toEqual(['alpha']);
    // The description differs, but the plan must never be applied.
    expect(plan.descriptionChange).toBe(true);
  });

  it('never plans changes for a reviewed structure', async () => {
    const seed = structure();
    const entry = seedEntry('reviewed', [seed]);
    const prisma = fakePrisma({
      systems: {
        reviewed: {
          id: 'system_reviewed',
          description: 'reviewed description',
          isPublished: false,
        },
      },
      rowsBySystem: {
        system_reviewed: [
          storedRow('row_1', seed, {
            isReviewed: true,
            summary: 'Faculty-edited summary.',
          }),
        ],
      },
    });

    const [plan] = await buildPlan(prisma, [entry]);

    expect(shouldWriteSystem(plan)).toBe(true);
    expect(plan.changes).toEqual([]);
    expect(plan.reviewedSkipped).toEqual(['alpha']);
  });

  it('plans a change when an unreviewed row differs from the seed', async () => {
    const seed = structure();
    const entry = seedEntry('editable', [seed]);
    const prisma = fakePrisma({
      systems: {
        editable: {
          id: 'system_editable',
          description: 'editable description',
          isPublished: false,
        },
      },
      rowsBySystem: {
        system_editable: [
          storedRow('row_1', seed, { summary: 'Old summary.' }),
        ],
      },
    });

    const [plan] = await buildPlan(prisma, [entry]);

    expect(plan.descriptionChange).toBe(false);
    expect(plan.reviewedSkipped).toEqual([]);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      id: 'row_1',
      slug: 'alpha',
    });
    expect(Object.keys(plan.changes[0].next).sort()).toEqual(
      [...TEACHING_FIELDS].sort(),
    );
    for (const field of FORBIDDEN_FIELDS) {
      expect(plan.changes[0].next).not.toHaveProperty(field);
    }
  });

  it('records missing structures without planning a write', async () => {
    const seed = structure({ slug: 'missing' });
    const entry = seedEntry('sparse', [seed]);
    const prisma = fakePrisma({
      systems: {
        sparse: {
          id: 'system_sparse',
          description: 'sparse description',
          isPublished: false,
        },
      },
      rowsBySystem: { system_sparse: [] },
    });

    const [plan] = await buildPlan(prisma, [entry]);

    expect(plan.changes).toEqual([]);
    expect(plan.missingStructures).toEqual(['missing']);
  });
});