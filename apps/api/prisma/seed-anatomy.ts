/**
 * Anatomy Lab seed — Heart and circulation.
 *
 * This script is intentionally separate from prisma/seed.ts so the core
 * academic seed and the anatomy content can be run independently.
 *
 * Run:
 *   npm run db:seed:anatomy
 *   npm run db:seed:anatomy -- --reconcile
 *   npm run db:seed:anatomy -- --reconcile --prune-stale
 *
 * Safety rules:
 *   - Default mode is create-only. Existing systems and structures are never
 *     updated, so faculty edits and isReviewed values survive re-seeding.
 *   - `--reconcile` updates system metadata (including the versioned model URL),
 *     refreshes the derived citation, sort-order, and related-structure fields
 *     on existing structures, and creates missing structures. It never
 *     overwrites summaries, notes, names, or isReviewed.
 *   - `--prune-stale` deletes structures that exist in the database but are not
 *     in the seed. It requires an explicit flag because it is destructive.
 *     Take a database backup first and review the printed list.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  HEART_STRUCTURES,
  HEART_SYSTEM,
  validateHeartSeed,
} from './anatomy-heart.data';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const args = new Set(process.argv.slice(2));
const reconcile = args.has('--reconcile');
const pruneStale = args.has('--prune-stale');

async function main() {
  validateHeartSeed();

  const existingSystem = await prisma.anatomySystem.findUnique({
    where: { slug: HEART_SYSTEM.slug },
    select: { id: true },
  });

  let systemId: string;
  if (existingSystem) {
    systemId = existingSystem.id;
    if (reconcile) {
      await prisma.anatomySystem.update({
        where: { id: systemId },
        data: HEART_SYSTEM,
      });
      console.log(
        `Anatomy system "${HEART_SYSTEM.slug}" exists; reconciled metadata (model URL ${HEART_SYSTEM.modelUrl}).`,
      );
    } else {
      console.log(
        `Anatomy system "${HEART_SYSTEM.slug}" already exists; leaving it unchanged. Re-run with --reconcile to sync metadata such as the model URL.`,
      );
    }
  } else {
    const system = await prisma.anatomySystem.create({
      data: HEART_SYSTEM,
      select: { id: true },
    });
    systemId = system.id;
    console.log(`Created anatomy system "${HEART_SYSTEM.slug}".`);
  }

  const existingStructures = await prisma.anatomyStructure.findMany({
    where: { systemId },
    select: { id: true, slug: true, meshName: true, isReviewed: true },
  });
  const bySlug = new Map(
    existingStructures.map((structure) => [structure.slug, structure]),
  );

  let created = 0;
  let skipped = 0;
  let reconciled = 0;

  for (const [index, structure] of HEART_STRUCTURES.entries()) {
    const existing = bySlug.get(structure.slug);
    if (existing) {
      skipped += 1;
      // Citations, order, and related slugs are derived from the model and
      // navigation graph, not faculty writing, so reconcile may refresh them.
      // Teaching text, names, and review state stay put. meshName is excluded
      // on purpose: legacy text-only rows may still hold an old mesh name and
      // a blanket update could collide with the unique index.
      if (reconcile) {
        await prisma.anatomyStructure.update({
          where: { id: existing.id },
          data: {
            references: structure.references,
            sortOrder: index + 1,
            relatedSlugs: structure.relatedSlugs,
          },
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

  const seedSlugs = new Set(
    HEART_STRUCTURES.map((structure) => structure.slug),
  );
  const stale = existingStructures.filter(
    (structure) => !seedSlugs.has(structure.slug),
  );

  if (stale.length > 0) {
    console.warn(
      `\n${stale.length} structure(s) exist in the database but not in the current seed:`,
    );
    for (const structure of stale) {
      console.warn(
        `  - ${structure.slug} (mesh: ${structure.meshName ?? 'no 3D model'})${structure.isReviewed ? ' [faculty reviewed]' : ''}`,
      );
    }
    console.warn(
      'These rows point at meshes that are not in the shipped model. Review the list, back up the database, then re-run with --prune-stale to remove them.',
    );

    if (pruneStale) {
      const reviewed = stale.filter((structure) => structure.isReviewed);
      if (reviewed.length > 0) {
        throw new Error(
          `Refusing to prune ${reviewed.length} faculty-reviewed structure(s). Unpublish them manually after review.`,
        );
      }
      const result = await prisma.anatomyStructure.deleteMany({
        where: { id: { in: stale.map((structure) => structure.id) } },
      });
      console.log(`Pruned ${result.count} stale structure(s).`);
    }
  }

  const total = await prisma.anatomyStructure.count({
    where: { systemId },
  });

  console.log(
    `Heart seed complete: ${created} created, ${skipped} already existed, ${total} total${
      reconciled > 0 ? `, ${reconciled} existing rows reconciled` : ''
    }${stale.length > 0 && !pruneStale ? `, ${stale.length} stale` : ''}.`,
  );
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
