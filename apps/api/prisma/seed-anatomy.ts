/**
 * Anatomy Lab seed — all registered systems.
 *
 * This script is intentionally separate from prisma/seed.ts so the core
 * academic seed and the anatomy content can be run independently.
 *
 * Run:
 *   npm run db:seed:anatomy
 *   npm run db:seed:anatomy -- --system urinary
 *   npm run db:seed:anatomy -- --reconcile
 *   npm run db:seed:anatomy -- --reconcile --prune-stale
 *
 * Safety rules:
 *   - Default mode is create-only. Existing systems and structures are never
 *     updated, so faculty edits and isReviewed values survive re-seeding.
 *   - `--reconcile` refreshes only structural fields on rows that already
 *     exist (system name, Latin name, description, model URL, and order; each
 *     structure's citations, sort order, and related slugs) and creates
 *     missing structures.
 *
 *     It must never change publication or review state. It never writes
 *     isPublished, isSample, contentRevision, or any publicationApproved*
 *     field on a system, and never writes isReviewed, reviewedAt,
 *     reviewedById, or reviewedRevisionId on a structure. It also never
 *     overwrites teaching text (summary, location, function, bloodSupply,
 *     clinicalNotes), a curated Latin name, name, meshName, or layer on an
 *     existing row. The write payloads are allowlisted in
 *     `prisma/anatomy-reconcile.ts` and covered by
 *     `src/modules/anatomy/anatomy-reconcile.spec.ts`.
 *   - `--prune-stale` deletes structures that exist in the database but are not
 *     in the seed. It requires an explicit flag because it is destructive.
 *     Take a database backup first and review the printed list.
 *   - The full plan is printed before any write.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  ANATOMY_SEED_REGISTRY,
  ANATOMY_SYSTEM_SLUGS,
  getAnatomySeedEntry,
  orderStructuresForSeed,
} from './anatomy-registry';
import {
  reconcilableStructureFields,
  reconcilableSystemFields,
} from './anatomy-reconcile';

import type { AnatomySeedEntry } from './anatomy-registry';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const argv = process.argv.slice(2);
const reconcile = argv.includes('--reconcile');
const pruneStale = argv.includes('--prune-stale');

function readFlagValue(flag: string): string | undefined {
  const inline = argv.find((argument) => argument.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);

  const index = argv.indexOf(flag);
  if (index === -1) return undefined;

  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function selectEntries(): AnatomySeedEntry[] {
  const requested = (readFlagValue('--system') ?? 'all').trim();
  if (requested === 'all') return [...ANATOMY_SEED_REGISTRY];

  if (!ANATOMY_SYSTEM_SLUGS.includes(requested)) {
    throw new Error(
      `Unknown anatomy system "${requested}". Available systems: ${ANATOMY_SYSTEM_SLUGS.join(
        ', ',
      )}, all.`,
    );
  }

  return [getAnatomySeedEntry(requested)];
}

interface SeedPlan {
  entry: AnatomySeedEntry;
  existingSystemId: string | null;
  existingCount: number;
  createSlugs: string[];
  reconcileCount: number;
  stale: Array<{
    id: string;
    slug: string;
    meshName: string | null;
    isReviewed: boolean;
  }>;
}

async function buildPlan(entry: AnatomySeedEntry): Promise<SeedPlan> {
  const ordered = orderStructuresForSeed(entry);
  const existingSystem = await prisma.anatomySystem.findUnique({
    where: { slug: entry.system.slug },
    select: { id: true },
  });

  if (!existingSystem) {
    return {
      entry,
      existingSystemId: null,
      existingCount: 0,
      createSlugs: ordered.map((structure) => structure.slug),
      reconcileCount: 0,
      stale: [],
    };
  }

  const existingStructures = await prisma.anatomyStructure.findMany({
    where: { systemId: existingSystem.id },
    select: { id: true, slug: true, meshName: true, isReviewed: true },
  });
  const bySlug = new Set(existingStructures.map((structure) => structure.slug));
  const seedSlugs = new Set(ordered.map((structure) => structure.slug));

  return {
    entry,
    existingSystemId: existingSystem.id,
    existingCount: existingStructures.length,
    createSlugs: ordered
      .filter((structure) => !bySlug.has(structure.slug))
      .map((structure) => structure.slug),
    reconcileCount: reconcile
      ? ordered.filter((structure) => bySlug.has(structure.slug)).length
      : 0,
    stale: existingStructures.filter(
      (structure) => !seedSlugs.has(structure.slug),
    ),
  };
}

function meshCount(entry: AnatomySeedEntry): number {
  return entry.structures.filter((structure) => structure.meshName !== null)
    .length;
}

function printPlan(plans: SeedPlan[]): void {
  console.log('Anatomy seed plan');
  console.log(
    `  Mode: ${
      reconcile
        ? pruneStale
          ? 'reconcile + prune-stale'
          : 'reconcile'
        : 'create-only'
    }`,
  );
  console.log(
    `  Targets: ${plans.map((plan) => plan.entry.system.slug).join(', ')}`,
  );
  console.log('');

  for (const plan of plans) {
    const { entry } = plan;
    const textOnly = entry.structures.length - meshCount(entry);
    console.log(`[${entry.system.slug}] ${entry.system.name}`);
    const seedPublication = entry.system.isPublished
      ? 'published'
      : 'unpublished draft';
    console.log(
      plan.existingSystemId && reconcile
        ? `  Publication: ${seedPublication} in the seed; the live row is left unchanged`
        : `  Publication: ${seedPublication}`,
    );
    console.log(
      `  Seed structures: ${entry.structures.length} (${meshCount(entry)} mesh, ${textOnly} text-only)`,
    );

    if (plan.existingSystemId) {
      console.log(
        `  System: exists; ${
          reconcile
            ? 'metadata and derived structure fields will be reconciled'
            : 'metadata will be left unchanged (use --reconcile to sync)'
        }.`,
      );
      console.log(
        `  Database rows: ${plan.existingCount}; create ${plan.createSlugs.length}, leave ${plan.existingCount - plan.createSlugs.length} unchanged${
          reconcile
            ? `, reconcile derived fields on ${plan.reconcileCount}`
            : ''
        }.`,
      );
    } else {
      console.log('  System: will be created.');
      console.log(`  Database rows: 0; create ${plan.createSlugs.length}.`);
    }

    if (plan.stale.length > 0) {
      console.log(`  Stale rows: ${plan.stale.length}`);
      for (const structure of plan.stale) {
        console.log(
          `    - ${structure.slug} (mesh: ${structure.meshName ?? 'no 3D model'})${structure.isReviewed ? ' [faculty reviewed]' : ''}`,
        );
      }
      console.log(
        pruneStale
          ? '    These rows will be deleted after the plan is applied.'
          : '    These rows are left untouched. Re-run with --prune-stale to remove them after a backup.',
      );
    } else {
      console.log('  Stale rows: none');
    }
    console.log('');
  }
}

function assertPruneIsSafe(plans: SeedPlan[]): void {
  if (!pruneStale) return;

  const reviewed = plans.flatMap((plan) =>
    plan.stale.filter((structure) => structure.isReviewed),
  );
  if (reviewed.length > 0) {
    throw new Error(
      `Refusing to prune ${reviewed.length} faculty-reviewed structure(s): ${reviewed
        .map((structure) => structure.slug)
        .join(', ')}. Unpublish them manually after review.`,
    );
  }
}

async function applyPlan(plan: SeedPlan): Promise<void> {
  const { entry } = plan;
  const ordered = orderStructuresForSeed(entry);

  let systemId: string;
  if (plan.existingSystemId) {
    systemId = plan.existingSystemId;
    if (reconcile) {
      await prisma.anatomySystem.update({
        where: { id: systemId },
        data: reconcilableSystemFields(entry.system),
      });
      console.log(
        `[${entry.system.slug}] Reconciled system metadata (model URL ${entry.system.modelUrl}); publication state left unchanged.`,
      );
    } else {
      console.log(
        `[${entry.system.slug}] System already exists; left unchanged.`,
      );
    }
  } else {
    const system = await prisma.anatomySystem.create({
      data: entry.system,
      select: { id: true },
    });
    systemId = system.id;
    console.log(`[${entry.system.slug}] Created anatomy system.`);
  }

  const existingStructures = await prisma.anatomyStructure.findMany({
    where: { systemId },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(
    existingStructures.map((structure) => [structure.slug, structure]),
  );

  let created = 0;
  let skipped = 0;
  let reconciled = 0;

  for (const [index, structure] of ordered.entries()) {
    const existing = bySlug.get(structure.slug);
    if (existing) {
      skipped += 1;
      // Citations, order, and related slugs are derived from the model and
      // navigation graph, not faculty writing, so reconcile may refresh them.
      // Teaching text, names, meshName, layer, and review state stay put; the
      // allowlist in reconcilableStructureFields makes that structural.
      if (reconcile) {
        await prisma.anatomyStructure.update({
          where: { id: existing.id },
          data: reconcilableStructureFields(structure, index + 1),
        });
        reconciled += 1;
      }
      continue;
    }

    await prisma.anatomyStructure.create({
      data: {
        systemId,
        ...structure,
        sortOrder: index + 1,
        isReviewed: false,
      },
    });
    created += 1;
  }

  if (plan.stale.length > 0 && pruneStale) {
    const result = await prisma.anatomyStructure.deleteMany({
      where: { id: { in: plan.stale.map((structure) => structure.id) } },
    });
    console.log(
      `[${entry.system.slug}] Pruned ${result.count} stale structure(s).`,
    );
  }

  const total = await prisma.anatomyStructure.count({ where: { systemId } });
  console.log(
    `[${entry.system.slug}] Seed complete: ${created} created, ${skipped} already existed, ${total} total${
      reconciled > 0 ? `, ${reconciled} existing rows reconciled` : ''
    }${plan.stale.length > 0 && !pruneStale ? `, ${plan.stale.length} stale` : ''}.`,
  );
}

async function main() {
  const entries = selectEntries();
  for (const entry of entries) entry.validate();

  const plans: SeedPlan[] = [];
  for (const entry of entries) plans.push(await buildPlan(entry));

  printPlan(plans);
  assertPruneIsSafe(plans);

  for (const plan of plans) await applyPlan(plan);
}

main()
  .catch((error) => {
    console.error('Anatomy seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
