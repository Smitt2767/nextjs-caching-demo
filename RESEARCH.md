# Technical R&D Report

## Caching and instant page loads in Next.js 16 (Cache Components)

| | |
| --- | --- |
| **Document ID** | RND-NEXT-CACHE-001 |
| **Version** | 0.2 (draft — active research) |
| **Status** | In progress — approximately 40–45% of scope explored |
| **Author** | Smit Vekariya · smit@cappital.co |
| **Date opened** | 14 August 2026 |
| **Last updated** | 15 August 2026 |
| **Prototype** | `nextjs-caching-demo` (throwaway; not production code) |
| **Under test** | Next.js 16.3.1, React 19.2.8, Node.js runtime |
| **Audience** | Engineering and product. No Next.js knowledge assumed. |

> **Working document.** Findings are added as the prototype progresses.
> Conclusions marked *provisional* may change. See §9 for what is still open.

---

## 1. Executive summary

We need a page that feels instant while still showing information specific to
each visitor. Next.js 16 offers a mechanism for this (Cache Components). Before
committing to it in the real project, we are testing how it behaves in a
disposable prototype.

**The approach works.** Shared parts of a page can be delivered immediately
while personal parts arrive moments later, and the expensive work behind them
can be computed once and reused. In measurements, a panel that took ~2.4
seconds without caching appeared in ~105ms with it.

**The headline finding is that local testing does not predict production
behaviour.** Deploying the prototype unchanged to Vercel removed the entire
benefit: every panel cached at request time reverted to its full ~2 seconds, on
every request. The default cache lives in one server process's memory, which is
a real cache on a local server and no cache at all on serverless. Nothing
errors and nothing warns — the code, the tests and the local numbers all still
look correct (§5.3). The fix is one directive, `use cache: remote`.

**The second finding is about placement.** The instinctive way to use the
per-user cache is roughly 20× slower than the correct way, and the difference
is one line moved up a level (§5.5). Like the first, the slow version looks
right.

Both findings share a shape worth noting: **the failure modes here are silent.**
Neither would be caught by a build, a type check, or a test suite.

**Four risks are worth flagging now** (§8): two failure modes produce no error
at all, one produces confusing errors in production but not locally, and the
obvious way to measure any of this gives misleading numbers.

**Recommendation:** continue. No blocking issue found, and the one serious
surprise has a one-line remedy — but every future measurement must be taken on
deployed infrastructure, not locally.

---

## 2. Objectives

| # | Objective | Status |
| --- | --- | --- |
| O1 | Determine whether shared and per-visitor content can coexist without the slowest part delaying the page | ✅ Confirmed |
| O2 | Establish where each cache type stores data, and the practical consequences | ✅ Confirmed |
| O3 | Establish how to cache content that depends on the visitor | ✅ Confirmed (§5) |
| O4 | Establish how cached content is cleared on demand | ✅ Confirmed (§6) |
| O5 | Identify failure modes before they reach production | 🟡 Partial (§8) |
| O6 | Validate on production infrastructure | ⬜ Not started |
| O7 | Validate with real authentication and per-user URLs | ⬜ Not started |

---

## 3. Scope

**In scope.** Behaviour of the three caching directives; how content is
delivered on a fresh page load versus an in-app link click; on-demand cache
clearing; observable failure modes; a repeatable way to verify claims.

**Out of scope.** Visual design, real data sources, authentication, and the
production deployment itself. The prototype uses deliberately slow fake
functions (a fixed 2-second delay) so that timing differences are unmistakable.

**Deliberately excluded.** `use cache: remote` was prototyped and removed —
see §4.3 for the reasoning.

---

## 4. Background and vocabulary

A page is made of parts. Some are identical for everyone (a heading, a pricing
table); others depend on who is asking (your country, your name, your cart).
Conventionally the entire page waits for the slowest part. The goal is to send
the shared parts immediately and let personal parts follow, without the page
looking broken in the interval and without repeating expensive work per
visitor.

| Term | Plain English |
| --- | --- |
| **Static shell** | The part built ahead of time and sent instantly. Same for everyone. |
| **Streaming** | Sending the rest a moment later, as it becomes ready. |
| **Suspense boundary** | A marked region allowed to arrive late; you supply a placeholder for the gap. |
| **Hard navigation** | A full page load — typing a URL, pressing refresh. |
| **Soft navigation** | Clicking a link inside the app. No new page load. |
| **Cache hit / miss** | Hit: the answer was already available. Miss: it had to be computed. |

---

## 5. Findings

Each finding was verified by running it. Figures come from a production build
on a local machine unless stated otherwise.

### 5.1 The framework does not provide visitor location

**Observation.** `NextRequest.geo` was removed in Next.js 15. Location arrives
only as a request header, added by whatever service sits in front of the app.

| Host | Header |
| --- | --- |
| Vercel | `x-vercel-ip-country` |
| Cloudflare | `cf-ipcountry` |
| AWS CloudFront | `cloudfront-viewer-country` |
| Local development | *none* |

**Implication.** Location-dependent behaviour cannot be exercised locally
without a deliberate override. Build one at the start, not as an afterthought.

```ts
// Preference first (works locally), then the real header (works in production).
const preference = (await cookies()).get("country")?.value;
if (preference) return preference;

const header = (await headers()).get("x-vercel-ip-country");
// Note: providers send "GB" for the United Kingdom, not "UK".
```

---

### 5.2 There are three caches; they differ in where the answer is stored

```ts
"use cache"           // this server process's memory
"use cache: remote"   // a shared store, reachable by every server
"use cache: private"  // the visitor's browser. Never stored on the server.
```

| | `use cache` | `use cache: remote` | `use cache: private` |
| --- | --- | --- | --- |
| Shared between visitors | yes | yes | **no** — one per browser |
| Survives a server restart | no | yes | no |
| **Works at request time on serverless** | **no** — see §5.3 | **yes** | n/a |
| May read cookies inside | **no** | **no** | **yes** |
| Survives a page refresh | yes | yes | **no** |
| Survives a deploy | no | no | n/a |

The third row is the one that matters most and is the hardest to see: it is
invisible on a local server, where every cache type appears to work. See §5.3.

---

### 5.3 **Critical finding.** On serverless, `use cache` does not cache request-time work at all

> **This supersedes the provisional 5.3 in v0.1**, which concluded from local
> testing that `use cache: remote` was "not behaviourally distinct". That
> conclusion was an artefact of the test environment. It was wrong.

**Context.** All v0.1 measurements came from one local server started with
`next start` — a single, long-lived process. The real project deploys to
Vercel, which is serverless.

**Observation.** After deploying the prototype unchanged, all five panels in
groups 2 and 3 took the full ~2 seconds on **every** request. Six consecutive
requests, reading the timestamp frozen into each cache entry:

```
req 1 -> 03:15:47.208Z
req 2 -> 03:15:49.988Z
req 3 -> 03:15:54.326Z     six requests
req 4 -> 03:15:57.329Z     six different timestamps
req 5 -> 03:16:00.315Z     zero cache hits
req 6 -> 03:16:03.085Z
```

Meanwhile the group 1 panels held a single timestamp across all six, and the
response carried `x-vercel-cache: HIT`. So the failure is precise: **the
pre-built part of the page was fine; everything cached at request time was
not.**

**Cause.** `use cache` stores entries in an in-memory LRU *inside the server
process*. The framework's own documentation states the consequence directly:

| Environment | Runtime caching behaviour |
| --- | --- |
| **Serverless** | Entries typically don't persist across requests (each request can be a different instance). Build-time caching works normally. |
| **Self-hosted** | Entries persist across requests. |

A single `next start` process is the second row. Vercel is the first. The same
code caches perfectly on one and not at all on the other.

**Why group 1 was unaffected.** Those panels take no request-time input, so
they are computed at build time and baked into the pre-rendered page, then
served from the edge. Groups 2 and 3 read a cookie, which defers them to
request time — into the ephemeral instance, where the cache is always cold.

**Resolution.** `use cache: remote` for anything cached at request time. It
stores entries in a shared store reachable by every instance; on Vercel the
store is provided automatically with no configuration. Two directives changed
in the prototype, covering three of the five panels.

**Confirmed after redeploying.** The same six-request check, on the same
deployment, with `remote` in place:

```
             component-cached panel   private wrapper panel   private (all-in-one)
req 1        03:35:35.538Z            03:35:35.535Z           03:35:35.469Z
req 2        03:35:35.538Z            03:35:35.535Z           03:35:38.637Z
req 3        03:35:35.538Z            03:35:35.535Z           03:35:41.384Z
req 4        03:35:35.538Z  frozen    03:35:35.535Z  frozen   03:35:44.989Z  moves
req 5        03:35:35.538Z            03:35:35.535Z           03:35:48.373Z
req 6        03:35:35.538Z            03:35:35.535Z           03:35:51.613Z
```

Computed once, reused by every subsequent request across instances. The third
column moving is the expected result, not a residual fault: `private` holds
nothing on the server, so a request carrying no browser state recomputes it
every time. This is the same behaviour it showed locally.

**What this does *not* fix.** The `private` panel (§5.5, shape A) is unchanged,
because `private` has no server-side cache by design — it is per-browser. It
took ~2 seconds on a fresh load locally too. That is correct behaviour, not a
regression.

**Cost.** A network round trip per lookup, plus platform storage fees. Entries
still do not survive a deploy: the cache key includes the build ID, so the
first request after every release pays full price.

**Commercial significance.** This is the most important finding in the report.
A team could validate caching locally, see every panel hit, ship, and silently
lose the entire benefit in production — while the code, the tests and the
local measurements all continue to look correct. Nothing errors. Nothing warns.

---

### 5.3a `remote` inside `private` is permitted when the element is returned, not awaited

**Context.** The documentation states that a remote cache **cannot** be nested
inside a private one, and shows it raising an error. §5.5 shape B places a
cached panel inside a `private` wrapper, so making that panel `remote` appeared
to be prohibited.

**Observation.** It builds and runs. The distinction is that the wrapper
*returns* the element rather than `await`ing it:

```tsx
export async function CountrySlot() {
  "use cache: private";
  const code = (await cookies()).get("country")?.value ?? "US";
  return <CachedOfferPanel code={code} />;   // returned, not awaited
}
```

React renders `CachedOfferPanel` after the private scope has already returned,
so the remote cache never actually runs inside it. Awaiting it there would be
genuine nesting and is expected to fail.

**Status:** *provisional* — verified by build and runtime execution, not by
reading the framework's implementation. Treat the boundary as fragile and
re-test on upgrade.

---

### 5.4 A cached function cannot read who is asking

**Observation.** `use cache` may not call `cookies()` or `headers()`. This is a
safety property: a cache is shared, so if it could read your cookie, one
visitor's data could be served to another.

**The required pattern** — read the personal value outside, pass it in:

```ts
// ✅ Correct
const { code } = await resolveCountry();   // reads the cookie — not cached
const offer = await getCachedOffer(code);  // cached, one entry per country

async function getCachedOffer(code: string) {
  "use cache";
  return db.offers.find(code);
}
```

```ts
// ❌ Will not build
async function getCachedOffer() {
  "use cache";
  const code = (await cookies()).get("country"); // not allowed
}
```

The argument becomes part of the cache key, so each country gets its own entry.
Warming one country does nothing for another.

---

### 5.5 **Principal finding.** Apply `private` to the per-visitor step, not the whole feature

**Context.** `use cache: private` is the only cache permitted to read cookies,
which invites wrapping an entire feature in it.

**Observation.** Doing so is roughly 20× slower than necessary.

```ts
// Shape A — the intuitive approach. Much slower than it appears.
export async function CountrySlot() {
  "use cache: private";
  const code = (await cookies()).get("country")?.value;
  const offer = await slowLookup(code);   // 2 seconds
  return <Offer data={offer} />;
}
```

Nothing here is ever stored on the server, so the two-second lookup runs again
for every visitor and on every server render. The expensive work has been
cached in the one place that helps least.

```ts
// Shape B — split by what is actually personal.
export async function CountrySlot() {
  "use cache: private";                        // personal: reading your cookie
  const code = (await cookies()).get("country")?.value ?? "US";
  return <CachedOfferPanel code={code} />;
}

async function CachedOfferPanel({ code }: { code: string }) {
  "use cache: remote";                         // shared: everything expensive
  const offer = await slowLookup(code);        // 2 seconds, once per country
  return <Offer data={offer} />;
}
```

> Shape B used plain `"use cache"` here in v0.1, which is correct on a
> long-lived server and useless on serverless. See §5.3, and §5.3a for why this
> is permitted inside a `private` wrapper.

**Measurement** — identical work, warm cache, same page:

| Shape | Time to appear |
| --- | --- |
| A — everything inside `private` | **~2031 ms** |
| B — `private` on the wrapper only | **~105 ms** |

**Rule of thumb.** `private` means *"cache the per-visitor step"*, not *"cache
this feature"*. Identify what is genuinely personal (usually: reading an
identifier) versus what is merely derived from it (usually: everything
expensive), and cache them separately.

**Why this matters commercially.** Shape A is the natural reading of the
documentation. A team could adopt it, see poor performance, and conclude the
framework is slow — when the fix is one line moved up a level.

---

### 5.6 Caching data and caching a component are different

```ts
// Caches a VALUE. The surrounding component still re-renders each request.
async function getOffers() {
  "use cache";
  return db.offers.findAll();
}

// Caches the RENDERED OUTPUT. On a hit, nothing inside runs at all.
async function OfferPanel() {
  "use cache";
  const offers = await db.offers.findAll();
  return <ul>{offers.map(/* … */)}</ul>;
}
```

Component caching is stronger — it skips rendering too. Two costs:

1. **It is opaque.** You cannot time a cache hit from inside it; the timing code
   is cached along with everything else. We proved hits instead via a timestamp
   that never changes.
2. **One entry, one lifetime.** If any part must stay live, the whole panel
   cannot be component-cached.

**Guidance.** Cache the component when the panel can be frozen as a unit; cache
the data when part of it must stay fresh.

---

### 5.7 Three tools clear cached content, for different situations

```ts
updateTag("offers-IN")             // expire now; next request waits for fresh data
revalidateTag("offers-IN", "max")  // serve the old value while refreshing behind it
revalidatePath("/offers")          // discard everything on this page
```

- **`updateTag`** — "I changed something and want to see it." Callable only
  from a Server Action; throws elsewhere.
- **`revalidateTag`** — background freshening where a slightly old value is
  acceptable. Requires a lifetime profile.
- **`revalidatePath`** — blunt. Discards everything the page can reach.

**Verified.** Expiring a single tag left every other cached panel untouched;
`revalidatePath` reset all of them.

**Maintenance risk.** Tag names are plain strings used in two places (where
content is cached, and where it is cleared). They drift apart silently. We
centralised them into one file after hitting this.

---

## 6. Verification method

Claims in this report are covered by automated checks so they cannot quietly
become untrue.

- **34 end-to-end tests** run against a **production build**, never the
  development server — development behaves differently and would give false
  confidence.
- The central test **cannot pass for the wrong reason**: it asserts the instant
  parts are present *and* the deferred parts are still absent. If the mechanism
  broke, the second half fails.
- Timing claims are asserted as **ordering** ("A appears before B"), never as
  stopwatch values, so they do not fail on a slow machine.
- Tests run **one at a time**. They share server cache state, and a cache being
  cleared by one test while another expects a hit produced failures for the
  wrong reason.

**Known limitation, and the one that mattered.** All of the above runs against
a **local** production build. That is a long-lived single process, and §5.3
showed it reports cache hits that a serverless deployment does not — so a green
suite proves the logic is right, not that the caching survives production.

Production caching is therefore verified separately and manually, by requesting
the deployed page repeatedly and comparing the timestamp frozen into each cache
entry. A stable timestamp across requests is a hit; a moving one is a miss.
This is the check that found §5.3, and it is the check to repeat after any
change to a cache directive.

---

## 7. Measurement caveat

Each panel in the prototype reports when it appeared. Reaching a trustworthy
number took three attempts:

| Attempt | Result |
| --- | --- |
| `useEffect` + `performance.now()` | Every panel reported the **same** number — effects run in one batch once the page becomes interactive, so cached panels were indistinguishable from instant ones. |
| Ref callback | Reports when the framework commits, which waits for the slowest panel — making the **fastest** thing on the page look like the slowest. |
| **Inline script beside each panel** | Runs while the browser is still reading that chunk, so each panel is stamped as its own content arrives. **This works.** |

A further trap: clicking a link does not create a new page, so the browser's
clock keeps running from when the site was first opened. Uncorrected, every
figure silently includes time spent on the previous page.

**These numbers are for comparing panels on one screen after a refresh.** They
are not server response times and not what a visitor perceives. Use the
browser's Performance panel for anything real.

---

## 8. Risks identified

| # | Risk | Severity | Detail |
| --- | --- | --- | --- |
| R6 | **Local testing overstates caching** | **High** | Confirmed in production — see below |
| R1 | Silent no-op in `proxy.ts` | **High** | See below |
| R2 | Confusing errors in production only | Medium | Cold-cache mismatch |
| R3 | Misleading measurements | Medium | §7 |
| R4 | Two delivery paths behave differently | Medium | Fresh load vs link click |
| R5 | Unstable values break the build | Low | Loud and easy to fix |

**R6 — caching that works locally may do nothing in production.** Promoted to
the top of this table because it is the only risk we have now *observed*
occurring rather than anticipated. Plain `use cache` caches request-time work on
a long-lived server and not on serverless (§5.3). The symptom is a total loss of
caching with no error, no warning and no test failure.

*Mitigation:* use `use cache: remote` for anything evaluated at request time —
in practice, anything behind a `<Suspense>` boundary that reads a cookie,
header or search parameter. Reserve plain `use cache` for content with no
request-time input, which is pre-built and unaffected.

*Process mitigation, and the more important one:* **treat local cache
measurements as unverified.** Any performance claim about caching must be
reproduced against a deployment before it is believed.

**R1 — `use cache` does not work in `proxy.ts`** (Proxy is Next 16's renamed
middleware: code running before a request reaches the app). Tested directly:

- With `cacheLife()`: throws on **every request** —
  `cacheLife() can only be called inside a "use cache" function`.
- Without `cacheLife()`: **no error and no caching.** Three requests returned
  three different values. A silent no-op.

Neither case fails the build, so this can ship in the belief that caching is
active. *Mitigation:* keep cached work in pages and components; leave Proxy for
routing only.

**R2 — cold caches produce a confusing error in production.** `use cache`
stores in memory, so a freshly started server has nothing cached. The page it
sends then contains two different values for the same text — one built ahead of
time, one computed on that request — and React reports a mismatch (#418).

```
1 x  computed once at 18:13:49.048Z   <- built ahead of time
2 x  computed once at 18:13:56.360Z   <- computed on this request
```

Expected behaviour; only the warning is noise. **More frequent in production
than locally**, because serverless instances recycle and each starts cold.
*Mitigation:* suppress the warning at the specific element, or use
`use cache: remote` for durability.

**R4 — a page has two shells.** Arriving by URL and arriving by clicking a link
are different paths. A component-cached panel streams in on a fresh load but is
already resolved on a click. *Mitigation:* test both; never assume one implies
the other.

**R5 — unstable values break the build.** `Date.now()`, `Math.random()` and
similar fail pre-rendering with a clear error. `performance.now()` is permitted
for timing.

---

## 9. Open questions

Ordered by importance to the decision.

| # | Question | Why it matters |
| --- | --- | --- |
| ~~Q1~~ | ~~How does this behave on real infrastructure?~~ | **Answered — see §5.3.** Plain `use cache` did nothing at request time. Closed, and it changed the design. |
| ~~Q7~~ | ~~Does `use cache: remote` restore caching on Vercel?~~ | **Answered — see §5.3.** Yes: entries held across all six requests after redeploying. |
| Q8 | What does `remote` cost us in latency and platform fees at real traffic? | It is now mandatory for request-time work (§5.3), so the cost is no longer optional and needs a figure. |
| Q2 | Is `use cache: remote` worth its network round trip for our data? | Now unavoidable rather than optional (§5.3), so this becomes a cost question, not a choice. |
| Q3 | How do we clear cached content when the source changes (webhook, admin edit)? | Only manual clearing has been exercised. |
| Q4 | How does this hold up with real authentication, where nearly everything is per-visitor? | §5.5 becomes the dominant design question. |
| Q5 | What happens on pages whose URL is inherently per-visitor (`/orders/[id]`)? | Little may be shareable; the approach may not apply. |
| Q6 | Error and empty states | Everything so far assumes the happy path. |

---

## 10. Recommendation

**Continue.** The mechanism does what we need and no blocking issue has been
found. Three conditions:

1. **Adopt §5.3 as a rule: anything cached at request time uses
   `use cache: remote`.** Plain `use cache` is for content with no request-time
   input. Getting this wrong costs the entire benefit and produces no error.
2. Treat §5.5 as a design rule for the real project, not a detail. It is the
   difference between fast and slow, and the wrong version looks correct.
3. **Measure on a deployment, never locally.** Q1 is closed, and the answer was
   that our local figures were unrepresentative. This applies to every
   performance claim we make from here, including the ones already in this
   report (§7).

The pattern across §5.3 and §5.5 is that both wrong answers are the intuitive
ones and both fail silently. Whatever we build in the real project should make
these two choices explicit at review time rather than leaving them to judgement.

---

## 11. References

- Next.js documentation, version 16.3.1, as shipped in `node_modules/next/dist/docs`
  — in particular `directives/use-cache.md` §"Runtime caching considerations"
  and `directives/use-cache-remote.md`, which state the §5.3 behaviour directly
- Deployment under test: <https://nextjs-caching-experiments.vercel.app/ppr>
  (Vercel, serverless)
- Prototype repository: `nextjs-caching-demo`, branch
  `enable-cache-components-instant-nav`
- `README.md` in the same repository — how to run the prototype and reproduce
  each measurement

---

## 12. Revision history

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.2 | 15 Aug 2026 | Smit Vekariya | First deployment to Vercel. **§5.3 rewritten and its v0.1 conclusion withdrawn**: plain `use cache` does not cache request-time work on serverless. Fix verified in production. Added §5.3a (`remote` inside `private`). Added risk R6 (highest). Closed Q1 and Q7, opened Q8. Updated §5.2, §5.5, §6, executive summary and recommendation. Prototype changed to `use cache: remote` in two places. |
| 0.1 | 15 Aug 2026 | Smit Vekariya | Initial report. Findings 5.1–5.7, risks R1–R5, open questions Q1–Q6. Scope ~35–40% explored. |
