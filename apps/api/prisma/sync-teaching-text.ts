/**
 * Sync loaded teaching text from the seed into a local database.
 *
 * This is a local operator script, not an API route. It copies the seed's
 * teaching fields into rows that already exist, so a developer can refresh a
 * local database after a teaching draft is loaded without re-running the whole
 * create-only seed.
 *
 * Run:
 *   npm run anatomy:sync-teaching-text --workspace=apps/api
 *   npm run anatomy:sync-teaching-text --workspace=apps/api -- --apply
 *
 * Safety rules:
 *   - Refuses to run when NODE_ENV is production.
 *   - Refuses to run when the DATABASE_URL host is not localhost or 127.0.0.1.
 *   - The default is a dry run: it only prints, per system, how many structures
 *     would change. --apply writes.
 *   - It writes ONLY the six teaching fields (latinName, summary, location,
 *     function, bloodSupply, clinicalNotes) and the system description.
 *   - It never touches review, publication, revision or approval state: no
 *     isReviewed, reviewedAt, reviewedById, reviewedRevisionId, isPublished,
 *     isSample, contentRevision, or publicationApproved* field is ever written.
 *   - It skips (and lists) any system that is published, and any structure that
 *     is faculty reviewed.
 *
 * The pure rule helpers are exported so their skip rules can be unit tested
 * without a database. `main` runs only when this file is executed directly.
 */

import { basename } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ANATOMY_SEED_REGISTRY } from './anatomy-registry';

import type { AnatomySeedEntry } from './anatomy-registry';

/** The six teaching fields this script owns. */
export const TEACHING_FIELDS = [
  'latinName',
  'summary',
  'location',
  'function',
  'bloodSupply',
  'clinicalNotes',
] as const;

/** The seed's teaching fields: every field except latinName is a string. */
export interface SeedTeachingFields {
  latinName: string | null;
  summary: string;
  location: string;
  function: string;
  bloodSupply: string;
  clinicalNotes: string;
}

/** A database row's teaching fields; location and friends may be null. */
export type StoredTeachingFields = {
  [K in keyof SeedTeachingFields]: string | null;
};

/** Copy the six teaching fields, dropping everything else. */
export function teachingFieldsFromSeed(
  structure: SeedTeachingFields,
): SeedTeachingFields {
  return {
    latinName: structure.latinName,
    summary: structure.summary,
    location: structure.location,
    function: structure.function,
    bloodSupply: structure.bloodSupply,
    clinicalNotes: structure.clinicalNotes,
  };
}

/** The only system field this script owns. */
export function systemDescriptionFromSeed(system: {
  description: string;
}): { description: string } {
  return { description: system.description };
}

/** Reason to skip a whole system, or null when it is safe to sync. */
export function skipSystemReason(system: { isPublished: boolean }): string | null {
  return system.isPublished ? 'system is published' : null;
}

/** Reason to skip one structure, or null when it is safe to sync. */
export function skipStructureReason(structure: {
  isReviewed: boolean;
}): string | null {
  return structure.isReviewed ? 'structure is faculty reviewed' : null;
}

/** True when any of the six teaching fields differ. */
export function teachingFieldsDiffer(
  existing: StoredTeachingFields,
  next: SeedTeachingFields,
): boolean {
  return TEACHING_FIELDS.some(
    (field) => (existing[field] ?? null) !== (next[field] ?? null),
  );
}

/**
 * Refuse to run against anything but a local, non-production database.
 * Throws with an explanatory message when it is unsafe.
 */
export function assertLocalDatabaseTarget({
  nodeEnv,
  databaseUrl,
}: {
  nodeEnv?: string | undefined;
  databaseUrl?: string | undefined;
}): void {
  if (nodeEnv === 'production') {
    throw new Error(
      'Refusing to sync teaching text while NODE_ENV is production.',
    );
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to sync teaching text.');
  }

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL.');
  }

  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `Refusing to sync teaching text against non-local host "${host}". Only localhost and 127.0.0.1 are allowed.`,
    );
  }
}

interface PlannedStructureChange {
  id: string;
  slug: string;
  next: SeedTeachingFields;
}

export interface SystemPlan {
  slug: string;
  systemId: string;
  descriptionChange: boolean;
  changes: PlannedStructureChange[];
  reviewedSkipped: string[];
  missingStructures: string[];
  /** Non-null when the whole system is skipped (currently only publication). */
  systemSkipReason: string | null;
}

/** A skipped system is never written, including its description. */
export function shouldWriteSystem(plan: SystemPlan): boolean {
  return plan.systemSkipReason === null;
}

/** Build the full, read-only plan for every registered system. */
export async function buildPlan(
  prisma: PrismaClient,
  entries: readonly AnatomySeedEntry[] = ANATOMY_SEED_REGISTRY,
): Promise<SystemPlan[]> {
  const plans: SystemPlan[] = [];

  for (const entry of entries) {
    const system = await prisma.anatomySystem.findUnique({
      where: { slug: entry.system.slug },
      select: { id: true, description: true, isPublished: true },
    });
    if (!system) continue;

    const plan: SystemPlan = {
      slug: entry.system.slug,
      systemId: system.id,
      descriptionChange: system.description !== entry.system.description,
      changes: [],
      reviewedSkipped: [],
      missingStructures: [],
      systemSkipReason: skipSystemReason(system),
    };

    if (plan.systemSkipReason) {
      plan.reviewedSkipped.push(...entry.structures.map((s) => s.slug));
      plans.push(plan);
      continue;
    }

    const rows = await prisma.anatomyStructure.findMany({
      where: { systemId: system.id },
      select: {
        id: true,
        slug: true,
        isReviewed: true,
        latinName: true,
        summary: true,
        location: true,
        function: true,
        bloodSupply: true,
        clinicalNotes: true,
      },
    });
    const bySlug = new Map(rows.map((row) => [row.slug, row]));

    for (const structure of entry.structures) {
      const existing = bySlug.get(structure.slug);
      if (!existing) {
        plan.missingStructures.push(structure.slug);
        continue;
      }
      if (skipStructureReason(existing)) {
        plan.reviewedSkipped.push(structure.slug);
        continue;
      }
      const next = teachingFieldsFromSeed(structure);
      if (teachingFieldsDiffer(existing, next)) {
        plan.changes.push({ id: existing.id, slug: structure.slug, next });
      }
    }

    plans.push(plan);
  }

  return plans;
}

function describePlan(plans: SystemPlan[]): void {
  for (const plan of plans) {
    const parts = [
      `${plan.changes.length} structure(s) would change`,
      plan.systemSkipReason
        ? `system skipped (${plan.systemSkipReason})`
        : plan.descriptionChange
          ? 'description would change'
          : 'description unchanged',
    ];
    if (plan.reviewedSkipped.length > 0) {
      parts.push(
        `${plan.reviewedSkipped.length} skipped (reviewed/published): ${plan.reviewedSkipped.join(', ')}`,
      );
    }
    if (plan.missingStructures.length > 0) {
      parts.push(
        `${plan.missingStructures.length} missing in database: ${plan.missingStructures.join(', ')}`,
      );
    }
    console.log(`[${plan.slug}] ${parts.join('; ')}`);
  }
}

async function main(): Promise<void> {
  await import('dotenv/config');

  assertLocalDatabaseTarget({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });

  const apply = process.argv.includes('--apply');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Anatomy teaching-text sync plan');
    console.log(`  Mode: ${apply ? 'apply' : 'dry run'}`);
    console.log(`  Database host: ${new URL(process.env.DATABASE_URL!).hostname}`);
    console.log('');

    const before = await buildPlan(prisma);
    describePlan(before);

    const structureCount = before.reduce(
      (total, plan) => total + plan.changes.length,
      0,
    );
    const descriptionCount = before.filter(
      (plan) => plan.descriptionChange && shouldWriteSystem(plan),
    ).length;
    console.log('');
    console.log(
      `Before: ${structureCount} structure(s) and ${descriptionCount} description(s) differ from the seed.`,
    );

    if (!apply) {
      console.log('Dry run: no database rows were changed.');
      console.log('Re-run with --apply to write these changes.');
      return;
    }

    for (const plan of before) {
      if (!shouldWriteSystem(plan)) continue;
      if (plan.descriptionChange) {
        const system = ANATOMY_SEED_REGISTRY.find(
          (entry) => entry.system.slug === plan.slug,
        );
        if (system) {
          await prisma.anatomySystem.update({
            where: { id: plan.systemId },
            data: systemDescriptionFromSeed(system.system),
          });
        }
      }
      for (const change of plan.changes) {
        await prisma.anatomyStructure.update({
          where: { id: change.id },
          data: change.next,
        });
      }
    }

    const after = await buildPlan(prisma);
    const remainingStructures = after.reduce(
      (total, plan) => total + plan.changes.length,
      0,
    );
    const remainingDescriptions = after.filter(
      (plan) => plan.descriptionChange && shouldWriteSystem(plan),
    ).length;
    console.log('');
    console.log(
      `After: ${structureCount} structure(s) and ${descriptionCount} description(s) updated; ${remainingStructures} structure(s) and ${remainingDescriptions} description(s) still differ.`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

const invokedDirectly = /^sync-teaching-text\.[cm]?[jt]s$/.test(
  basename(process.argv[1] ?? ''),
);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(
      'Anatomy teaching-text sync failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
}
