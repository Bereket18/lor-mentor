/**
 * Calendar-month arithmetic in UTC with end-of-month clamping.
 *
 * addMonthsUtc(2026-01-31, 1)  -> 2026-02-28 (not Mar 3, which is what
 * Date.setMonth produces). addMonthsUtc(2024-02-29, 12) -> 2025-02-28.
 * Time-of-day is preserved; all maths is done on UTC fields so the result
 * does not depend on the server's local time zone.
 */
export function daysInMonthUtc(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  // Normalise year/month overflow (month can leave 0..11).
  const normYear = year + Math.floor(month / 12);
  const normMonth = ((month % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonthUtc(normYear, normMonth));
  return new Date(
    Date.UTC(
      normYear,
      normMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
