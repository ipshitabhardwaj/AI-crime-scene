import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so Next.js ignores stray lockfiles in parent folders.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
