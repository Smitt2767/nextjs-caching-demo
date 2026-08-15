import { defineConfig, devices } from "@playwright/test";

// 3100, not 3000: `next dev` usually holds 3000, and instant() must never be
// measured against a dev server.
const PORT = Number(process.env.PORT ?? 3100);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  // One worker, for two reasons. `next start` is a single process and every
  // request to /ppr does seconds of deliberately slow work, so parallel
  // workers queue behind each other and turn real waits into spurious
  // timeouts. And the suite asserts on shared server cache state — an
  // invalidation running beside a test that expects a cache hit fails it for
  // the wrong reason.
  workers: 1,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        // E2E_CHROME=1 drives the real Google Chrome install instead of the
        // bundled Chromium. Opt-in, because CI may not have Chrome.
        channel: process.env.E2E_CHROME ? "chrome" : undefined,
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // instant() is only meaningful against a production build. `next dev` does
  // not prefetch and its lock is unreliable, so never measure against it.
  // Building here (rather than assuming a prior build) keeps the measured
  // artifact in sync with the working tree.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command:
          `NEXT_DIST_DIR=.next-e2e EXPOSE_TESTING_API=1 pnpm build && ` +
          `NEXT_DIST_DIR=.next-e2e EXPOSE_TESTING_API=1 pnpm start --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
