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

Every panel carries the same badge — `~<n>ms`, roughly when its markup
arrived, measured in the browser from the start of the page load.

**These are not real performance numbers.** They exist so the panels can be
compared with each other — not server response time, not TTFB, not perceived
load time. Use the Performance panel for figures that mean anything outside
this demo.

The reading comes from an inline `<script>` right after each badge, which runs
while the browser is still parsing that chunk — so each panel is stamped as its
own markup lands. Deliberately not a `useEffect`: effects all run in one commit
after hydration, so every panel already on screen reports the *same* number and
the cached slots stop being distinguishable from the static ones.

**Read them on a fresh page load.** After a client navigation no new document
is parsed, so the badges fall back to a clock that started when the site was
first opened. Reload for clean numbers. The index explains this behind a
**how it works** toggle.

## Run it

```bash
pnpm dev              # http://localhost:3000 — the demo is at /ppr
pnpm test:e2e         # headless: builds, serves on :3100, asserts the shell is instant
pnpm test:e2e:ui      # watch the tests in Playwright's UI, with time-travel
pnpm test:e2e:headed  # watch them run in a visible browser
```

The last two use your real Google Chrome install rather than Playwright's
bundled Chromium (`E2E_CHROME=1`), and run the desktop project only. The
default `pnpm test:e2e` stays on bundled Chromium so it works anywhere.

If a run reports **`localhost:3100 is already used`**, a server from a previous
run is still up. That is deliberate — the config sets
`reuseExistingServer: false` so a test can never measure a stale build — so
clear it and re-run:

```bash
kill $(ss -ltnp | grep ':3100' | grep -oP 'pid=\K[0-9]+')
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
| `DATA CACHED · <CC> · HIT/MISS` | amber dashed | `CachedCountrySlot`, in its own `<Suspense>`. Identical content and identical 2000ms lookup, but wrapped in `use cache` keyed by country code. The note reports whether this request paid for the lookup. |
| `COMPONENT CACHED · <CC>` | violet dashed | `ComponentCachedCountrySlot`. A hit replays the cached markup, so nothing inside runs again. Its "rendered once at" timestamp is frozen in the cache entry. |

The three country slots are the comparison: same data, same costs, three
caching strategies. All three still stream — they read the cookie at request
time — but only the uncached one waits 2s on every request.

## Caching data vs. caching the component

Where you put `use cache` decides what a hit actually skips:

| Slot | Lookup on a hit | Render on a hit |
| --- | --- | --- |
| Red — uncached | 2000ms, always | always |
| Amber — `use cache` on the data | skipped | component still re-runs |
| Violet — `use cache` on the component | skipped | skipped |

Caching the data caches a *value*; caching the component caches the *rendered
markup*, so nothing inside it runs again. The violet panel proves it: its
"rendered once at" timestamp does not move between requests.

The trade is granularity. A cached component is opaque — you cannot time a hit
from inside it (the timing would be cached too), and everything it renders
shares one entry and one lifetime. Cache data when part of the panel must stay
live; cache the component when the whole thing can be frozen.


## Performance audit

Warm caches, measured on a **reload** of `/ppr`:

| Panel | Badge |
| --- | --- |
| Static shell, both catalogs | `~105ms` |
| Red — uncached | `~2331ms` |
| Amber — `use cache` on the data | `~105ms` |
| Violet — `use cache` on the component | `~105ms` |
| Sky — private around **everything** | `~2031ms` |
| Sky — private on the **wrapper** only | `~105ms` |

Reading it:

- The uncached slot pays its 2000ms on **every** request. Nothing changes for
  it, because there is no cache.
- Both server-cached slots arrive with the shell.
- **The all-private slot stays slow.** Nothing it computes is stored on the
  server, so the 2000ms lookup runs again on every server render. That is the
  cost of putting the whole slot in a private scope.
- **The wrapped one is fast**, because the expensive half is a plain
  `use cache` component underneath. Same directive, different placement — and
  a ~20× difference between the two group 3 cards.
- Every strategy pays full price once per country: the caches are keyed by
  country code, so warming `IN` does nothing for `US`.

Amber and violet land together now. With no artificial render cost in the
components, a data-cache hit and a component-cache hit finish at about the same
time; what differs is *what* was skipped (a value vs. the rendered markup),
which the frozen "rendered once at" timestamp shows rather than the clock.

## `use cache: private` (group 3)

Two shapes of the same directive, side by side.

**First card — one private scope around everything.** The cookie read, the
lookup and the render all sit inside `use cache: private`. It works, and a
client navigation reuses all of it. But nothing reaches a server cache: the
2000ms lookup runs again on every server render, and what is cached is cached
per visitor, so no two users share any of it.

**Second card — private on the wrapper only.** The private scope covers just
the cookie read; inside it sits `CachedCountryPanel`, the same plain
`use cache` component group 2 renders. The expensive half stays on the server
and is shared by every user; only the per-user step is private.

That split is the point of the directive. Group 2's violet slot has to leave
its cookie read *uncached*, because plain `use cache` may not touch runtime
APIs — so every request re-runs it before the cache can even be consulted. A
private scope may read `cookies()`, so that step gets cached too, in the only
place it could safely live.

Confirmed in the suite: after a reload the first card's timestamp moves (its
browser-held cache is gone), while the second card's stays frozen — because the
`use cache` component inside it is still a server-side hit.

`use cache: remote` is deliberately not demonstrated: from this page's point of
view it behaves exactly like `use cache`, differing only in where the entry is
stored (a shared handler rather than this instance's memory).


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

## The hydration mismatch you may see once

React error #418 (a text mismatch) appears on `/ppr` if the status lines are
not marked `suppressHydrationWarning`. It is worth understanding rather than
just silencing, because it is a real property of `use cache`:

`use cache` stores entries **in memory**, so a freshly started server has an
empty cache. The document it serves then contains two different values for the
same text — the build's timestamp in the prerendered static shell, and a newly
computed one in the streamed slots. Verified on the wire:

```
1 x  computed once at 18:13:49.048Z   <- build-time prerender
2 x  computed once at 18:13:56.360Z   <- runtime cache fill
```

React patches the text during hydration and reports the mismatch. The
divergence is expected; only the warning is noise, so `StatusLine` carries
`suppressHydrationWarning`.

On Vercel this shows up more often than it does locally: instances recycle, and
each new one starts with a cold in-memory cache. `use cache: remote` is the
durable option if you want entries to survive that.

## Verifying the cache on a deployment (not just locally)

**The local suite cannot prove the caching works in production.** `pnpm start`
is one long-lived process, so plain `use cache` hits there and would not on
serverless — which is why the request-time slots use `use cache: remote`. See
§5.3 of `RESEARCH.md`.

Check a deployment by hand. Each cached entry freezes a `rendered once at`
timestamp, so a stable value across requests is a hit and a moving one is a
miss:

```bash
URL=https://nextjs-caching-experiments.vercel.app/ppr
for i in 1 2 3 4 5 6; do
  curl -s "$URL" \
    | grep -oE '"component-country-rendered-at"[^>]*>[^<]*' \
    | grep -oE '20[0-9-]+T[0-9:.]+Z'
done
```

Six identical lines is what you want. Six different ones means nothing is
being cached. Note that `private-all-rendered-at` moves every time by design —
`use cache: private` has no server-side cache — and that the first request
after any deploy is always a miss, because the cache key includes the build ID.

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

Direction: **Minimalism / Swiss** — grid-based, high contrast, no decoration
that does not carry meaning. Chosen with the `ui-ux-pro-max` skill, whose
design variables for this style specify `border-radius: 0` and `shadow: none`.

- **Square corners everywhere.** No rounding on cards, buttons, chips or code
  wells.
- **No animation.** Not even the loading skeleton pulses. The page exists to
  measure when content appears; motion would both ship extra work and blur what
  is being observed.
- **Neutral greys, not slate.** The strategy colours (emerald, red, amber,
  violet, sky) are the only hues on the page; a tinted background competed with
  them.
- **Full width, small padding.** The grids use the whole screen so more cards
  are visible without scrolling. Prose blocks keep their own `max-width`,
  because long lines are hard to read.
- **A solid bar down the left edge** marks each card's strategy, instead of
  outlining all four sides. Colour is never the only cue — every card also
  states its strategy in text.
- **Three columns on desktop**, two on tablet, one on mobile, across every
  page. Sections grow downward as demos and tools are added.
- **Cards keep independent heights** (`items-start`), deliberately. Stretching
  them to match looked tidier, but expanding one card's disclosure then grew
  the whole row and slid its neighbours' toggles out from under the cursor.
  Ragged bottoms are worth avoiding that.
- **Explanatory text is compressed into labelled rows, not paragraphs.** The
  index's explainer is three `LABEL — value` lines using the full width. Two
  earlier attempts were worse: a narrow column wasted the screen, and splitting
  the paragraphs into columns was harder to read than either. Dense and
  scannable beats laid-out-nicely for reference text.
- **Type** is IBM Plex Sans with JetBrains Mono for timings, tags and code,
  loaded through `next/font` so they self-host with no layout shift.

Contrast: muted text is 7.5:1 on light and 12.6:1 on dark; subtle text is 4.7:1
and 7.3:1. All clear WCAG AA.

Deviation from the style guidance: it suggests subtle hover transitions of
200–250ms. We ship none, because the brief was no animation.

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
