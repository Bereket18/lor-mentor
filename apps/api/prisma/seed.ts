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

// Prisma 7 picks up DATABASE_URL from the environment automatically
// dotenv/config above ensures the .env file is loaded first
const prisma = new PrismaClient();

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
