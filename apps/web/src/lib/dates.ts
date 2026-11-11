/**
 * Money and entitlement instants are stored in UTC and rendered for students in
 * Addis Ababa time (UTC+3, no DST) — that is where the college and its students
 * are. Formatting without an explicit timezone made the same subscription print
 * different days on a UTC API host and a local machine, so every date a student
 * sees goes through here.
 */
export const DISPLAY_TIME_ZONE = "Africa/Addis_Ababa";

/** `31 Jan 2026` in Addis Ababa time. */
export function formatDisplayDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return date.toLocaleDateString("en-GB", {
      timeZone: DISPLAY_TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
