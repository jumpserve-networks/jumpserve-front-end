import type { NextConfig } from "next";
import { LEGACY_EXACT_MODULE_ROUTES, LEGACY_MODULE_ROUTES } from "./lib/test-modules";

const nextConfig: NextConfig = {
  env: { JUMPSERVE_BUILD_REVISION: process.env.AWS_COMMIT_ID || process.env.JUMPSERVE_BUILD_REVISION || "local" },
  async redirects() {
    // Exact catalogue aliases select the personal filter before broader detail and namespace redirects.
    return [...LEGACY_EXACT_MODULE_ROUTES.map(({ source, destination }) => ({ source, destination, permanent: true })), ...LEGACY_MODULE_ROUTES.map(({ source, destination }) => ({
      source: `${source}/:path*`,
      destination: `${destination}/:path*`,
      permanent: true,
    }))];
  },
};

export default nextConfig;
