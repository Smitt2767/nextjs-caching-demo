import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Lets the e2e rig build into its own directory, so running the tests can
  // never clobber the artifacts a running `next dev` is serving.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    // Exposes the testing API that @next/playwright's instant() needs, for
    // production builds we measure. Never true in a real production build.
    exposeTestingApiInProductionBuild: process.env.EXPOSE_TESTING_API === "1",
  },
};

export default nextConfig;
