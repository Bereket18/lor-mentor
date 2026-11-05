/**
 * Canonical form of an email address for storage and lookup.
 *
 * `User.email` is `@unique`, but Postgres compares it case-sensitively: as far
 * as the database is concerned "Abebe@x.com" and "abebe@x.com" are two
 * different accounts. Addresses are case-insensitive in practice, so storing
 * whatever was typed means the same person can end up unable to sign in, or
 * able to register twice.
 *
 * Lowercasing here keeps new rows canonical. It is deliberately *not* applied
 * as a migration to existing rows: that is a data change, it would collide on
 * the unique index if two accounts differ only by case, and it needs a decision
 * that has not been made.
 *
 * Note this only lowercases. It does not strip dots or `+suffix` from the local
 * part — those are legal and meaningful at some providers, and collapsing them
 * would merge genuinely distinct addresses.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalize an unknown value, passing anything that is not a string straight
 * through so class-validator can report the type error itself rather than
 * receiving a silently coerced value.
 */
export function normalizeEmailValue(value: unknown): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}
