import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Retention and scheduling for passwordless rows (P1-4).
 *
 * Challenges and enrolment grants are short-lived by design, but nothing
 * removed them: every sign-in attempt left a row forever. This module is the
 * single definition of "old enough to delete", shared by the scheduler and the
 * operator script so the two can never disagree.
 */

/** How often an instance attempts a sweep. */
export const AUTH_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Terminal challenges are kept for a day before deletion. The daily issuance
 * cap is counted from `AuthChallenge.createdAt`, so deleting a row sooner
 * would hand back issuance budget to the address it belongs to.
 */
export const CHALLENGE_TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Small grace period after expiry, for reading a failure report. */
export const CHALLENGE_EXPIRED_GRACE_MS = 5 * 60 * 1000;

/** Consumed enrolment grants are kept for a day, like terminal challenges. */
export const ENROLLMENT_TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Expired grants are removed an hour after expiry. They can no longer be
 * redeemed, and no cap is counted from grant rows.
 */
export const ENROLLMENT_EXPIRED_GRACE_MS = 60 * 60 * 1000;

/**
 * Advisory-lock key that makes the sweep single-runner. A constant, unlike the
 * per-address issuance lock, because the job is global.
 */
export const AUTH_CLEANUP_LOCK_KEY = '7420150017';

/** Generous bound for the two deletes; a sweep should take milliseconds. */
export const AUTH_CLEANUP_TX_TIMEOUT_MS = 30_000;

export interface AuthCleanupResult {
  challenges: number;
  grants: number;
  durationMs: number;
}

/**
 * Rows the sweep considers removable. A challenge must be older than the daily
 * issuance window *and* terminal (superseded, consumed or past its expiry), so
 * the issuance cap keeps counting every row that can still matter.
 */
export function challengeCleanupWhere(now: Date): Prisma.AuthChallengeWhereInput {
  return {
    createdAt: {
      lt: new Date(now.getTime() - CHALLENGE_TERMINAL_RETENTION_MS),
    },
    OR: [
      { supersededAt: { not: null } },
      { consumedAt: { not: null } },
      {
        expiresAt: {
          lt: new Date(now.getTime() - CHALLENGE_EXPIRED_GRACE_MS),
        },
      },
    ],
  };
}

/** Consumed grants after the retention window, or expired grants after grace. */
export function grantCleanupWhere(now: Date): Prisma.EnrollmentGrantWhereInput {
  return {
    OR: [
      {
        consumedAt: { not: null },
        createdAt: {
          lt: new Date(now.getTime() - ENROLLMENT_TERMINAL_RETENTION_MS),
        },
      },
      {
        expiresAt: {
          lt: new Date(now.getTime() - ENROLLMENT_EXPIRED_GRACE_MS),
        },
      },
    ],
  };
}

/**
 * Delete removable rows in one transaction that first tries a transaction-
 * scoped advisory lock. Returns `null` when another instance holds the lock, so
 * concurrent schedulers never double-delete or block each other.
 */
export async function purgeExpiredAuthRows(
  prisma: Pick<PrismaClient, '$transaction'>,
  now: Date = new Date(),
): Promise<AuthCleanupResult | null> {
  const startedAt = Date.now();
  const challengesWhere = challengeCleanupWhere(now);
  const grantsWhere = grantCleanupWhere(now);

  return prisma.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT acquired
        FROM (SELECT pg_try_advisory_xact_lock(${AUTH_CLEANUP_LOCK_KEY}::bigint) AS acquired) AS lock
      `;
      if (!lock?.acquired) return null;

      const challenges = await tx.authChallenge.deleteMany({
        where: challengesWhere,
      });
      const grants = await tx.enrollmentGrant.deleteMany({
        where: grantsWhere,
      });

      return {
        challenges: challenges.count,
        grants: grants.count,
        durationMs: Date.now() - startedAt,
      };
    },
    { timeout: AUTH_CLEANUP_TX_TIMEOUT_MS },
  );
}
