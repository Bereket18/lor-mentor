/**
 * "Is this database safe to create and delete rows in?"
 *
 * Shared by the disposable-database checks in the API test suite and the
 * support fixture seeder. Both do destructive things (the authorisation matrix
 * creates and removes users; the seeder wipes and rebuilds a student's tickets
 * and payments), so both must answer this question the same way.
 *
 * Accepted:
 *  - any database name containing e2e / test / disposable / qa (local and CI
 *    throwaway databases);
 *  - exactly `lor_mentor_ci`, the api:e2e job's database.
 *
 * The name is parsed from the URL's path, so a host or query string that
 * happens to contain "test" cannot open the gate. A plain `lor_mentor` is
 * refused on purpose: that is the real local development database.
 */
export function isDisposableDatabaseUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
  if (!name) return false;
  return /(e2e|test|disposable|qa)/i.test(name) || name === 'lor_mentor_ci';
}

/**
 * Throws unless `DATABASE_URL` names a disposable database. Used by scripts
 * that must never run against a real environment.
 */
export function assertDisposableDatabaseUrl(
  url: string | undefined | null,
): string {
  if (!url) {
    throw new Error('DATABASE_URL is not set; refusing to run.');
  }
  if (!isDisposableDatabaseUrl(url)) {
    throw new Error(
      `Refusing to run against "${safeDatabaseName(url)}": the database name must contain e2e, test, disposable or qa (or be exactly lor_mentor_ci).`,
    );
  }
  return url;
}

/** The database name from a URL, without credentials, for messages. */
export function safeDatabaseName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || '(none)';
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}
