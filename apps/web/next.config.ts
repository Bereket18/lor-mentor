import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

// 1. Define the base configuration options first
const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
};

// 2. Wrap the fully defined configuration object with the analyzer wrapper
const config = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);

// 3. Export the wrapped compilation bundle object
export default config;
