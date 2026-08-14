# Technical R&D Report

## Caching and instant page loads in Next.js 16 (Cache Components)

| | |
| --- | --- |
| **Document ID** | RND-NEXT-CACHE-001 |
| **Version** | 0.1 (draft — active research) |
| **Status** | In progress — approximately 35–40% of scope explored |
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

**The main finding is about placement, not the feature itself.** There are
three cache types, and the instinctive way to use the per-user one is roughly
20× slower than the correct way. The difference is one line moved up a level
(§5). This is the kind of mistake that would ship silently and be blamed on
"the framework being slow".

**Three risks are worth flagging now** (§8): one failure mode produces no error
at all, one produces confusing errors in production but not locally, and the
obvious way to measure any of this gives misleading numbers.

**Recommendation:** continue. No blocking issue found. Validation on real
infrastructure is the next milestone.

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
"use cache"           // this server's memory
"use cache: remote"   // a shared store, reachable by every server
"use cache: private"  // the visitor's browser. Never stored on the server.
```

| | `use cache` | `use cache: remote` | `use cache: private` |
| --- | --- | --- | --- |
| Shared between visitors | yes | yes | **no** — one per browser |
| Survives a server restart | no | yes | no |
| May read cookies inside | **no** | **no** | **yes** |
| Survives a page refresh | yes | yes | **no** |

---

### 5.3 `use cache: remote` is not behaviourally distinct *(provisional)*

**Observation.** We implemented a panel using `use cache: remote` and it was
indistinguishable on screen from the plain version: same restrictions, same
hit/miss behaviour, same timings. The difference is durability, which the
interface cannot show. The panel was removed to avoid implying a distinction
that does not exist.

**Implication.** Choose `remote` for reliability (surviving restarts, shared
across instances), not for observable behaviour.

**Caveat.** Tested on a single local server, where the durability advantage
cannot appear. Re-examine under O6.

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
  "use cache";                                 // shared: everything expensive
  const offer = await slowLookup(code);        // 2 seconds, once per country
  return <Offer data={offer} />;
}
```

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
| R1 | Silent no-op in `proxy.ts` | **High** | See below |
| R2 | Confusing errors in production only | Medium | Cold-cache mismatch |
| R3 | Misleading measurements | Medium | §7 |
| R4 | Two delivery paths behave differently | Medium | Fresh load vs link click |
| R5 | Unstable values break the build | Low | Loud and easy to fix |

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
| Q1 | How does this behave on real infrastructure with instance recycling? | All figures come from one local server. R2 is expected to be more visible. |
| Q2 | Is `use cache: remote` worth its network round trip for our data? | Determines whether we accept the added cost and dependency. |
| Q3 | How do we clear cached content when the source changes (webhook, admin edit)? | Only manual clearing has been exercised. |
| Q4 | How does this hold up with real authentication, where nearly everything is per-visitor? | §5.5 becomes the dominant design question. |
| Q5 | What happens on pages whose URL is inherently per-visitor (`/orders/[id]`)? | Little may be shareable; the approach may not apply. |
| Q6 | Error and empty states | Everything so far assumes the happy path. |

---

## 10. Recommendation

**Continue.** The mechanism does what we need and no blocking issue has been
found. Two conditions:

1. Treat §5.5 as a design rule for the real project, not a detail. It is the
   difference between fast and slow, and the wrong version looks correct.
2. Prioritise Q1 (real infrastructure). Every figure here comes from one
   machine, and the riskiest behaviour (R2) is the one local testing hides.

---

## 11. References

- Next.js documentation, version 16.3.1, as shipped in `node_modules/next/dist/docs`
- Prototype repository: `nextjs-caching-demo`, branch
  `enable-cache-components-instant-nav`
- `README.md` in the same repository — how to run the prototype and reproduce
  each measurement

---

## 12. Revision history

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1 | 15 Aug 2026 | Smit Vekariya | Initial report. Findings 5.1–5.7, risks R1–R5, open questions Q1–Q6. Scope ~35–40% explored. |
