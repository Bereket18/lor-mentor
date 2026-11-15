import type { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Where support attachments live when SUPPORT_UPLOAD_DIR is not configured.
 *
 * Relative to the API working directory (`apps/api` in dev, `/app/apps/api` in
 * the container), so it lands inside the `uploads` volume rather than inside
 * any web-served directory.
 */
export const DEFAULT_SUPPORT_UPLOAD_DIR = path.join('uploads', 'support');

/**
 * Validates SUPPORT_UPLOAD_DIR. Returns an error message, or null when valid.
 *
 * Two rules, both about safety rather than taste:
 *  - no `..` segments: the directory is created at boot, and a traversal path
 *    would let a typo write outside the mounted volume;
 *  - never inside a `public` directory: attachments are private files and are
 *    served only through the authorised API endpoint. A path under a web root
 *    (e.g. apps/web/public) would make them publicly fetchable by URL.
 */
export function validateSupportUploadDir(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    return 'SUPPORT_UPLOAD_DIR must be a directory path';
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.split(/[\\/]+/).includes('..')) {
    return 'SUPPORT_UPLOAD_DIR must not contain ".." path segments';
  }
  const segments = trimmed
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  if (segments.includes('public')) {
    return 'SUPPORT_UPLOAD_DIR must not point inside a public directory';
  }
  return null;
}

/**
 * Absolute path of the attachment directory for this process.
 *
 * Throws on an invalid value instead of silently writing somewhere unexpected;
 * env validation already refuses to boot with one, so this is the second line
 * of defence (and the script uses it directly).
 */
export function resolveSupportUploadDir(configured?: string | null): string {
  const value = (configured ?? '').trim() || DEFAULT_SUPPORT_UPLOAD_DIR;
  const problem = validateSupportUploadDir(value);
  if (problem) throw new Error(problem);
  return path.isAbsolute(value)
    ? path.normalize(value)
    : path.resolve(process.cwd(), value);
}

/** Creates the directory (0700) if it is missing. Idempotent. */
export function ensureSupportUploadDir(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
}

/**
 * Deletes stored files by name. Names are basenamed, so a database value can
 * never escape `directory`; a missing file is not an error (a previous purge
 * may have run).
 */
export async function removeAttachmentFiles(
  directory: string,
  storedNames: string[],
): Promise<number> {
  let removed = 0;
  await Promise.all(
    storedNames.map(async (name) => {
      try {
        await fs.promises.rm(path.join(directory, path.basename(name)), {
          force: true,
        });
        removed += 1;
      } catch (error) {
        console.warn(
          `Could not delete support attachment ${name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }),
  );
  return removed;
}

export interface SupportPurgeSummary {
  /** Distinct closed tickets that still have attachment rows. */
  tickets: number;
  /** Attachment rows selected by the cutoff. */
  attachments: number;
  /** Files actually deleted (0 on a dry run). */
  files: number;
  ticketNumbers: number[];
}

/**
 * Retention purge shared by the service and the CLI script.
 *
 * Selects attachments whose ticket has been CLOSED before `cutoff` and, unless
 * `dryRun`, deletes the files and then their rows. `closedAt` is authoritative;
 * the `updatedAt` fallback covers rows closed before this column existed.
 */
export async function purgeClosedAttachments(
  prisma: PrismaClient,
  directory: string,
  cutoff: Date,
  options: { dryRun: boolean },
): Promise<SupportPurgeSummary> {
  const rows = await prisma.supportAttachment.findMany({
    where: {
      message: {
        ticket: {
          status: 'CLOSED',
          OR: [
            { closedAt: { lt: cutoff } },
            { closedAt: null, updatedAt: { lt: cutoff } },
          ],
        },
      },
    },
    select: {
      id: true,
      storedName: true,
      message: { select: { ticket: { select: { id: true, number: true } } } },
    },
  });

  const ticketIds = new Set(rows.map((row) => row.message.ticket.id));
  const ticketNumbers = Array.from(
    new Set(rows.map((row) => row.message.ticket.number)),
  ).sort((a, b) => a - b);

  let files = 0;
  if (!options.dryRun && rows.length > 0) {
    files = await removeAttachmentFiles(
      directory,
      rows.map((row) => row.storedName),
    );
    await prisma.supportAttachment.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  }

  return {
    tickets: ticketIds.size,
    attachments: rows.length,
    files,
    ticketNumbers,
  };
}
