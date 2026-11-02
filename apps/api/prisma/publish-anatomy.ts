/**
 * Anatomy Lab publish/unpublish switch.
 *
 * This is a local operator script, not an API route. Publishing is blocked
 * until the module has a reviewed mapping document and every structure has
 * non-empty teaching text and a faculty review record.
 *
 * Run:
 *   npm run anatomy:publish --workspace=apps/api -- --system urinary
 *   npm run anatomy:publish --workspace=apps/api -- --system urinary --confirm
 *   npm run anatomy:publish --workspace=apps/api -- --system urinary --unpublish
 *   npm run anatomy:publish --workspace=apps/api -- --system urinary --unpublish --confirm
 *
 * The default is a dry run. --confirm applies the change; --unpublish reverses
 * a publication. This script never edits teaching text, isReviewed, or any
 * other structure field.
 */

import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const argv = process.argv.slice(2);
const confirm = argv.includes('--confirm');
const unpublish = argv.includes('--unpublish');

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

function hasTeachingText(structure: {
  summary: string;
  location: string | null;
  function: string | null;
  bloodSupply: string | null;
  clinicalNotes: string | null;
}): boolean {
  return [
    structure.summary,
    structure.location,
    structure.function,
    structure.bloodSupply,
    structure.clinicalNotes,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
}

function mappingDocPath(slug: string): string {
  return resolve(
    __dirname,
    `../../../docs/anatomy/provenance/${slug}-mapping.md`,
  );
}

async function main() {
  const systemSlug = readFlagValue('--system')?.trim();
  if (!systemSlug) {
    throw new Error('Missing required --system <slug>.');
  }

  const system = await prisma.anatomySystem.findUnique({
    where: { slug: systemSlug },
    include: {
      structures: {
        select: {
          slug: true,
          summary: true,
          location: true,
          function: true,
          bloodSupply: true,
          clinicalNotes: true,
          isReviewed: true,
        },
      },
    },
  });
  if (!system) {
    throw new Error(`Anatomy system "${systemSlug}" does not exist.`);
  }

  const total = system.structures.length;
  const empty = system.structures.filter(
    (structure) => !hasTeachingText(structure),
  );
  const unreviewed = system.structures.filter(
    (structure) => !structure.isReviewed,
  );

  const blockers: string[] = [];
  if (!unpublish) {
    const docPath = mappingDocPath(system.slug);
    if (!existsSync(docPath)) {
      blockers.push(`Mapping document is missing: ${docPath}`);
    } else if (
      readFileSync(docPath, 'utf8').includes('mapping not yet owner-reviewed')
    ) {
      blockers.push(
        `Mapping document still says "mapping not yet owner-reviewed": ${docPath}`,
      );
    }
    if (total === 0) {
      blockers.push('The system has no structures.');
    }
    if (empty.length > 0) {
      blockers.push(
        `${empty.length} structure(s) have empty teaching text: ${empty
          .map((structure) => structure.slug)
          .join(', ')}`,
      );
    }
    if (unreviewed.length > 0) {
      blockers.push(
        `${unreviewed.length} structure(s) are not faculty reviewed: ${unreviewed
          .map((structure) => structure.slug)
          .join(', ')}`,
      );
    }
  }

  const target = !unpublish;
  console.log('Anatomy publish plan');
  console.log(`  System: ${system.slug} (${system.name})`);
  console.log(
    `  Current publication: ${system.isPublished ? 'published' : 'unpublished draft'}`,
  );
  console.log(
    `  Target publication: ${target ? 'published' : 'unpublished draft'}`,
  );
  console.log(
    `  Structures: ${total} total; ${empty.length} empty; ${unreviewed.length} unreviewed`,
  );
  console.log(`  Action: ${unpublish ? 'unpublish' : 'publish'}`);
  console.log('');

  if (blockers.length > 0) {
    console.log('Publish blockers:');
    for (const blocker of blockers) console.log(`  - ${blocker}`);
    console.log('');
  } else {
    console.log('No publish blockers.');
    console.log('');
  }

  if (!confirm) {
    console.log('Dry run: no database rows were changed.');
    if (blockers.length > 0) {
      console.log('Re-run with --confirm after clearing the blockers.');
    } else {
      console.log(
        `Re-run with --confirm to ${
          unpublish ? 'unpublish' : 'publish'
        } this system.`,
      );
    }
    return;
  }

  if (blockers.length > 0) {
    throw new Error(
      'Refusing to publish while blockers remain. Clear every blocker first.',
    );
  }

  if (system.isPublished === target) {
    console.log(
      `No change: ${system.slug} is already ${
        target ? 'published' : 'unpublished'
      }.`,
    );
    return;
  }

  await prisma.anatomySystem.update({
    where: { id: system.id },
    data: { isPublished: target },
  });
  console.log(`${system.slug} is now ${target ? 'published' : 'unpublished'}.`);
}

main()
  .catch((error: unknown) => {
    console.error(
      'Anatomy publish failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
