/**
 * Lorcan Medical College — Database Seed
 *
 * Seeds all official programs as departments with their
 * academic years (Year 1 – 5 for BSC, Year 1 – 3 for TVET).
 *
 * Run: npx ts-node prisma/seed.ts
 * Or:  npm run db:seed
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

// Prisma 7 requires a driver adapter (mirrors PrismaService). dotenv/config
// above ensures DATABASE_URL is loaded from .env first.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Lorcan Programs ────────────────────────────────────────────
// BSC programs run 5 years, TVET programs run 3 years
const BSC_YEARS  = ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
const TVET_YEARS = ['Year 1', 'Year 2', 'Year 3'];

const PROGRAMS: { name: string; description: string; type: 'BSC' | 'TVET' }[] = [
  // ── Lorcan BSC Programs ───────────────────────────────────────
  {
    name: 'Doctor of Medicine',
    description: 'Lorcan BSC Program — 5-year MD degree programme',
    type: 'BSC',
  },
  {
    name: 'Doctor of Dental Medicine',
    description: 'Lorcan BSC Program — 5-year DMD degree programme',
    type: 'BSC',
  },
  {
    name: 'Bachelor of Dental Science',
    description: 'Lorcan BSC Program — 4-year BDS degree programme',
    type: 'BSC',
  },
  {
    name: 'Nursing',
    description: 'Lorcan BSC Program — Bachelor of Science in Nursing',
    type: 'BSC',
  },

  // ── Lorcan TVET Programs ──────────────────────────────────────
  {
    name: 'Radiography Technology',
    description: 'Lorcan TVET Program — Diagnostic Imaging Technology',
    type: 'TVET',
  },
  {
    name: 'Dental Therapy',
    description: 'Lorcan TVET Program — Dental Therapy & Oral Health',
    type: 'TVET',
  },
  {
    name: 'Clinical Nursing',
    description: 'Lorcan TVET Program — Clinical Nursing Practice',
    type: 'TVET',
  },
  {
    name: 'Clinical Pharmacy',
    description: 'Lorcan TVET Program — Clinical Pharmacy & Dispensing',
    type: 'TVET',
  },
  {
    name: 'Medical Laboratory',
    description: 'Lorcan TVET Program — Medical Laboratory Technology',
    type: 'TVET',
  },
];

async function main() {
  console.log('🌱 Seeding Lorcan Medical College programs...\n');

  for (const program of PROGRAMS) {
    // Upsert department — idempotent so re-running is safe
    const dept = await prisma.department.upsert({
      where: { name: program.name },
      update: { description: program.description },
      create: {
        name: program.name,
        description: program.description,
      },
    });

    console.log(`  ✅ ${program.type === 'BSC' ? '🎓' : '🏥'} ${dept.name}`);

    const years = program.type === 'BSC' ? BSC_YEARS : TVET_YEARS;

    for (const label of years) {
      // Check if this year already exists to keep the seed idempotent
      const existing = await prisma.academicYear.findFirst({
        where: { departmentId: dept.id, label },
      });

      if (!existing) {
        const year = await prisma.academicYear.create({
          data: { departmentId: dept.id, label },
        });

        // Create Semester 1 and Semester 2 for each year
        await prisma.semester.createMany({
          data: [
            { academicYearId: year.id, name: 'Semester 1' },
            { academicYearId: year.id, name: 'Semester 2' },
          ],
        });

        console.log(`     └─ ${label} (Sem 1 + Sem 2)`);
      } else {
        console.log(`     └─ ${label} (already exists)`);
      }
    }
  }

  // ── Bootstrap super admin (break-glass) ───────────────────────
  // Created idempotently from env vars. Never hardcode real secrets — set
  // SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME in .env.
  // The fallback defaults exist only so a fresh DB has a usable login; change
  // the password immediately. On re-runs we do NOT overwrite an existing
  // password (so a rotated one survives reseeding).
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@lorcan.edu.et';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe!2026';
  const adminName = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!process.env.SUPER_ADMIN_EMAIL || !process.env.SUPER_ADMIN_PASSWORD) {
    console.warn(
      '\n⚠️  SUPER_ADMIN_EMAIL/PASSWORD not set in .env — using documented ' +
        'defaults. Set real values and change the password immediately.',
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'SUPER_ADMIN', isActive: true, isEmailVerified: true },
    create: {
      email: adminEmail,
      passwordHash,
      fullName: adminName,
      role: 'SUPER_ADMIN',
      isActive: true,
      isEmailVerified: true,
    },
  });
  console.log(`\n👑 Super admin ready: ${superAdmin.email}`);

  console.log('\n🎉 Seed complete!');
  console.log(`   ${PROGRAMS.length} programs seeded`);
  console.log(
    `   BSC: ${PROGRAMS.filter((p) => p.type === 'BSC').length} programs`,
  );
  console.log(
    `   TVET: ${PROGRAMS.filter((p) => p.type === 'TVET').length} programs`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
