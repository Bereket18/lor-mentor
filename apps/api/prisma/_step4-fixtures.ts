/**
 * Disposable Step 4 Playwright fixtures.
 *
 * This file is local test scaffolding only and is not part of the product
 * build. It creates a published sample system plus temporary users, or removes
 * exactly those rows again. Passwords are random, written only to the fixture
 * file in the OS temp directory, and never printed.
 *
 * Run from apps/api:
 *   npx ts-node prisma/_step4-fixtures.ts setup
 *   npx ts-node prisma/_step4-fixtures.ts cleanup
 */

import 'dotenv/config';
import { randomBytes } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const FIXTURE_FILE =
  process.env.STEP4_FIXTURE_FILE ??
  join(process.env.TEMP ?? tmpdir(), 'opencode', 'anatomy-step4-fixture.json');

const RUN_ID = process.env.STEP4_RUN_ID ?? `step4-${Date.now()}`;
const SYSTEM_SLUG = `e2e-anatomy-review-${RUN_ID}`.toLowerCase();
const EMAIL_PREFIX = `e2e-anatomy-review-${RUN_ID}`.toLowerCase();

type FixtureUser = {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN';
  isAnatomyReviewer: boolean;
};

type FixtureFile = {
  runId: string;
  systemId: string;
  systemSlug: string;
  systemName: string;
  reviewedStructureId: string;
  reviewedStructureSlug: string;
  draftStructureId: string;
  draftStructureSlug: string;
  users: Record<string, FixtureUser>;
};

function fixturePath(): string {
  mkdirSync(join(process.env.TEMP ?? tmpdir(), 'opencode'), {
    recursive: true,
  });
  return FIXTURE_FILE;
}

function loadFixture(): FixtureFile {
  return JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as FixtureFile;
}

function assertDisposable(slug: string, emails: string[]) {
  if (!slug.startsWith('e2e-anatomy-review-')) {
    throw new Error(`Refusing to touch unexpected system slug: ${slug}`);
  }
  for (const email of emails) {
    if (!email.startsWith('e2e-anatomy-review-')) {
      throw new Error(`Refusing to touch unexpected user email: ${email}`);
    }
  }
}

async function createUser(input: {
  key: string;
  email: string;
  fullName: string;
  role: FixtureUser['role'];
  isAnatomyReviewer: boolean;
  password: string;
}): Promise<FixtureUser> {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      isActive: true,
      isEmailVerified: true,
      isAnatomyReviewer: input.isAnatomyReviewer,
    },
    select: { id: true, email: true, fullName: true, role: true },
  });

  return {
    id: user.id,
    email: user.email,
    password: input.password,
    fullName: user.fullName,
    role: input.role,
    isAnatomyReviewer: input.isAnatomyReviewer,
  };
}

async function setup() {
  const existing = await prisma.anatomySystem.findUnique({
    where: { slug: SYSTEM_SLUG },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Fixture system already exists: ${SYSTEM_SLUG}`);
  }

  const passwordFor = () => randomBytes(24).toString('base64url');

  const reviewer = await createUser({
    key: 'reviewer',
    email: `${EMAIL_PREFIX}-reviewer@example.com`,
    fullName: 'E2E Reviewer',
    role: 'TEACHER',
    isAnatomyReviewer: true,
    password: passwordFor(),
  });
  const teacher = await createUser({
    key: 'teacher',
    email: `${EMAIL_PREFIX}-teacher@example.com`,
    fullName: 'E2E Non-reviewer Teacher',
    role: 'TEACHER',
    isAnatomyReviewer: false,
    password: passwordFor(),
  });
  const student = await createUser({
    key: 'student',
    email: `${EMAIL_PREFIX}-student@example.com`,
    fullName: 'E2E Student',
    role: 'STUDENT',
    isAnatomyReviewer: false,
    password: passwordFor(),
  });
  const admin = await createUser({
    key: 'admin',
    email: `${EMAIL_PREFIX}-admin@example.com`,
    fullName: 'E2E Admin',
    role: 'ADMIN',
    isAnatomyReviewer: false,
    password: passwordFor(),
  });
  const superAdmin = await createUser({
    key: 'superAdmin',
    email: `${EMAIL_PREFIX}-super-admin@example.com`,
    fullName: 'E2E Super Admin',
    role: 'SUPER_ADMIN',
    isAnatomyReviewer: false,
    password: passwordFor(),
  });

  const system = await prisma.anatomySystem.create({
    data: {
      slug: SYSTEM_SLUG,
      name: 'E2E Faculty Review Fixture',
      description:
        'Disposable Playwright fixture for local faculty review verification.',
      modelUrl: null,
      isSample: true,
      isPublished: true,
      sortOrder: 9999,
      structures: {
        create: [
          {
            slug: 'reviewed-fixture-structure',
            name: 'Reviewed fixture structure',
            summary: 'Fixture summary for an already reviewed structure.',
            location: 'Fixture location.',
            function: 'Fixture function.',
            bloodSupply: 'Fixture blood supply.',
            clinicalNotes: 'Fixture clinical notes.',
            meshName: null,
            layer: 'fixture-layer',
            references: ['E2E fixture reference'],
            relatedSlugs: ['draft-fixture-structure'],
            sortOrder: 1,
            isReviewed: true,
            reviewedAt: new Date(Date.now() - 60_000),
            reviewedById: reviewer.id,
          },
          {
            slug: 'draft-fixture-structure',
            name: 'Draft fixture structure',
            summary: 'Draft fixture summary awaiting review.',
            location: null,
            function: null,
            bloodSupply: null,
            clinicalNotes: null,
            meshName: null,
            layer: 'fixture-layer',
            references: [],
            relatedSlugs: ['reviewed-fixture-structure'],
            sortOrder: 2,
            isReviewed: false,
          },
        ],
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      structures: { select: { id: true, slug: true } },
    },
  });

  const reviewed = system.structures.find(
    (structure) => structure.slug === 'reviewed-fixture-structure',
  );
  const draft = system.structures.find(
    (structure) => structure.slug === 'draft-fixture-structure',
  );
  if (!reviewed || !draft) throw new Error('Fixture structures missing.');

  const fixture: FixtureFile = {
    runId: RUN_ID,
    systemId: system.id,
    systemSlug: system.slug,
    systemName: system.name,
    reviewedStructureId: reviewed.id,
    reviewedStructureSlug: reviewed.slug,
    draftStructureId: draft.id,
    draftStructureSlug: draft.slug,
    users: { reviewer, teacher, student, admin, superAdmin },
  };

  writeFileSync(fixturePath(), JSON.stringify(fixture, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });

  console.log(
    `Fixture created: 1 published sample system, 2 structures, 5 users.`,
  );
  console.log(`Fixture file: ${fixturePath()}`);
  console.log('No passwords were printed.');
}

async function cleanup() {
  let fixture: FixtureFile;
  try {
    fixture = loadFixture();
  } catch {
    console.log(`No fixture file found at ${FIXTURE_FILE}; nothing to clean.`);
    return;
  }

  const emails = Object.values(fixture.users).map((user) => user.email);
  assertDisposable(fixture.systemSlug, emails);

  // Fixture audit rows are test scaffolding, not product history. Remove every
  // row created by an E2E review run before deleting the parent rows.
  const auditDelete = await prisma.auditLog.deleteMany({
    where: {
      action: { startsWith: 'ANATOMY_' },
      meta: {
        path: ['systemSlug'],
        string_starts_with: 'e2e-anatomy-review-',
      },
    },
  });

  // Delete the system first: structures cascade, and revisions cascade from
  // structures. Then delete the temporary users. Any remaining audit rows keep
  // their history because AuditLog.actorId is ON DELETE SET NULL.
  const systemDelete = await prisma.anatomySystem.deleteMany({
    where: { slug: fixture.systemSlug },
  });
  const userDelete = await prisma.user.deleteMany({
    where: { email: { in: emails } },
  });

  const remaining = await prisma.user.count({
    where: { email: { in: emails } },
  });
  if (remaining !== 0) throw new Error('Temporary users still exist.');

  console.log(
    `Cleanup complete: removed ${auditDelete.count} fixture audit row(s), ${systemDelete.count} fixture system(s), and ${userDelete.count} temporary user(s).`,
  );
  rmSync(FIXTURE_FILE, { force: true });
  console.log(`Removed fixture file: ${FIXTURE_FILE}`);
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'setup') {
    await setup();
  } else if (mode === 'cleanup') {
    await cleanup();
  } else {
    throw new Error('Usage: _step4-fixtures.ts setup|cleanup');
  }
}

main()
  .catch((error) => {
    console.error(
      'Step 4 fixture command failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
