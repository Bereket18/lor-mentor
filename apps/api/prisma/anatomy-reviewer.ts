/**
 * Grant or revoke the faculty anatomy reviewer flag on a TEACHER account.
 *
 * Run:
 *   npm run anatomy:reviewer --workspace=apps/api -- --email teacher@example.com --grant
 *   npm run anatomy:reviewer --workspace=apps/api -- --email teacher@example.com --grant --confirm
 *   npm run anatomy:reviewer --workspace=apps/api -- --email teacher@example.com --revoke --confirm
 *   npm run anatomy:reviewer --workspace=apps/api -- --all-teachers --grant
 *   npm run anatomy:reviewer --workspace=apps/api -- --all-teachers --grant --confirm
 *
 * The default is a dry run: it prints the current and intended flag without
 * writing. --confirm applies the change. Only TEACHER accounts can be granted
 * the flag; ADMIN/SUPER_ADMIN are blocked by the API role guard regardless.
 * New teachers receive the flag automatically, so --all-teachers is a
 * one-time backfill for accounts created before that policy.
 * This script never prints or changes a password.
 */

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
const grant = argv.includes('--grant');
const revoke = argv.includes('--revoke');
const allTeachers = argv.includes('--all-teachers');

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

function requireEmail(): string {
  const value = readFlagValue('--email')?.trim().toLowerCase();
  if (!value) {
    throw new Error('Missing required --email <address>.');
  }
  return value;
}

async function grantAllTeachers() {
  const teachers = await prisma.user.findMany({
    where: { role: 'TEACHER' },
    orderBy: { email: 'asc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      isAnatomyReviewer: true,
    },
  });

  const pending = teachers.filter((teacher) => !teacher.isAnatomyReviewer);
  console.log(`teachers=${teachers.length}`);
  console.log(`wouldGrant=${pending.length}`);
  console.log(`mode=${confirm ? 'confirm' : 'dry-run'}`);
  for (const teacher of teachers) {
    console.log(
      `${teacher.email} current=${teacher.isAnatomyReviewer}${teacher.isAnatomyReviewer ? '' : ' -> grant'}`,
    );
  }

  if (pending.length === 0) {
    console.log('No change needed.');
    return;
  }

  if (!confirm) {
    console.log(
      `Dry run: ${pending.length} teacher(s) would be granted. Add --confirm to apply.`,
    );
    return;
  }

  for (const teacher of pending) {
    await prisma.user.update({
      where: { id: teacher.id },
      data: { isAnatomyReviewer: true },
    });
    await audit.record({
      action: 'ANATOMY_REVIEWER_GRANT',
      entityType: 'User',
      entityId: teacher.id,
      meta: {
        email: teacher.email,
        isAnatomyReviewer: true,
        source: 'all-teachers-backfill',
      },
    });
  }

  console.log(`Applied: granted reviewer access to ${pending.length} teacher(s).`);
}

async function main() {
  if (grant === revoke) {
    throw new Error('Specify exactly one of --grant or --revoke.');
  }

  if (allTeachers) {
    if (!grant) {
      throw new Error('--all-teachers can only be used with --grant.');
    }
    await grantAllTeachers();
    return;
  }

  const email = requireEmail();
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

  if (grant && user.role !== 'TEACHER') {
    throw new Error(
      `Refusing to grant reviewer access: ${email} has role ${user.role}, not TEACHER.`,
    );
  }

  const next = grant;
  console.log(`email=${user.email}`);
  console.log(`userId=${user.id}`);
  console.log(`name=${user.fullName}`);
  console.log(`role=${user.role}`);
  console.log(`current=${user.isAnatomyReviewer}`);
  console.log(`intended=${next}`);
  console.log(`mode=${confirm ? 'confirm' : 'dry-run'}`);

  if (user.isAnatomyReviewer === next) {
    console.log('No change needed.');
    return;
  }

  if (!confirm) {
    console.log('Dry run: no changes written. Add --confirm to apply.');
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isAnatomyReviewer: next },
    select: { id: true, email: true, isAnatomyReviewer: true },
  });

  await audit.record({
    action: next ? 'ANATOMY_REVIEWER_GRANT' : 'ANATOMY_REVIEWER_REVOKE',
    entityType: 'User',
    entityId: updated.id,
    meta: {
      email: updated.email,
      isAnatomyReviewer: updated.isAnatomyReviewer,
    },
  });

  console.log(
    `Applied: ${updated.email} isAnatomyReviewer=${updated.isAnatomyReviewer}`,
  );
}

main()
  .catch((error) => {
    console.error(
      'Reviewer flag update failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
