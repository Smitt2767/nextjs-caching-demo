/**
 * The load-bearing lines from each slot, kept here so the page can show what
 * it is doing. Excerpts only — the point is the caching decision, not the JSX.
 *
 * These are hand-maintained copies. If the real component changes shape, the
 * excerpt should change with it.
 */

export type SnippetId =
  | "shell"
  | "catalog"
  | "catalog-component"
  | "country"
  | "country-cached"
  | "country-component"
  | "private-all"
  | "private-component"
  | "timing"
  | "directives";

export type Snippet = {
  /** Where the real code lives. */
  file: string;
  /** The one-line claim this snippet demonstrates. */
  point: string;
  code: string;
};

export const SNIPPETS: Record<SnippetId, Snippet> = {
  directives: {
    file: "src/lib/country-cache.ts · src/app/_components/private-cached.tsx",
    point: "The same page, split three ways by where the answer is stored.",
    code: `// 1. No request-time input -> computed at BUILD time, baked into the
//    page, served from the edge. The cheapest thing here by far.
async function getCatalog() {
  'use cache'
  cacheLife('hours')
  return db.plans.findAll()
}

// 2. Needs the visitor's country -> runs at REQUEST time, so it needs a
//    cache that outlives the instance. On serverless, plain 'use cache'
//    would be a no-op here: entries live in one process's memory and the
//    next request may land somewhere else.
async function getOffer(code: CountryCode) {
  'use cache: remote'
  cacheLife('hours')
  cacheTag(\`country-offer-\${code}\`)
  return db.offers.find(code)
}

// 3. Reads the cookie itself. Only 'private' may do this, because the
//    answer differs per visitor and must never reach a shared cache.
//    Keep it small: cache the per-user STEP, not the whole feature.
async function CountrySlot() {
  'use cache: private'
  cacheLife({ stale: 300 })

  const code = (await cookies()).get('country')?.value ?? 'US'
  return <OfferPanel code={code} />   // <- the costly half, shared (2)
}

// The rule: what is expensive should be shared, and what is personal
// should be cheap. If the expensive thing is inside 'private', it runs
// again for every visitor -- measured at ~2031ms vs ~105ms.`,
  },

  timing: {
    file: "src/app/_components/arrival-timer.tsx",
    point: "An inline script, so each panel is stamped as its markup lands.",
    code: `export function ArrivalTimer({ id }: { id: string }) {
  const domId = \`arrival-\${id}\`

  return (
    <>
      <span id={domId} suppressHydrationWarning>measuring…</span>

      {/* Runs while the browser is still parsing THIS chunk, so each
          panel is stamped as its own markup arrives: shell chunks at
          parse time, a streamed slot when its chunk lands. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            \`(function(){var n=document.getElementById("\${domId}");\` +
            \`if(n&&!n.dataset.renderedAt){\` +
            \`var t=Math.round(performance.now());\` +
            \`n.dataset.renderedAt=t;n.textContent="~"+t+"ms";}})()\`,
        }}
      />
    </>
  )
}

// Not a useEffect: effects all run in one commit after hydration, so
// every panel already on screen reports the SAME number and the cached
// slots stop being distinguishable from the static ones.`,
  },

  shell: {
    file: "src/app/page.tsx",
    point: "No await anywhere — this subtree is pure markup, so it prerenders.",
    code: `export default function Home() {
  return (
    <Panel tag="STATIC SHELL">
      <CountrySwitcher />
    </Panel>
    // ...plus the Suspense boundaries below
  )
}`,
  },

  catalog: {
    file: "src/lib/catalog.ts",
    point: "Cache the data. The component still re-renders on every request.",
    code: `export async function getCatalog(): Promise<Catalog> {
  'use cache'
  cacheLife('hours')

  await new Promise((r) => setTimeout(r, CATALOG_COMPUTE_MS))
  return { entries: ENTRIES, cachedAt: new Date().toISOString() }
}`,
  },

  "catalog-component": {
    file: "src/app/_components/component-cached.tsx",
    point: "Cache the component. The markup itself is the cache entry.",
    code: `export async function ComponentCachedCatalog() {
  'use cache'
  cacheLife('hours')
  cacheTag('catalog-panel')

  const catalog = await getCatalog()

  return <Panel tag="COMPONENT CACHED">{/* ... */}</Panel>
}`,
  },

  country: {
    file: "src/app/_components/country-slot.tsx",
    point: "No cache at all: every request pays the full 2000ms lookup.",
    code: `export async function CountrySlot() {
  const { code } = await resolveCountry()   // reads cookies() — request time
  const offer = await fetchCountryOffer(code) // 2000ms, uncached

  return <Panel tag={\`STREAMED · \${code}\`}>{/* ... */}</Panel>
}

// In page.tsx — the boundary that keeps the shell instant:
<Suspense fallback={<CountrySlotSkeleton />}>
  <CountrySlot />
</Suspense>`,
  },

  "country-cached": {
    file: "src/lib/country-cache.ts",
    point:
      "The country code is an argument, so it becomes part of the cache key.",
    code: `export async function getCachedCountryOffer(code: CountryCode) {
  // 'remote', not plain 'use cache'. This runs behind <Suspense> at request
  // time, and plain 'use cache' is an in-memory LRU inside the server process
  // -- which on serverless is gone by the next request. See the note below.
  'use cache: remote'
  cacheLife('hours')
  cacheTag(\`country-offer-\${code}\`)

  return fetchCountryOffer(code)   // 2000ms, once per country
}

// The cookie is read OUTSIDE the cached scope and passed in:
const { code } = await resolveCountry()
const { offer } = await loadCachedCountryOffer(code)`,
  },

  "country-component": {
    file: "src/app/_components/component-cached.tsx",
    point: "A hit skips the lookup AND the render — nothing runs again.",
    code: `async function CachedCountryPanel({ code }: { code: CountryCode }) {
  'use cache: remote'      // shared across instances; see the note below
  cacheLife('hours')
  cacheTag(\`country-panel-\${code}\`)

  const offer = await fetchCountryOffer(code)  // 2000ms
  return <Panel>{/* ...both skipped on a hit */}</Panel>
}

// Uncached wrapper reads the cookie, then hands the code to the cached child:
export async function ComponentCachedCountrySlot() {
  const { code } = await resolveCountry()
  return <CachedCountryPanel code={code} />
}`,
  },

  "private-all": {
    file: "src/app/_components/private-cached.tsx",
    point: "One private scope around everything — including the costly half.",
    code: `export async function PrivateEverythingCountrySlot() {
  'use cache: private'
  cacheLife({ stale: 300 })

  // Reads cookies() inside the cached scope — only 'private' allows this.
  const raw = (await cookies()).get(COUNTRY_COOKIE)?.value
  const code = isCountryCode(raw) ? raw : DEFAULT_COUNTRY

  const offer = await fetchCountryOffer(code)   // 2000ms
}

// Works, and a client navigation reuses all of it. But NOTHING here is
// stored on the server, so the 2000ms runs again on every server render
// and is cached per visitor -- no two users share any of it.`,
  },

  "private-component": {
    file: "src/app/_components/private-cached.tsx",
    point: "Private wraps only the cookie read. The costly half stays shared.",
    code: `// The wrapper is private, because what it does is per-user.
export async function PrivateComponentCountrySlot() {
  'use cache: private'
  cacheLife({ stale: 300 })   // >= 5min to be eligible for the App Shell

  // Allowed here and nowhere else: 'use cache' and 'use cache: remote'
  // both forbid reading cookies inside the cached scope. In group 2 this
  // read sits OUTSIDE the cache and re-runs on every request.
  const { code } = await resolveCountry()

  // ...and the expensive half is the SAME cached component group 2
  // renders -- server-side, shared by every user.
  return <CachedCountryPanel code={code} />
}

async function CachedCountryPanel({ code }: { code: CountryCode }) {
  'use cache: remote'                          // same component as group 2
  cacheLife('hours')
  cacheTag(\`country-panel-\${code}\`)

  const offer = await fetchCountryOffer(code)  // 2000ms
}

// private -> per-user, browser-held, cheap  (the cookie read)
// remote  -> shared, server-held, costly    (the lookup and render)

// Worth knowing: the docs say remote cannot NEST inside private. Returning
// the element (rather than awaiting it here) is not nesting -- React renders
// it after the private scope has already returned. Verified: it builds and
// runs.`,
  },
};
