import path from "node:path";
import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { resolveApiOrigin } from "./src/lib/api-base";

// 1. Define the base configuration options first
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Record why this app is on this Next.js patch: `next upgrade --agent` defaults
  // to the `security` policy, which is what moved 16.4.3 to 16.4.6. Keeping the
  // policy here also makes `next dev`/`next build` surface the next advisory as
  // a reminder instead of silently running a vulnerable version.
  experimental: {
    agentUpgrade: "security",
  },
  // Emit a self-contained server bundle (.next/standalone) for a small,
  // dependency-traced production Docker image. outputFileTracingRoot points at
  // the monorepo root so workspace-hoisted node_modules are traced correctly.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Proxy /api/v1/* to the NestJS API so PDF.js canvas requests are same-origin
  // and browsers don't block cross-origin localhost requests.
  //
  // resolveApiOrigin() throws when NEXT_PUBLIC_API_URL is empty, malformed, or
  // (in production) points at loopback/private addresses, so a misconfigured
  // deployment fails here — at build time — instead of shipping a bundle whose
  // server-side API calls all go nowhere. See src/lib/api-base.ts.
  async rewrites() {
    const apiOrigin = resolveApiOrigin();
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },

  /**
   * The passwordless pages handle email link secrets and one-time proofs.
   * They must not be cached, indexed, or allowed to leak a path through a
   * Referer header. (The link secret itself travels in a fragment, which is
   * never sent to the server; these headers cover the rest.)
   */
  async headers() {
    // The browser bundle calls the API either same-origin (through the
    // rewrite) or directly at NEXT_PUBLIC_API_URL, so that origin is allowed
    // for connections. No other origin is.
    const apiOrigin = resolveApiOrigin();
    // P1-5: the auth pages get a self-only policy. No third-party origin is
    // allowed for scripts, images, fonts or connections, so a link to an
    // attacker-controlled host cannot be injected into these pages as a
    // resource. Inline scripts/styles stay allowed because Next.js emits an
    // inline RSC bootstrap and next-themes emits a no-flash theme script;
    // without a per-request nonce both would be blocked. A nonce policy
    // requires every page to be dynamically rendered (the root layout owns the
    // theme script), which is tracked separately as a P2 follow-up.
    const isDev = process.env.NODE_ENV === "development";
    const contentSecurityPolicy = [
      "default-src 'self'",
      // React's development build uses eval for enhanced stack traces; the
      // production build does not, so this keyword is never shipped.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self'",
      `connect-src 'self' ${apiOrigin}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    const hardened = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "no-store" },
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
    ];
    return [
      { source: "/login", headers: hardened },
      { source: "/auth/email/confirm", headers: hardened },
      { source: "/complete-profile", headers: hardened },
    ];
  },
};

// 2. Wrap the fully defined configuration object with the analyzer wrapper
const config = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);

// 3. Export the wrapped compilation bundle object
export default config;
