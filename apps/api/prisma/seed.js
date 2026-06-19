/**
 * Lorcan Medical College — Database Seed (plain Node.js)
 *
 * Uses pg directly so it works regardless of Prisma 7's
 * prisma.config.ts datasource requirement.
 *
 * Run:  node prisma/seed.js
 *   or: npm run db:seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ DATABASE_URL is not set in .env');
  process.exit(1);
}

const BSC_YEARS  = ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
const TVET_YEARS = ['Year 1', 'Year 2', 'Year 3'];

const PROGRAMS = [
  // ── BSC Programs ─────────────────────────────────────────────
  { name: 'Doctor of Medicine',         description: 'Lorcan BSC Program — 5-year MD degree programme',  type: 'BSC'  },
  { name: 'Doctor of Dental Medicine',  description: 'Lorcan BSC Program — 5-year DMD degree programme', type: 'BSC'  },
  { name: 'Bachelor of Dental Science', description: 'Lorcan BSC Program — 4-year BDS degree programme', type: 'BSC'  },
  { name: 'Nursing',                    description: 'Lorcan BSC Program — Bachelor of Science in Nursing', type: 'BSC' },
  // ── TVET Programs ────────────────────────────────────────────
  { name: 'Radiography Technology', description: 'Lorcan TVET Program — Diagnostic Imaging Technology',   type: 'TVET' },
  { name: 'Dental Therapy',         description: 'Lorcan TVET Program — Dental Therapy & Oral Health',    type: 'TVET' },
  { name: 'Clinical Nursing',       description: 'Lorcan TVET Program — Clinical Nursing Practice',       type: 'TVET' },
  { name: 'Clinical Pharmacy',      description: 'Lorcan TVET Program — Clinical Pharmacy & Dispensing',  type: 'TVET' },
  { name: 'Medical Laboratory',     description: 'Lorcan TVET Program — Medical Laboratory Technology',   type: 'TVET' },
];

// Generates a CUID-compatible random ID
function cuid() {
  const ts  = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `c${ts}${rand}`;
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('🌱 Seeding Lorcan Medical College programs...\n');

  let deptCount = 0, yearCount = 0, semCount = 0;

  for (const prog of PROGRAMS) {
    const icon = prog.type === 'BSC' ? '🎓' : '🏥';

    // Upsert department
    const deptRes = await client.query(
      `INSERT INTO "Department" (id, name, description, "isArchived", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, false, NOW(), NOW())
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, "updatedAt" = NOW()
       RETURNING id, name`,
      [cuid(), prog.name, prog.description]
    );
    const dept = deptRes.rows[0];
    deptCount++;
    console.log(`  ✅ ${icon} ${dept.name}  (id: ${dept.id})`);

    const years = prog.type === 'BSC' ? BSC_YEARS : TVET_YEARS;

    for (const label of years) {
      // Check if year already exists
      const existing = await client.query(
        `SELECT id FROM "AcademicYear" WHERE "departmentId" = $1 AND label = $2`,
        [dept.id, label]
      );

      if (existing.rows.length > 0) {
        console.log(`     └─ ${label} (already exists)`);
        continue;
      }

      const yearId = cuid();
      await client.query(
        `INSERT INTO "AcademicYear" (id, "departmentId", label, "isArchived", "createdAt")
         VALUES ($1, $2, $3, false, NOW())`,
        [yearId, dept.id, label]
      );
      yearCount++;

      // Semester 1
      await client.query(
        `INSERT INTO "Semester" (id, "academicYearId", name, "isArchived", "createdAt")
         VALUES ($1, $2, 'Semester 1', false, NOW())`,
        [cuid(), yearId]
      );
      // Semester 2
      await client.query(
        `INSERT INTO "Semester" (id, "academicYearId", name, "isArchived", "createdAt")
         VALUES ($1, $2, 'Semester 2', false, NOW())`,
        [cuid(), yearId]
      );
      semCount += 2;

      console.log(`     └─ ${label} → Semester 1 + Semester 2 ✨`);
    }
  }

  await client.end();

  console.log('\n🎉 Seed complete!');
  console.log(`   ${deptCount} programs (departments) seeded`);
  console.log(`   ${yearCount} academic years created`);
  console.log(`   ${semCount} semesters created`);
}

main().catch((e) => { console.error('❌ Seed failed:', e.message); process.exit(1); });
