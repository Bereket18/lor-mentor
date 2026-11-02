/**
 * Read-only status helper for the faculty anatomy reviewer flag.
 *
 * Reviewer access is granted and revoked ONLY by an administrator through
 * Admin -> Users -> "Manage Reviewer Access". This script no longer writes the
 * flag (there is intentionally no --all-teachers backfill), because automatically
 * granting sign-off rights to every TEACHER contradicts the college-approved
 * review policy.
 *
 * Run:
 *   npm run anatomy:reviewer --workspace=apps/api -- --email teacher@example.com
 *   npm run anatomy:reviewer --workspace=apps/api
 *
 * This script never prints or changes a password.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const argv = process.argv.slice(2);

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

async function main() {
  const writesRequested = ['--grant', '--revoke', '--confirm', '--all-teachers'];
  if (argv.some((argument) => writesRequested.includes(argument))) {
    throw new Error(
      'This script is read-only. Grant or revoke reviewer access in Admin -> Users -> Manage Reviewer Access.',
    );
  }

  const email = readFlagValue('--email')?.trim().toLowerCase();
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isAnatomyReviewer: true,
      },
    });

    if (!user) {
      throw new Error(`No user exists with email ${email}.`);
    }

    console.log(`email=${user.email}`);
    console.log(`userId=${user.id}`);
    console.log(`name=${user.fullName}`);
    console.log(`role=${user.role}`);
    console.log(`isAnatomyReviewer=${user.isAnatomyReviewer}`);
    return;
  }

  const teachers = await prisma.user.findMany({
    where: { role: 'TEACHER' },
    orderBy: { email: 'asc' },
    select: { email: true, isAnatomyReviewer: true },
  });

  console.log(`teachers=${teachers.length}`);
  console.log(
    `reviewers=${teachers.filter((teacher) => teacher.isAnatomyReviewer).length}`,
  );
  for (const teacher of teachers) {
    console.log(`${teacher.email} isAnatomyReviewer=${teacher.isAnatomyReviewer}`);
  }
  console.log(
    'Change reviewer access in Admin -> Users -> Manage Reviewer Access.',
  );
}

main()
  .catch((error) => {
    console.error(
      'Reviewer flag lookup failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
