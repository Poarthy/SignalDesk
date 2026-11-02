import type { NextConfig } from "next";

const isMobileBuild = process.env.BUILD_TARGET === "mobile";

const nextConfig: NextConfig = {
  // Local-first server app. Route handlers refresh feeds at runtime;
  // "prebuild" refreshes them at build time with the exact same engine.
  compress: true,
  ...(isMobileBuild
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: false,
      }
    : {}),
};

export default nextConfig;
