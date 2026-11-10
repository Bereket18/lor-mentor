import { Prisma } from '@prisma/client';

/**
 * Decimal-safe money handling. Money is never routed through JavaScript
 * floating point: values are parsed into Prisma.Decimal (decimal.js), which
 * compares numerically (1000 == 1000.00) without float drift.
 */

/** Parse a string/number/Decimal into a Decimal. Returns null on garbage. */
export function toDecimal(
  value: string | number | Prisma.Decimal | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  try {
    const d = new Prisma.Decimal(value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/** Exact numeric equality (no tolerance): 1000 equals 1000.00, not 1000.001. */
export function amountsEqual(
  a: string | number | Prisma.Decimal | null | undefined,
  b: string | number | Prisma.Decimal | null | undefined,
): boolean {
  const da = toDecimal(a);
  const db = toDecimal(b);
  return da !== null && db !== null && da.eq(db);
}

/** Format a monetary value for an external API / document: always 2 decimals. */
export function formatETB(value: string | number | Prisma.Decimal): string {
  const d = toDecimal(value);
  if (!d) throw new Error('formatETB: not a finite amount');
  return d.toFixed(2);
}
