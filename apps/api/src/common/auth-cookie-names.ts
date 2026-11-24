/**
 * Base cookie names, shared by the guard that reads them and the controller
 * that sets them. Kept in one file so a rename cannot half-happen.
 *
 * The `__Host-` prefix is applied by `authCookieName()` in production.
 */
export const CSRF_BASE = 'auth_cs_';
export const CHALLENGE_BASE = 'auth_ch_';
export const ENROLLMENT_BASE = 'auth_en_';
/**
 * Long-lived browser accounting id (P1-2). It is not a security token and
 * never authorises anything; it only gives the per-browser rate-limit bucket a
 * value that survives a CSRF refresh.
 */
export const BROWSER_BASE = 'auth_bid_';
