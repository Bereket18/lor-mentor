/**
 * Single source of truth for the API origin used by SERVER-side code:
 *
 *   - the `/api/v1/:path*` rewrite in `next.config.ts`
 *   - the `/api/proxy/*` route handler
 *   - server components that fetch the API directly (e.g. the pricing page)
 *
 * Why this module exists (audit findings F-B1/DR-7):
 *
 *   All three call sites used to read
 *   `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"`. Nullish
 *   coalescing does not catch an EMPTY string, so `NEXT_PUBLIC_API_URL=""`
 *   slipped through: the rewrite produced a destination with no origin and
 *   `new URL("")` threw inside the proxy route. The same fallback also
 *   accepted a loopback origin in a production deployment, shipping a bundle
 *   that can never reach the API.
 *
 * Behaviour:
 *
 *   | value                        | development        | production        |
 *   |------------------------------|--------------------|-------------------|
 *   | unset                        | localhost fallback | error             |
 *   | "" / whitespace              | localhost fallback | error             |
 *   | not an absolute http(s) URL  | error              | error             |
 *   | URL with a path              | error              | error             |
 *   | loopback / private / unspecified host | accepted  | error             |
 *   | public origin                | accepted           | accepted          |
 *
 * The browser bundle is deliberately NOT routed through this module: `lib/api.ts`
 * keeps `NEXT_PUBLIC_API_URL ?? ""` so that an unset value means "same origin"
 * for the browser, which is what makes one build work on localhost, a LAN IP and
 * a tunnel. Only the server-side origin needs to be a real absolute URL.
 *
 * `ALLOW_LOCAL_API_ORIGIN=1` is an escape hatch for local production-mode smoke
 * tests (`next build` always runs with NODE_ENV=production, so a localhost
 * origin would otherwise be unreachable). It weakens ONLY this misconfiguration
 * guard — never set it in a deployment.
 */

export const DEFAULT_DEV_API_ORIGIN = "http://localhost:4000";

const ENV_KEY = "NEXT_PUBLIC_API_URL";
const ESCAPE_HATCH_KEY = "ALLOW_LOCAL_API_ORIGIN";

function isTruthyFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isIpv4(host: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

/**
 * True for origins that can never be a real deployment target: loopback,
 * unspecified, link-local, and the RFC 1918 / RFC 4193 private ranges.
 */
export function isLocalOrPrivateHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (host === "::" || host === "0.0.0.0") return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;

  const octets = isIpv4(host);
  if (octets) {
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC 1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
    if (a === 192 && b === 168) return true; // RFC 1918
    if (a === 169 && b === 254) return true; // link-local
    return false;
  }

  // A single-label hostname (no dot) is never a public API host.
  if (!host.includes(".")) return true;

  return false;
}

export interface ResolveApiOriginOptions {
  /** Raw value of NEXT_PUBLIC_API_URL. */
  value?: string;
  /** NODE_ENV of the process doing the resolving. */
  nodeEnv?: string;
  /** Raw value of ALLOW_LOCAL_API_ORIGIN. */
  allowLocalOrigin?: string;
}

/**
 * Resolve the absolute API origin, or throw with an actionable message.
 * Throwing is intentional: the callers are build-time or module-load paths, so
 * a misconfiguration surfaces as a failed build or a 503 with a clear log line
 * instead of requests silently going to the wrong place.
 */
export function resolveApiOrigin(options: ResolveApiOriginOptions = {}): string {
  const raw = (options.value ?? process.env.NEXT_PUBLIC_API_URL ?? "").trim();
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const isProduction = nodeEnv === "production";
  const localAllowed =
    isTruthyFlag(options.allowLocalOrigin ?? process.env[ESCAPE_HATCH_KEY]);
  const strict = isProduction && !localAllowed;

  if (!raw) {
    if (strict) {
      throw new Error(
        `${ENV_KEY} must be set to the public API origin in production ` +
          `(for example https://api.example.com). It was empty; an empty value ` +
          `used to fall through to a localhost fallback and break every ` +
          `server-side API call. Set it at build time (Docker build arg) and at runtime.`,
      );
    }
    return DEFAULT_DEV_API_ORIGIN;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `${ENV_KEY} must be an absolute URL including the scheme ` +
        `(for example https://api.example.com). Got a value that is not a valid URL.`,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `${ENV_KEY} must use http or https. Got protocol "${url.protocol}".`,
    );
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      `${ENV_KEY} must be a bare origin with no path, query or fragment ` +
        `(got a path of "${url.pathname}"). The API path /api/v1 is appended ` +
        `by the rewrite and the proxy route.`,
    );
  }

  if (strict && isLocalOrPrivateHostname(url.hostname)) {
    throw new Error(
      `${ENV_KEY} must not point at a loopback or private address in ` +
        `production (got host "${url.hostname}"). Set it to the public API ` +
        `origin, and remove ${ESCAPE_HATCH_KEY} if it is set — that flag is ` +
        `only for local production-mode smoke tests.`,
    );
  }

  return url.origin;
}
