import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Lets the e2e rig build into its own directory, so running the tests can
  // never clobber the artifacts a running `next dev` is serving.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // /flags-explained reads its markdown from disk. The build reads it too, so
  // a missing trace would not fail the build — it would fail on the first
  // revalidation, in production, long after anyone was looking.
  outputFileTracingIncludes: {
    "/flags-explained": ["./src/content/**"],
  },
  experimental: {
    // Exposes the testing API that @next/playwright's instant() needs, for
    // production builds we measure. Never true in a real production build.
    exposeTestingApiInProductionBuild: process.env.EXPOSE_TESTING_API === "1",
  },
};

export default nextConfig;
