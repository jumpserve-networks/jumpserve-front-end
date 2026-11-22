import type { NextConfig } from "next";
import { ASSESSMENT_PATH, LEGACY_EXACT_MODULE_ROUTES, LEGACY_MODULE_ROUTES } from "./lib/test-modules";

const nextConfig: NextConfig = {
  env: { JUMPSERVE_BUILD_REVISION: process.env.AWS_COMMIT_ID || process.env.JUMPSERVE_BUILD_REVISION || "local" },
  async headers() {
    return ["/oauth/jumpserve/:path*", `${ASSESSMENT_PATH}/:assessmentId`].map(source => ({
      source,
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "private, no-store" },
      ],
    }));
  },
  async redirects() {
    // Saved detail and catalogue aliases take precedence over broader namespace redirects.
    return [...LEGACY_EXACT_MODULE_ROUTES.map(({ source, destination }) => ({ source, destination, permanent: true })), ...LEGACY_MODULE_ROUTES.map(({ source, destination }) => ({
      source: `${source}/:path*`,
      destination: `${destination}/:path*`,
      permanent: true,
    }))];
  },
};

export default nextConfig;
