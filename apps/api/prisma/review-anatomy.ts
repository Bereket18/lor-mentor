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
 *
 * Faculty review packet (read-only):
 *   npm run anatomy:review --workspace=apps/api -- \
 *     --system urinary --export urinary-review.json
 *   npm run anatomy:review --workspace=apps/api -- \
 *     --system urinary --export urinary-review.md
 *
 * Fill in the JSON packet's reviewer, review date, and per-structure decisions,
 * then validate it before the separate sign-off:
 *   npm run anatomy:review --workspace=apps/api -- \
 *     --system urinary --validate urinary-review.json
 *
 * --export and --validate never change teaching text, isReviewed, or
 * isPublished. They refuse to run with --confirm or --revoke.
 */

import 'reflect-metadata';
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
const REVIEW_DECISIONS = ['approved', 'approved-with-edits', 'rejected'] as const;

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

type AnatomySystemRow = {
  id: string;
  slug: string;
  name: string;
  latinName: string | null;
  description: string;
  modelUrl: string | null;
  isSample: boolean;
  isPublished: boolean;
  sortOrder: number;
};

type AnatomyStructureRow = {
  slug: string;
  name: string;
  latinName: string | null;
  summary: string;
  location: string | null;
  function: string | null;
  bloodSupply: string | null;
  clinicalNotes: string | null;
  meshName: string | null;
  layer: string | null;
  relatedSlugs: string[];
  references: string[];
  sortOrder: number;
  isReviewed: boolean;
};

function teachingText(structure: AnatomyStructureRow) {
  return {
    summary: structure.summary,
    location: structure.location,
    function: structure.function,
    bloodSupply: structure.bloodSupply,
    clinicalNotes: structure.clinicalNotes,
  };
}

function contentHash(structure: AnatomyStructureRow): string {
  return createHash('sha256')
    .update(JSON.stringify(teachingText(structure)))
    .digest('hex');
}

function buildReviewPacket(
  system: AnatomySystemRow,
  structures: AnatomyStructureRow[],
) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    warning:
      'This packet does not change teaching text, isReviewed, or isPublished. ' +
      'Fill in review.reviewer, review.reviewDate, and one decision per ' +
      'structure, then run --validate. Sign-off remains a separate --confirm step.',
    system: {
      slug: system.slug,
      name: system.name,
      latinName: system.latinName,
      description: system.description,
      modelUrl: system.modelUrl,
      isSample: system.isSample,
      isPublished: system.isPublished,
      sortOrder: system.sortOrder,
    },
    review: {
      reviewer: '',
      reviewDate: '',
      decisions: Object.fromEntries(
        structures.map((structure) => [
          structure.slug,
          { decision: '', comments: '' },
        ]),
      ),
    },
    structures: structures.map((structure) => ({
      slug: structure.slug,
      name: structure.name,
      latinName: structure.latinName,
      meshName: structure.meshName,
      layer: structure.layer,
      relatedSlugs: structure.relatedSlugs,
      references: structure.references,
      sortOrder: structure.sortOrder,
      isReviewed: structure.isReviewed,
      contentSha256: contentHash(structure),
      teaching: teachingText(structure),
    })),
  };
}

function buildMarkdownPacket(
  system: AnatomySystemRow,
  structures: AnatomyStructureRow[],
): string {
  const reviewed = structures.filter((structure) => structure.isReviewed).length;
  const lines = [
    `# Anatomy faculty review packet — ${system.name}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '> **Read-only export.** This packet does not change teaching text,',
    '> `isReviewed`, or `isPublished`. Faculty decisions are recorded in the',
    '> companion JSON packet and checked with `--validate`; sign-off is a',
    '> separate `--confirm` step. Every structure remains unreviewed until then.',
    '',
    '## System',
    '',
    `- Slug: \`${system.slug}\``,
    `- Latin name: ${system.latinName ?? '_not set_'}`,
    `- Description: ${system.description}`,
    `- Model: ${system.modelUrl ?? '_no 3D model_'}`,
    `- Publication: ${system.isPublished ? 'published' : 'unpublished draft'}`,
    `- Sample: ${system.isSample ? 'yes' : 'no'}`,
    `- Structures: ${structures.length} total; ${reviewed} marked reviewed; ${structures.length - reviewed} pending`,
    '',
    '## Review checklist',
    '',
    '- [ ] Every structure below has a source-backed review decision.',
    '- [ ] Rejected or edited rows are listed in the review comments.',
    '- [ ] The completed JSON packet passes `--validate`.',
    '- [ ] A named faculty reviewer and review date are recorded.',
    '- [ ] No teaching text, `isReviewed`, or `isPublished` value was changed by this export.',
    '',
    '## Structures',
    '',
  ];

  for (const [index, structure] of structures.entries()) {
    const teaching = teachingText(structure);
    lines.push(
      `### ${index + 1}. ${structure.name} (\`${structure.slug}\`)`,
      '',
      `- Mesh: ${structure.meshName ?? '_text-only (no 3D model)_'}`,
      `- Layer: ${structure.layer ?? '_not set_'}`,
      `- References: ${structure.references.length ? structure.references.join('; ') : '_none_'}`,
      `- Related: ${structure.relatedSlugs.length ? structure.relatedSlugs.join(', ') : '_none_'}`,
      `- Current review state: ${structure.isReviewed ? 'reviewed' : '**pending**'}`,
      `- Teaching-text SHA-256: \`${contentHash(structure)}\``,
      '',
      '#### Summary',
      '',
      teaching.summary,
      '',
      '#### Location',
      '',
      teaching.location ?? '_not set_',
      '',
      '#### Function',
      '',
      teaching.function ?? '_not set_',
      '',
      '#### Blood supply',
      '',
      teaching.bloodSupply ?? '_not set_',
      '',
      '#### Clinical notes',
      '',
      teaching.clinicalNotes ?? '_not set_',
      '',
      '#### Faculty decision',
      '',
      '- [ ] approved',
      '- [ ] approved-with-edits',
      '- [ ] rejected',
      '',
      'Comments:',
      '',
      '> ',
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}

function validateReviewPacket(
  filePath: string,
  system: AnatomySystemRow,
  structures: AnatomyStructureRow[],
): void {
  const packet = JSON.parse(readFileSync(resolve(filePath), 'utf8')) as {
    schemaVersion?: number;
    system?: { slug?: string };
    review?: {
      reviewer?: string;
      reviewDate?: string;
      decisions?: Record<string, { decision?: string; comments?: string }>;
    };
    structures?: Array<{ slug?: string; contentSha256?: string }>;
  };

  const errors: string[] = [];
  if (packet.schemaVersion !== 1) {
    errors.push('Packet schemaVersion must be 1.');
  }
  if (packet.system?.slug !== system.slug) {
    errors.push(
      `Packet system slug must be "${system.slug}" (got "${packet.system?.slug ?? ''}").`,
    );
  }

  const reviewer = packet.review?.reviewer?.trim() ?? '';
  if (!reviewer) errors.push('review.reviewer is required.');

  const reviewDate = packet.review?.reviewDate?.trim() ?? '';
  if (!reviewDate) {
    errors.push('review.reviewDate is required (YYYY-MM-DD).');
  } else {
    try {
      parseReviewDate(reviewDate);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const dbBySlug = new Map(structures.map((structure) => [structure.slug, structure]));
  const packetStructures = Array.isArray(packet.structures)
    ? packet.structures
    : [];
  const packetBySlug = new Map(
    packetStructures.map((structure) => [structure.slug ?? '', structure]),
  );

  for (const structure of structures) {
    const packetStructure = packetBySlug.get(structure.slug);
    if (!packetStructure) {
      errors.push(`Packet is missing structure "${structure.slug}".`);
    } else if (packetStructure.contentSha256 !== contentHash(structure)) {
      errors.push(
        `Teaching text for "${structure.slug}" changed since the packet was generated; export a fresh packet.`,
      );
    }

    const decision = packet.review?.decisions?.[structure.slug];
    if (!decision || !decision.decision) {
      errors.push(`Missing review decision for "${structure.slug}".`);
    } else if (
      !(REVIEW_DECISIONS as readonly string[]).includes(decision.decision)
    ) {
      errors.push(
        `Invalid decision for "${structure.slug}": "${decision.decision}". Use ${REVIEW_DECISIONS.join(', ')}.`,
      );
    } else if (
      decision.decision === 'rejected' &&
      !decision.comments?.trim()
    ) {
      errors.push(`Rejected structure "${structure.slug}" needs a comment.`);
    }
  }

  for (const slug of packetBySlug.keys()) {
    if (slug && !dbBySlug.has(slug)) {
      errors.push(`Packet contains unknown structure "${slug}".`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Review packet is not complete:\n- ${errors.join('\n- ')}`);
  }

  console.log(
    `Review packet is complete: ${structures.length} structures, reviewer "${reviewer}", date ${reviewDate}.`,
  );
  console.log('No database rows were changed.');
  console.log(
    'After faculty sign-off, run the existing --confirm step to record isReviewed and the audit entry.',
  );
}

async function main() {
  const systemSlug = requireFlag('--system');
  const exportPath = readFlagValue('--export');
  const validatePath = readFlagValue('--validate');

  if (exportPath && validatePath) {
    throw new Error('Use either --export or --validate, not both.');
  }
  if ((exportPath || validatePath) && (confirm || revoke)) {
    throw new Error(
      '--export/--validate are read-only and cannot be combined with --confirm or --revoke.',
    );
  }

  const system = await prisma.anatomySystem.findUnique({
    where: { slug: systemSlug },
  });
  if (!system) {
    throw new Error(`Anatomy system "${systemSlug}" does not exist.`);
  }

  const structures = await prisma.anatomyStructure.findMany({
    where: { systemId: system.id },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  if (exportPath) {
    const packet = buildReviewPacket(system, structures);
    const output = exportPath.toLowerCase().endsWith('.json')
      ? `${JSON.stringify(packet, null, 2)}\n`
      : buildMarkdownPacket(system, structures);
    const resolved = resolve(exportPath);
    writeFileSync(resolved, output, 'utf8');
    console.log(
      `Exported ${structures.length} structures for "${system.slug}" to ${resolved}.`,
    );
    console.log(
      'Read-only export: no teaching text, isReviewed, or isPublished value was changed.',
    );
    return;
  }

  if (validatePath) {
    validateReviewPacket(validatePath, system, structures);
    return;
  }

  const reviewer = requireFlag('--reviewer');
  const reviewDateValue = requireFlag('--date');
  const reviewDate = parseReviewDate(reviewDateValue);

  const total = structures.length;
  const currentlyReviewed = structures.filter(
    (structure) => structure.isReviewed,
  ).length;

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
