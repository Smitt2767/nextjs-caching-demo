# Cache Components demo

A single page that shows, visually, what Next.js prerenders into the static
shell versus what it streams in at request time.

- **Green dashed outline** — prerendered and prefetched. Paints immediately.
- **Red outline** — request-time work, uncached. Arrives after the page has
  painted, every single time.
- **Amber dashed outline** — the *same* request-time work behind `use cache`,
  keyed by country. Slow once per country, then it arrives with the shell.
- **Violet dashed outline** — `use cache` on the **component** rather than the
  data, so a hit skips the render as well as the fetch.
- **Sky dashed outline** — `use cache: private`, cached in **your browser**
  rather than on the server. Navigate away and back and it shows no loading
  state at all.
- **Teal dashed outline** — `use cache: remote`, cached in a **shared store**
  rather than this instance's memory.

Every card has two toggles — **what this shows** (the explanation) and **show
code** (the lines that make it behave that way, highlighted by Shiki on the
server).

### The wrapper is static, the slot is not

Each slot sits inside a `SlotCard`: frame, strategy chip, title, summary and
both disclosures. None of that reads request-time data, so **the entire wrapper
is prerendered into the HTML document** — only the region inside it streams.

Verify it directly. Open DevTools → Network → the `/ppr` document, and read the
response: all six cards, their descriptions and their highlighted code are
already there. Measured on the served HTML, by byte offset:

| Marker | Offset in the document |
| --- | --- |
| `card-shell` (wrapper) | 3,908 |
| `card-country` + its two disclosures | 24,966 – 27,636 |
| `country-slot` (streamed body) | 114,288 |
| `cached-country-slot` (streamed body) | 179,039 |

Wrappers land in the first ~15% of the response; slot bodies arrive in the last
third. A 500ms cut of the stream already contains all six wrappers and all six
code blocks.

Every panel carries the same badge — `rendered @<n>ms`, meaning *when this
panel appeared in the browser*, counted from the start of the page load. One
number with one meaning, so the panels are directly comparable.

The index page carries a collapsible explanation of this, with the measuring
code highlighted inline — open `/` and expand **how it works**.

That number is taken by an inline `<script>` sitting right after each badge,
which runs while the browser is still parsing that chunk of the document —
before React has loaded. This matters more than it sounds: React does not
finish hydrating this page until the slowest streamed slot arrives, so a
`useEffect` or ref reading would report the *static shell* at ~2s and make the
fastest thing on the page look like the slowest. Parse-time stamping reports
what the user actually saw. (Client-side updates, like switching country, fall
back to a ref callback — by then hydration is done and commit time is right.)

## Run it

```bash
pnpm dev            # http://localhost:3000 — the demo is at /ppr
pnpm test:e2e       # builds, serves on :3100, asserts the shell is instant
```

`/` is a static index that links to the demo; `/ppr` is the demo itself. The
split is deliberate: navigating from one to the other is a **soft navigation**,
which commits the destination's prefetched App Shell rather than a fresh
document, and that is a separate thing worth guarding (see below).

`next dev` is fine for looking at the page, but the timings only mean something
on a production build (`pnpm build && pnpm start`) — dev doesn't prefetch, and
its numbers include compile time.

`pnpm test:e2e` builds into `.next-e2e`, not `.next`, so it can run while
`next dev` is up. Running a plain `pnpm build` while the dev server is live
corrupts its chunks — they start 500ing, hydration silently stops, and the page
looks fine but no button works. If that happens, restart `next dev`.

## What's on the page

| Panel | Outline | What it is |
| --- | --- | --- |
| `STATIC SHELL` | green dashed | Prerendered HTML plus the country switcher. No server work on the request. |
| `CACHE HIT` | green dashed | `getCatalog()` in `src/lib/catalog.ts`, marked `"use cache"` with `cacheLife('hours')`. Fakes 600ms of work, then never pays it again. The timestamp in the note is frozen into the cache entry — reload and it doesn't move. |
| `STREAMED · <CC>` | red | `CountrySlot`, behind `<Suspense>`. Resolves the country, waits a fixed 2000ms, renders per-country content. Its badge appears only once the stream has landed. |
| `COMPONENT CACHED` | violet dashed | `ComponentCachedCatalog`. Same catalog, but `use cache` sits on the component, so the rendered markup is the cache entry. |
| `DATA CACHED · <CC> · HIT/MISS` | amber dashed | `CachedCountrySlot`, in its own `<Suspense>`. Identical content and identical 2000ms lookup, but wrapped in `use cache` keyed by country code. The note reports whether this request paid for the lookup — and what the render still cost. |
| `COMPONENT CACHED · <CC>` | violet dashed | `ComponentCachedCountrySlot`. A hit skips the lookup *and* the 400ms render. Its "rendered once at" timestamp is frozen in the cache entry. |

The three country slots are the comparison: same data, same costs, three
caching strategies. All three still stream — they read the cookie at request
time — but only the uncached one waits 2s on every request.

## Caching data vs. caching the component

Each country slot pays two costs: a **2000ms lookup** and a **400ms render**
(`simulateRenderWork`, standing in for formatting, currency rules, and so on).
Where you put `use cache` decides which of them you keep paying:

| Slot | Lookup on a hit | Render on a hit |
| --- | --- | --- |
| Red — uncached | 2000ms, always | 400ms, always |
| Amber — `use cache` on the data | skipped | **400ms, always** |
| Violet — `use cache` on the component | skipped | skipped |

Caching the data caches a *value*; caching the component caches the *rendered
markup*, so nothing inside it runs again. The violet panel proves it: its
"rendered once at" timestamp doesn't move between requests, because the render
that produced it never happens twice.

The trade is granularity. A cached component is opaque — you can't time a hit
from inside it (the timing would be cached too), and everything it renders
shares one cache entry and one lifetime. Cache data when parts of the panel
must stay live; cache the component when the whole thing can be frozen.

While it's still in flight the third panel shows its Suspense fallback —
`STREAMING…` / `waiting ~2000ms` — which ships *inside* the static shell, so
even the skeleton paints immediately.

The build output tells the same story:

```
Route (app)      Revalidate  Expire
┌ ○ /
└ ◐ /ppr                 1h      1d

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
```

### The two shells are not the same

A route is reached two ways, and they don't commit the same UI:

| Panel | Initial load (`/ppr` directly) | Soft nav (click from `/`) |
| --- | --- | --- |
| Shell, both catalogs | in the shell | in the shell |
| Red, amber country slots | skeleton, then stream | skeleton, then stream |
| **Violet component-cached slot** | **skeleton, then streams** | **already resolved** |

That last row is the sharpest argument for caching the component. On a soft
navigation the panel resolves during **prefetch**, so it commits together with
the shell and never streams at all — the click has no waiting in it. The
data-cached panel can't do that: its 400ms render still has to happen after the
click.

Both rows are asserted in the e2e suite, so if that behavior ever changes the
tests say so.

## Performance audit

Measured against `next build && next start` on a freshly started server, so the
first request per country is a genuine cold cache. Times are when each slot
appeared in the browser, from the start of the page load.

| Country | Request | Red (uncached) | Amber (data cached) | Violet (component cached) |
| --- | --- | --- | --- | --- |
| IN | 1st (cold) | 2869ms | 2869ms | 2870ms |
| IN | 2nd (warm) | 2364ms | 858ms | **110ms** |
| US | 1st (cold) | 2360ms | 2862ms | 2862ms |
| US | 2nd (warm) | 2363ms | 858ms | **103ms** |

Reading it:

- The uncached slot costs ~2360ms on **every** request. Caching changes nothing
  for it, because there is no cache.
- Caching the data gets it to ~858ms: the 2000ms lookup is gone, but the 400ms
  render is still paid, every request.
- Caching the component gets it to ~105ms — a **~22× improvement** over
  uncached, and close enough to the shell's own paint that it may as well be
  part of it.
- Every strategy pays full price once per country. The cache is keyed by
  country code, so warming `IN` does nothing for `US`.
- Confirmed on the server side: on a warm hit the amber panel reports
  `lookup 0ms` but `render 400ms`, while the violet panel's "rendered once at"
  timestamp is byte-identical across requests.

Re-run it yourself with `pnpm test:e2e` — the ordering claim is a test, not
just a table (see below).

## `use cache: private` (group 3)

One slot: group 2's uncached red slot, with `use cache: private` applied
directly to the component and nothing else changed. It buys two things plain
`use cache` cannot:

1. It reads `cookies()` **from inside** the cached scope, so it needs no
   uncached wrapper and no `code` prop — it resolves its own country.
2. The result is held in the browser, so a client navigation reuses it with
   **no loading state**.

Measured under the `instant()` lock, navigating `/ppr → / → /ppr`:

| Slot | Skeleton on the way back? |
| --- | --- |
| Red — uncached | **yes**, reloads |
| Amber — data cached | **yes**, its 400ms render still runs |
| Violet — component cached | no |
| **Sky — `use cache: private`** | **no** |

The costs, straight from the directive's contract:

- **Nothing is stored on the server.** The function runs in full on every
  server render — verified: it reports ~2000ms on every load, while the
  server-cached slot beside it drops to 1ms.
- **Browser memory does not survive a reload.** Its "rendered once at"
  timestamp moves on every refresh, while the server-cached component's stays
  frozen. Both are asserted in the suite.
- It is excluded from static shell generation, and needs `stale` ≥ 30s for
  runtime prefetching, ≥ 5 minutes to be eligible for the App Shell. This one
  uses 300s.

## Invalidation (`/invalidate`)

A page of buttons for expiring what `/ppr` caches, grouped by route so future
demos get their own section.

| Tag | Expires |
| --- | --- |
| `catalog-data` | `getCatalog()` — the cached data |
| `catalog-panel` | the component-cached catalog markup |
| `snippets` | the Shiki-highlighted code excerpts |
| `country-offer-<CC>` | the amber slot's lookup, one country |
| `country-panel-<CC>` | the violet slot's markup, one country |

Plus `revalidatePath("/ppr")` for the whole route.

**`updateTag`, not `revalidateTag`.** `updateTag` expires the entry
immediately, so the next request *waits* for fresh data — which is what you
want after pressing a button and expecting to see the effect.
`revalidateTag(tag, 'max')` is the stale-while-revalidate choice: it keeps
serving the old value until the new one is ready. `updateTag` is also
Server-Action-only; it throws in a Route Handler.

Tags live in `src/lib/cache-tags.ts` and both the `cacheTag()` call sites and
this page read from there — previously they were bare strings in two places
and could drift apart silently. The Server Action validates against that list
rather than expiring whatever string arrives, since a Server Action is a
public endpoint.

Verified end to end in the suite: `updateTag("catalog-data")` moves the
catalog's frozen timestamp while the country panel's stays put, and
`revalidatePath("/ppr")` moves both.

The one thing it cannot reach is the sky `use cache: private` slot — that
lives in the browser, so only a reload clears it.

## Why the badges can read the same on a client navigation

Two separate things make the amber (data cached) slot look no faster than the
red (uncached) one when you arrive from the index. Only the first was a bug.

**0. Badges used to show a reading from the previous visit — fixed.**
Badges stamped once per DOM node, which is right within one navigation but
wrong across them: React keeps the previous route mounted rather than
unmounting it (Cache Components preserves routes via `<Activity>`), so
navigating back reuses the very same nodes, already stamped. Nothing was being
cached — the node simply still carried its old value. The stamp is now keyed to
the navigation, so it re-stamps on a new one and still stamps only once within
one.

**1. The clock used to start in the wrong place — fixed.**
`performance.now()` measures from the *document* load, and a soft navigation
creates no new document. So every badge on `/ppr` was reporting "time since you
loaded the index", inflating all of them by the same constant and flattening
the differences. Measured: DOM insertion at 59 / 428 / 2026ms while the badges
read 666 / 1045 / 2644ms — a uniform +617ms, exactly the time spent on the
index. Badges now measure from the navigation itself (`nav-clock.tsx`).

**2. With a settled prefetch, the client reveals the slots together — not a
bug, and not a cache miss.** Once the prefetched shell has committed, the
remaining boundaries are revealed as a group, so the amber slot waits for the
red one before appearing.

That second one is worth proving rather than believing, because the badge
genuinely does say ~2400ms for both. The server disagrees:

```
# RSC flush timing, measured on the wire
  113ms  component-country-slot
  494ms  cached-country-slot     <- ready in 494ms
 2094ms  country-slot
```
```
# server trace for the same navigation
G2 data      loadCachedCountryOffer  cached-hit  code=US 1ms
shared data  simulateRenderWork      RAN         400ms
G2 component CachedCountrySlot       rendered    code=US render=400ms
shared data  fetchCountryOffer       RAN         code=US      <- the red slot's 2000ms
```

The cache hit at 1ms. The amber slot was finished at ~400ms and flushed at
494ms. It then sat in the browser until the red slot caught up at ~2.4s.

So the badge is not lying — it reports when content hit the screen, and on that
navigation the screen arrival was gated by the slowest sibling. It just is not
a measure of caching. To see the caching:

- **Hard-load `/ppr` directly** (or reload). The badges then differ as expected.
- **Read the amber slot's own status line**: `cache HIT lookup 1ms · render
  still 400ms` is the server-side truth regardless of when the card appeared.
- **Watch the server trace** (below).

Checked and ruled out: `export const instant = false` on the route makes no
difference to this — the reveal behaves identically with and without it.

## Watching the cache work (server trace)

Every slot logs at two layers — the component and the data it reads. **The
output goes to the terminal running `next dev` / `next start`, not the browser
console**, because these are Server Components.

That placement is what makes it useful. Code inside a `"use cache"` scope only
runs on a **miss**, so its line only prints when the cache did not serve the
request. Uncached callers print unconditionally:

```
requested + RAN   ->  cache miss, the work actually happened
requested only    ->  cache hit, the work was skipped
```

A warm request to `/ppr` reads like this (colour and padding stripped):

```
G1     component  CachedCatalog                requested   data cached
G2     component  CountrySlot                  requested   no cache
G2     component  CachedCountrySlot            requested   data cached
G2     component  ComponentCachedCountrySlot   requested   wrapper (uncached)
G3     component  PrivateComponentCountrySlot  RAN         server render (never server-cached)
shared data       fetchCountryOffer            RAN         code=IN
G2     data       loadCachedCountryOffer       cached-hit  code=IN 0ms
shared data       simulateRenderWork           RAN         400ms
G2     component  CachedCountrySlot            rendered    code=IN render=400ms
```

Read it slot by slot:

- **G1 catalog** — `CachedCatalog requested` with no `getCatalog RAN`: the data
  cache served it.
- **G1 component-cached catalog** — no line at all. The whole function was
  skipped, which is precisely what caching a component means.
- **G2 uncached** — `fetchCountryOffer RAN`: paid the 2000ms again.
- **G2 data cached** — `cached-hit 0ms` for the lookup, but `simulateRenderWork
  RAN` right after. The fetch was free; the render was not.
- **G2 component cached** — the wrapper prints, `CachedCountryPanel` does not.
  Both fetch and render were skipped.
- **G3 private** — always `RAN`, because private results are never stored on
  the server. Its payoff is on the client, not here.

`fetchCountryOffer RAN` is the single clearest line in the trace: if it prints,
the 2000ms was really spent. Grep for it.

Set `CACHE_TRACE=0` to silence the whole thing.

## `use cache: remote` (group 3)

The violet component-cached slot with exactly one line changed — the
directive. It still cannot read `cookies()` (remote carries the same
restriction as plain `use cache`), so the country code still arrives as a prop
from an uncached wrapper.

What moves is *where the entry lives*:

| | `use cache` | `use cache: remote` |
| --- | --- | --- |
| Storage | this instance's memory | shared remote handler |
| Survives a restart | no | yes |
| Shared across instances | no | yes |
| Cost | none | network round trip + storage |
| Survives a deploy | no | no — the build id is in the cache key |

That matters most on serverless, where each instance has its own memory and the
in-memory variant misses constantly. Locally it works with no `cacheHandlers`
config; hosts normally provide the handler.

Verified from the server trace — cold, then warm:

```
G3 component RemoteCachedCountrySlot  requested  wrapper (uncached)
G3 component RemoteCountryPanel       RAN        code=US      <- miss
```
```
G3 component RemoteCachedCountrySlot  requested  wrapper (uncached)
                                                              <- hit: nothing ran
```

On a client navigation it commits with the shell (`rendered @24ms`), alongside
the component-cached and private slots.

## Where the country comes from

**Next.js gives us nothing here.** `NextRequest.geo` and `.ip` were removed in
Next 15 — geolocation is whatever the platform in front of the app injects as a
request header. On `localhost` nothing does, which is why there's a switcher.

`resolveCountry()` in `src/lib/geo.ts` checks, in order:

1. the `demo-country` cookie (set by the on-page switcher, via a Server Action);
2. a platform geo header — `x-vercel-ip-country`, `cf-ipcountry`,
   `cloudfront-viewer-country`, or `x-country-code`;
3. `US` as a fallback.

On Vercel, step 2 works with no changes: `x-vercel-ip-country` is already first
in the list. Providers send `GB` for the United Kingdom, which is normalized to
the demo's `UK`.

To fake a real geo header locally:

```bash
curl -H 'x-country-code: IN' http://localhost:3100/
```

Supported codes are `IN`, `US`, `UK` (`src/lib/countries.ts`). Everything those
modules return is dummy data — the demo is about *when* content arrives, not
what it says.

## Two things worth knowing

**The cache timestamp differs between the build and the first request.**
`use cache` stores in memory by default, so a freshly started server has an
empty cache: the prerendered HTML carries the build-time value and the first
request recomputes it. From the second request on it's stable. That divergence
is why the timing badges carry `suppressHydrationWarning` — without it React
reports a text mismatch (#418) on the first load after a deploy. On Vercel,
where instances come and go, [`use cache: remote`](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote)
is the durable option.

**`Date.now()` before a dynamic access fails the build.** Cache Components
rejects unstable values during prerender. Timing code uses `performance.now()`
(and lives in `src/lib/load-country.ts`, not in a component body, because it's
impure).

## Design notes

- **Layout** is a responsive grid: one column on mobile, three per group from
  `lg` up, so the three country strategies sit side by side for comparison.
- **Colour encodes strategy** (green static, red uncached, amber data-cached,
  violet component-cached) but is never the only cue — each card also states
  its strategy in text, so the meaning survives greyscale and colour-blindness.
- **Type** is IBM Plex Sans with JetBrains Mono for timings, tags and code,
  loaded through `next/font` so they self-host with no layout shift.
- **Surfaces are tokens** (`--surface`, `--ink`, `--line`, …) defined once in
  `globals.css` and switched on `prefers-color-scheme`. Muted text is 7.2:1 on
  light and 9.8:1 on dark, so it clears WCAG AA comfortably.
- **Motion is deliberately near-zero.** The only animation is the skeleton
  pulse, which signals "still loading", and it stops under
  `prefers-reduced-motion`. A scroll-reveal library was the one design-system
  suggestion I turned down: this page exists to measure when content paints,
  and animating things in would both ship client JS and corrupt the numbers.
- Toggles are 44px tall, keyboard-operable, carry `aria-expanded` /
  `aria-controls`, and use an inline SVG chevron rather than a text glyph.

## The code snippets

Each panel carries a collapsed excerpt of the code that makes it behave that
way — the caching decision, not the JSX.

- The excerpts live in `src/lib/snippets.ts`. They are hand-maintained copies,
  so if a component changes shape its excerpt should change with it.
- Highlighting runs on the **server** (`src/lib/highlight.ts`, itself behind
  `use cache`), and dual themes are emitted as CSS variables that `globals.css`
  switches on `prefers-color-scheme`. Shiki never reaches the browser bundle,
  and there is no highlight flash on load.
- The markup is in the document even while collapsed, so opening a panel
  fetches nothing.

To open some by default — handy when presenting — put their ids in the array at
the top of `src/app/_components/snippet.tsx`:

```ts
export const OPEN_BY_DEFAULT: SnippetId[] = ["country", "country-component"];
```

## Guardrail

`e2e/instant-navigation.spec.ts` asserts under `@next/playwright`'s `instant()`
that the shell and both cached catalogs commit while all three country slots
are still gated, then that they arrive once the lock releases. It's written so
it can't pass vacuously: if the lock ever stopped engaging, the country slots
would already be present and the test would fail.

It also guards the claims this README makes — that a warm data-cached slot
beats the uncached one, that the component-cached slot beats *both* and freezes
its render timestamp, and that every panel ships a snippet that toggles on its
own. Those are asserted as ordering and identity, never as a stopwatch, so they
don't flake.

See `instant-nav.rig.md` for how the build/serve/measure loop is wired.
