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
  - The rig builds into `.next-e2e` (`NEXT_DIST_DIR`, wired to `distDir` in
    `next.config.ts`). Running `next build` against the default `.next` while
    `next dev` is live corrupts the dev server's chunks: they start returning
    500s, hydration silently never happens, and the page looks alive but every
    button is dead. Keep the dist dirs separate.
  - Under Cache Components, a top-level blocking read fails `next build`
    outright rather than producing a red test. To manufacture a RED for a
    differential, add `export const instant = false` to the target segment
    alongside the blocking read.
  - `cookies()` alone is not a lock probe: the testing lock restricts the
    navigation to its shell but does not withhold request cookies. Use real
    uncached request-time data (`connection()`, an uncached fetch/db read).

## Current coverage

`e2e/instant-navigation.spec.ts` guards **both navigation types into `/ppr`**,
in the self-validating form: under the lock the static shell and both cached
catalogs must be present *and* the uncached country slots must be absent, so
the tests cannot pass if the lock stops engaging.

- **Initial load** — `page.goto('/ppr')` inside `instant()` with `baseURL`.
- **Soft navigation** — a real `<Link>` click from `/`, the static index.

The two shells differ on purpose, and the specs assert the difference: the
component-cached country panel streams on an initial load but is **already
resolved** on a soft navigation, because it resolves during prefetch. Don't
"fix" that asymmetry by making the assertions identical — it is the behavior
being guarded.

Other blocks cover the IN/US/UK content per cookie, the cached-vs-uncached
ordering claims, and the static wrappers.

Two conventions the specs depend on:

- **Scope streamed bodies through their card** (`slot(page, testId)`). While a
  boundary is in flight, React parks a copy of its content in a hidden buffer
  at the end of `<body>`, so two nodes briefly share a testid and Playwright's
  strict mode throws. The card wrapper is static and never inside the boundary,
  so going through it always resolves the placed copy.
- **Assert ordering as a race, never "is the other one still a skeleton".** The
  skeleton disappears the moment its slot resolves; an assertion that has to
  land inside that window is a coin flip under parallel load. `raceSlots()`
  compares arrival order instead, which is the actual claim.

`workers` is pinned to 2: `next start` is a single process and every request to
`/ppr` does seconds of deliberately slow work, so more workers queue behind
each other and turn real waits into spurious timeouts.

- **TEST USER** addendum: the suite sets the `demo-country` cookie directly via
  `context.addCookies()`. There is still no auth.
