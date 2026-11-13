/**
 * Support attachment retention.
 *
 * Deletes attachment files and their metadata for tickets that were CLOSED
 * more than ATTACHMENT_RETENTION_DAYS (180) days ago. Attachments are the one
 * piece of ticket data that never leaves the private upload volume, so this is
 * the job that makes "we keep them for six months" true.
 *
 * Safety:
 *  - dry run by default; `--apply` is required to delete anything;
 *  - refuses to run without DATABASE_URL;
 *  - only CLOSED tickets are considered, and `closedAt` (not `updatedAt`) is
 *    the cutoff, so an old ticket someone reopened is skipped.
 *
 * Usage (inside the API container, after a build):
 *   node dist/src/scripts/support-retention.js            # dry run
 *   node dist/src/scripts/support-retention.js --apply    # delete
 *   node dist/src/scripts/support-retention.js --apply --days=90
 *
 * In development: npm run support:retention -- --dry-run
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ATTACHMENT_RETENTION_DAYS } from '../modules/support/support.constants';
import {
  ensureSupportUploadDir,
  purgeClosedAttachments,
  resolveSupportUploadDir,
} from '../modules/support/support-attachments.storage';

interface Options {
  dryRun: boolean;
  days: number;
}

function parseArgs(argv: string[]): Options {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      [
        'Support attachment retention',
        '',
        '  --dry-run   report what would be deleted (default)',
        '  --apply     delete files and rows',
        `  --days=N    closure age in days (default ${ATTACHMENT_RETENTION_DAYS})`,
        '',
        'Only CLOSED tickets are eligible. Run the dry run first and read it.',
      ].join('\n'),
    );
    process.exit(0);
  }

  const daysArg = argv.find((arg) => /^--days=\d+$/.test(arg));
  const days = daysArg
    ? Number(daysArg.split('=')[1])
    : ATTACHMENT_RETENTION_DAYS;
  if (!Number.isSafeInteger(days) || days < 1) {
    console.error('--days must be a positive integer');
    process.exit(1);
  }

  return { dryRun: !argv.includes('--apply'), days };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set; refusing to run.');
    process.exit(1);
  }

  const options = parseArgs(process.argv.slice(2));
  const directory = resolveSupportUploadDir(process.env.SUPPORT_UPLOAD_DIR);
  if (!options.dryRun) ensureSupportUploadDir(directory);

  const cutoff = new Date(Date.now() - options.days * 86_400_000);
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    console.log(
      `Support attachment retention (${options.dryRun ? 'DRY RUN' : 'APPLY'})`,
    );
    console.log(`  directory: ${directory}`);
    console.log(
      `  cutoff:    ${cutoff.toISOString()} (closed > ${options.days} days)`,
    );

    const result = await purgeClosedAttachments(prisma, directory, cutoff, {
      dryRun: options.dryRun,
    });

    console.log(
      `  tickets: ${result.tickets}, attachments: ${result.attachments}, files deleted: ${result.files}`,
    );
    if (result.ticketNumbers.length > 0) {
      console.log(
        `  tickets: ${result.ticketNumbers
          .map((number) => `T-${String(number).padStart(6, '0')}`)
          .join(', ')}`,
      );
    }
    console.log(
      options.dryRun ? 'Dry run only. Re-run with --apply to delete.' : 'Done.',
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    'Support retention failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
