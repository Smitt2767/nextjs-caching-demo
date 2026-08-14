# instant-nav rig: nextjs-caching-demo

How this repo produces a trustworthy instant-navigation verdict. Read this
instead of rediscovering; update it when any answer changes.

- **BUILD**: local `next build && next start` on port **3100**. Playwright's
  `webServer` in `playwright.config.ts` runs both, so the measured artifact is
  always rebuilt from the working tree. Never `next dev` — it does not prefetch
  and its lock is unreliable.
- **EXPOSE**: `experimental.exposeTestingApiInProductionBuild` is wired to
  `process.env.EXPOSE_TESTING_API === '1'` in `next.config.ts`. The `webServer`
  command sets it for both the build and the server. Nothing sets it in a real
  production build, so the testing API never ships.
- **RUN**: `pnpm test:e2e` (→ `playwright test`) against
  `http://localhost:3100`. Set `BASE_URL` to point at an already-running
  production build instead; that also disables the managed `webServer`.
  Projects: `desktop` (Desktop Chrome) and `mobile` (Pixel 7), so the shell is
  asserted at both breakpoints.
- **TEST USER**: none. The app has no auth, no flags, no per-user data — every
  visitor gets the same render.
- **DRIFT**: effectively nil. No feature flags, plans, roles, locales, A/B
  buckets, or seeded data separate the author's session from the suite's.
  Revisit this entry the moment auth or flags land.
- **LOOP**: fully local and agent-drivable — `pnpm test:e2e` builds, starts,
  measures, and tears down in one command. No push, no secrets, no deploy wait,
  no approvals.
- **LIVENESS**: n/a. The artifact under test is the one Playwright just built,
  so there is no stale-deploy risk to probe for.
- **WALLS**:
  - Port 3000 is usually held by the developer's `next dev`, so the rig
    defaults to 3100 and sets `reuseExistingServer: false` — a dev server can
    never be measured by accident.
  - Under Cache Components, a top-level blocking read fails `next build`
    outright rather than producing a red test. To manufacture a RED for a
    differential, add `export const instant = false` to the target segment
    alongside the blocking read.
  - `cookies()` alone is not a lock probe: the testing lock restricts the
    navigation to its shell but does not withhold request cookies. Use real
    uncached request-time data (`connection()`, an uncached fetch/db read).

## Current coverage

`e2e/instant-navigation.spec.ts` guards the **initial load** of `/`. There is
no soft-navigation guard yet because the app has a single route — nothing to
click, no destination App Shell to commit. Add the soft-nav spec (a real
`<Link>` click inside `instant()`) with the second route.
