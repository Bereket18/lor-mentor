/**
 * Passwordless retention sweep, runnable by an operator.
 *
 * The API also runs this hourly in-process; the script exists for a one-off
 * check, a dry run, or an environment where the timer is disabled.
 *
 * Safety:
 *  - dry run by default; `--apply` is required to delete anything;
 *  - refuses to run without DATABASE_URL;
 *  - uses the same predicate and advisory lock as the scheduler, so it cannot
 *    delete a row the API would keep (in particular, no challenge younger than
 *    the 24-hour issuance window).
 *
 * Usage (inside the API container, after a build):
 *   node dist/src/scripts/auth-cleanup.js            # dry run
 *   node dist/src/scripts/auth-cleanup.js --apply    # delete
 *
 * In development: npm run auth:cleanup
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  challengeCleanupWhere,
  grantCleanupWhere,
  purgeExpiredAuthRows,
} from '../modules/auth/auth-cleanup';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set; refusing to run.');
    process.exit(1);
  }

  const apply = process.argv.slice(2).includes('--apply');
  const now = new Date();
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    if (apply) {
      const result = await purgeExpiredAuthRows(prisma, now);
      if (!result) {
        console.log(
          'Another instance holds the cleanup lock; nothing was deleted.',
        );
      } else {
        console.log(
          `Deleted challenges: ${result.challenges}, grants: ${result.grants} ` +
            `in ${result.durationMs}ms.`,
        );
      }
      return;
    }

    const [challenges, grants] = await Promise.all([
      prisma.authChallenge.count({ where: challengeCleanupWhere(now) }),
      prisma.enrollmentGrant.count({ where: grantCleanupWhere(now) }),
    ]);
    console.log('Passwordless retention (DRY RUN)');
    console.log(`  cutoff:     ${now.toISOString()}`);
    console.log(`  challenges: ${challenges}`);
    console.log(`  grants:     ${grants}`);
    console.log('Dry run only. Re-run with --apply to delete.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    'Passwordless retention failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
