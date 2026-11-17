import path from "node:path";
import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { resolveApiOrigin } from "./src/lib/api-base";

// 1. Define the base configuration options first
const nextConfig: NextConfig = {
  reactStrictMode: true,
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
    const hardened = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "no-store" },
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
