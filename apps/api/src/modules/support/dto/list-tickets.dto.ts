import { IsIn, IsOptional } from 'class-validator';

/** Statuses a ticket can be filtered by (mirrors the Prisma enum). */
export const SUPPORT_STATUSES = [
  'OPEN',
  'AWAITING_STUDENT',
  'RESOLVED',
  'CLOSED',
] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/**
 * Optional filter for the student's own ticket list. Students never filter by
 * another user: the controller passes their id, not a query parameter.
 */
export class ListTicketsDto {
  @IsOptional()
  @IsIn(SUPPORT_STATUSES, {
    message: `status must be one of: ${SUPPORT_STATUSES.join(', ')}`,
  })
  status?: SupportStatus;
}
