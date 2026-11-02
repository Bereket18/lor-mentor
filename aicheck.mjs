import { PrismaClient } from './node_modules/.prisma/client/index.js';
import { PrismaPg } from './node_modules/@prisma/adapter-pg/dist/index.js';
import pg from './node_modules/pg/lib/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required (set it in the environment or run with node --env-file=.env)');
}
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const statusGroups = await prisma.aiContent.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  console.log('\n=== AiContent by status ===');
  console.table(statusGroups);

  const failed = await prisma.aiContent.findMany({
    where: { status: { in: ['FAILED', 'PROCESSING'] } },
    select: { status: true, error: true, materialId: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  console.log('\n=== Failed / Stuck jobs ===');
  console.table(failed);

  const materialCount = await prisma.material.count();
  const aiCount = await prisma.aiContent.count();
  console.log(`\nMaterials: ${materialCount}  |  AiContent rows: ${aiCount}`);

  const recentHistory = await prisma.aiHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { prompt: true, response: true, createdAt: true },
  });
  console.log('\n=== Recent AI tutor history (last 5) ===');
  console.table(recentHistory);
}

main().catch(console.error).finally(() => prisma.$disconnect());
