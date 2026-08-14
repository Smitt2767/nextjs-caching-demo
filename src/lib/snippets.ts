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
  | "private-component"
  | "remote-component"
  | "timing";

export type Snippet = {
  /** Where the real code lives. */
  file: string;
  /** The one-line claim this snippet demonstrates. */
  point: string;
  code: string;
};

export const SNIPPETS: Record<SnippetId, Snippet> = {
  timing: {
    file: "src/app/_components/arrival-timer.tsx",
    point: "Stamped while the browser parses the chunk, before React loads.",
    code: `export function ArrivalTimer({ id }: { id: string }) {
  const domId = \`arrival-\${id}\`

  return (
    <>
      <span
        id={domId}
        suppressHydrationWarning
        ref={(node) => {
          if (!node) return
          // Path 2 — soft navigations and client-side re-renders.
          // Stamped once per NAVIGATION, not once per node: React keeps
          // the previous route mounted and reuses these nodes, so a
          // node-only guard left a stale reading on screen.
          const nav = currentNavigationId()
          if (node.dataset.navId === nav) return

          node.dataset.navId = nav
          const ms = msSinceNavigationStart()   // not performance.now():
          node.dataset.renderedAt = String(ms)  // a soft nav has no new
          node.textContent = \`rendered @\${ms}ms\` // document clock
        }}
      >
        rendered @…
      </span>

      {/* Path 1 — initial load. This runs while the browser is still
          parsing THIS chunk of the document, so it records the moment
          the markup arrived. Shell chunks stamp at parse time; a
          streamed chunk stamps when it lands. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            \`(function(){var n=document.getElementById("\${domId}");\` +
            \`if(n&&!n.dataset.renderedAt){\` +
            \`var t=Math.round(performance.now());\` +
            \`n.dataset.renderedAt=t;n.dataset.navId="0";\` +
            \`n.textContent="rendered @"+t+"ms";}})()\`,
        }}
      />
    </>
  )
}

// navId "0" is the document load. The script claims it so the ref
// cannot overwrite this parse-time reading during hydration.`,
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
  const renderMs = await simulateRenderWork()

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
  'use cache'
  cacheLife('hours')
  cacheTag(\`country-offer-\${code}\`)

  return fetchCountryOffer(code)   // 2000ms, once per country
}

// The cookie is read OUTSIDE the cached scope and passed in:
const { code } = await resolveCountry()
const { offer } = await loadCachedCountryOffer(code)
const renderMs = await simulateRenderWork()  // still paid every request`,
  },

  "country-component": {
    file: "src/app/_components/component-cached.tsx",
    point: "A hit skips the lookup AND the render — nothing runs again.",
    code: `async function CachedCountryPanel({ code }: { code: CountryCode }) {
  'use cache'
  cacheLife('hours')
  cacheTag(\`country-panel-\${code}\`)

  const offer = await fetchCountryOffer(code)  // 2000ms
  const renderMs = await simulateRenderWork()  // 400ms
  return <Panel>{/* ...both skipped on a hit */}</Panel>
}

// Uncached wrapper reads the cookie, then hands the code to the cached child:
export async function ComponentCachedCountrySlot() {
  const { code } = await resolveCountry()
  return <CachedCountryPanel code={code} />
}`,
  },

  "remote-component": {
    file: "src/app/_components/remote-cached.tsx",
    point: "Identical to the violet slot — one directive moves the storage.",
    code: `async function RemoteCountryPanel({ code }: { code: CountryCode }) {
  'use cache: remote'          // <- the only line that differs
  cacheLife('hours')
  cacheTag(\`country-remote-\${code}\`)

  const offer = await fetchCountryOffer(code)   // 2000ms
  const renderMs = await simulateRenderWork()   // 400ms
  // ...both skipped on a hit, same as 'use cache'
}

// Still cannot read cookies() — remote has the same restriction as
// plain 'use cache' — so an uncached wrapper passes the code in:
export async function RemoteCachedCountrySlot() {
  const { code } = await resolveCountry()
  return <RemoteCountryPanel code={code} />
}

// In-memory  -> one instance, lost on restart or eviction
// Remote     -> shared by every instance, survives restarts
//               (but not deploys: the build id is in the cache key)`,
  },

  "private-component": {
    file: "src/app/_components/private-cached.tsx",
    point: "Held in the browser, so navigating back shows no loading state.",
    code: `export async function PrivateComponentCountrySlot() {
  'use cache: private'
  cacheLife({ stale: 300 })   // >= 5min to be eligible for the App Shell

  // Reads cookies() from INSIDE the cached scope — plain 'use cache' cannot.
  // So there is no uncached wrapper and no \`code\` prop: it resolves itself.
  const raw = (await cookies()).get(COUNTRY_COOKIE)?.value
  const code = isCountryCode(raw) ? raw : DEFAULT_COUNTRY

  const offer = await fetchCountryOffer(code)   // 2000ms
  const renderMs = await simulateRenderWork()   // 400ms
  // ...cached in browser memory: navigate away and back and it is instant.
  // Never stored on the server, so a full reload always pays again.
}`,
  },
};
