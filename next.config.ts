import type { NextConfig } from "next";
import { LEGACY_EXACT_MODULE_ROUTES, LEGACY_MODULE_ROUTES } from "./lib/test-modules";

const nextConfig: NextConfig = {
  env: { JUMPSERVE_BUILD_REVISION: process.env.AWS_COMMIT_ID || process.env.JUMPSERVE_BUILD_REVISION || "local" },
  async redirects() {
    // Keep specific pathway/tool aliases ahead of the old /module and /modules prefixes.
    return [...LEGACY_EXACT_MODULE_ROUTES.map(({ source, destination }) => ({ source, destination, permanent: true })), ...LEGACY_MODULE_ROUTES.map(({ source, destination }) => ({
      source: `${source}/:path*`,
      destination: `${destination}/:path*`,
      permanent: true,
    }))];
  },
};

export default nextConfig;
