/**
 * Policy numbers for student support tickets.
 *
 * Kept in one file so the limits are greppable and so the service tests can
 * import the exact values instead of hard-coding them in two places.
 */

/** A ticket is "open work" until it is resolved or closed. */
export const OPEN_TICKET_STATUSES = ['OPEN', 'AWAITING_STUDENT'] as const;

/** More than this many open tickets and the student must wait for a reply. */
export const MAX_OPEN_TICKETS = 3;

/** Anti-spam ceiling: a student cannot file more than this in a rolling day. */
export const MAX_TICKETS_PER_DAY = 5;

/**
 * How long a student can pull a RESOLVED ticket back into the queue by
 * replying. After this the thread is read-only and a fresh ticket is the
 * right move (it keeps each conversation with its own resolution history).
 */
export const RESOLVE_REOPEN_WINDOW_DAYS = 14;

/** Staff bulk action: close RESOLVED tickets untouched for this long. */
export const RESOLVED_AUTO_CLOSE_DAYS = 7;

/** Retention: attachment files are deleted this many days after closure. */
export const ATTACHMENT_RETENTION_DAYS = 180;

/** Attachment policy (bytes, count, pixels). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;
/** Guards the re-encoder against decompression bombs before sharp allocates. */
export const MAX_ATTACHMENT_PIXELS = 40_000_000;
export const ALLOWED_ATTACHMENT_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const SUPPORT_TICKET_NUMBER_PREFIX = 'T-';
export const SUPPORT_TICKET_NUMBER_PAD = 6;

/** `T-000123` - the only form a ticket number is ever shown in. */
export function formatTicketNumber(number: number): string {
  return `${SUPPORT_TICKET_NUMBER_PREFIX}${String(number).padStart(
    SUPPORT_TICKET_NUMBER_PAD,
    '0',
  )}`;
}

/** Parses `T-123`, `t 123`, `#123` or `123` back to the integer, else null. */
export function parseTicketNumber(value: string): number | null {
  const match = /^(?:t[-\s]?|#)?(\d{1,9})$/i.exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
