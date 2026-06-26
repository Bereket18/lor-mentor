import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

// 1. Define the base configuration options first
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Proxy /api/v1/* to the NestJS API so PDF.js canvas requests are same-origin
  // and browsers don't block cross-origin localhost requests
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

// 2. Wrap the fully defined configuration object with the analyzer wrapper
const config = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);

// 3. Export the wrapped compilation bundle object
export default config;
