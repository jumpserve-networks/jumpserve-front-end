import type { NextConfig } from "next";
import { LEGACY_MODULE_ROUTES } from "./lib/test-modules";

const nextConfig: NextConfig = {
  async redirects() {
    // Keep specific pathway/tool aliases ahead of the old /module and /modules prefixes.
    return LEGACY_MODULE_ROUTES.map(({ source, destination }) => ({
      source: `${source}/:path*`,
      destination: `${destination}/:path*`,
      permanent: true,
    }));
  },
};

export default nextConfig;
