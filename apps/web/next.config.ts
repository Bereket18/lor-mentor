import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

// 1. Define the base configuration options first
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Proxy API requests through Next.js so iframes loading PDFs
  // stay same-origin (localhost:3000) — avoids Edge SmartScreen blocks
  // when the iframe src points directly to localhost:4000
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/v1/:path*`,
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
