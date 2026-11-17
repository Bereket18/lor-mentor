/**
 * Base cookie names, shared by the guard that reads them and the controller
 * that sets them. Kept in one file so a rename cannot half-happen.
 *
 * The `__Host-` prefix is applied by `authCookieName()` in production.
 */
export const CSRF_BASE = 'auth_cs_';
export const CHALLENGE_BASE = 'auth_ch_';
export const ENROLLMENT_BASE = 'auth_en_';
