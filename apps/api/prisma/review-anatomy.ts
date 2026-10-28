/**
 * Anatomy Lab faculty review sign-off.
 *
 * This is a local operator script, not an API route. It records a review (or a
 * review revocation) for every structure in one anatomy system.
 *
 * Run:
 *   npm run anatomy:review --workspace=apps/api -- \
 *     --system urinary --reviewer "Dr Example" --date 2026-10-28
 *
 * The default is a dry run. Add --confirm to write isReviewed and the audit
 * record. Add --revoke to clear isReviewed instead of setting it.
 */

import 'reflect-metadata';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AuditService } from '../src/modules/audit/audit.service';

import type { PrismaService } from '../src/prisma/prisma.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const audit = new AuditService(prisma as unknown as PrismaService);

const argv = process.argv.slice(2);
const confirm = argv.includes('--confirm');
const revoke = argv.includes('--revoke');

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

function requireFlag(flag: string): string {
  const value = readFlagValue(flag)?.trim();
  if (!value) {
    throw new Error(`Missing required ${flag}.`);
  }
  return value;
}

function parseReviewDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--date must use YYYY-MM-DD.');
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('--date is not a valid calendar date.');
  }
  return date;
}

async function main() {
  const systemSlug = requireFlag('--system');
  const reviewer = requireFlag('--reviewer');
  const reviewDateValue = requireFlag('--date');
  const reviewDate = parseReviewDate(reviewDateValue);

  const system = await prisma.anatomySystem.findUnique({
    where: { slug: systemSlug },
    select: { id: true, slug: true, name: true, isPublished: true },
  });
  if (!system) {
    throw new Error(`Anatomy system "${systemSlug}" does not exist.`);
  }

  const [total, currentlyReviewed] = await Promise.all([
    prisma.anatomyStructure.count({ where: { systemId: system.id } }),
    prisma.anatomyStructure.count({
      where: { systemId: system.id, isReviewed: true },
    }),
  ]);

  const targetReviewed = !revoke;
  const changing = revoke ? currentlyReviewed : total - currentlyReviewed;

  console.log('Anatomy review plan');
  console.log(`  System: ${system.slug} (${system.name})`);
  console.log(`  Reviewer: ${reviewer}`);
  console.log(`  Review date: ${reviewDateValue}`);
  console.log(
    `  Action: ${revoke ? 'revoke review' : 'mark reviewed'} (isReviewed=${targetReviewed})`,
  );
  console.log(
    `  Publication: ${system.isPublished ? 'published' : 'unpublished draft'}`,
  );
  console.log(
    `  Rows: ${total} total; ${currentlyReviewed} currently reviewed; ${changing} will change.`,
  );

  if (!confirm) {
    console.log('');
    console.log('Dry run: no database rows were changed.');
    console.log(
      'Re-run with --confirm to apply this plan and write the audit record.',
    );
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const update = await tx.anatomyStructure.updateMany({
      where: { systemId: system.id },
      data: { isReviewed: targetReviewed },
    });

    await audit.record({
      action: revoke ? 'anatomy.review.revoke' : 'anatomy.review',
      entityType: 'AnatomySystem',
      entityId: system.id,
      meta: {
        systemSlug: system.slug,
        systemName: system.name,
        reviewer,
        reviewDate: reviewDate.toISOString(),
        isReviewed: targetReviewed,
        rows: update.count,
        totalRows: total,
      },
    });

    return update;
  });

  console.log('');
  console.log(
    `Applied: ${result.count} row(s) set isReviewed=${targetReviewed}; audit record written.`,
  );
}

main()
  .catch((error) => {
    console.error('Anatomy review failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
