import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local-first server app. Route handlers refresh feeds at runtime;
  // "prebuild" refreshes them at build time with the exact same engine.
  compress: true,
};

export default nextConfig;
