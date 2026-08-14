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
  // `next start` is a single process, and every request to /ppr does seconds
  // of deliberately slow work across six slots. Too many parallel workers
  // queue behind each other and turn real waits into spurious timeouts.
  workers: 2,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
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
