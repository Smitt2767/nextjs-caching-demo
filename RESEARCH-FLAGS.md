# Technical R&D Report

## Feature flags and experiments under Cache Components (GrowthBook)

| | |
| --- | --- |
| **Document ID** | RND-NEXT-FLAGS-002 |
| **Version** | 0.5 (design study; steps 1–7 built, all flags on the Flags SDK) |
| **Status** | In progress. Measurements M1–M9 recorded in §13.1. |
| **Author** | Smit Vekariya · smit@cappital.co |
| **Date opened** | 15 August 2026 |
| **Prototype** | `nextjs-caching-demo` (throwaway; not production code) |
| **Under test** | Next.js 16.3.1, React 19.2.8, GrowthBook (version TBD) |
| **Companion** | [RND-NEXT-CACHE-001](./RESEARCH.md) — the caching findings this builds on |
| **Audience** | Engineering and product. No Next.js knowledge assumed. |

> **Read §13 before acting on anything here.** RND-NEXT-CACHE-001 §5.3 established
> that this stack's documentation can be correct and still mislead, because the
> failure was invisible locally. Every claim below is therefore tagged with where
> it came from: **[docs]**, **[vendor]**, **[inferred]**, or **[measured]**.
> Nine **[measured]** results are now recorded in §13.1, from steps 1–7. Four
> of them (M2, M3, M6, M9) are build-breaking behaviours whose error messages
> point somewhere other than the cause, one (M5) came from a bug report rather
> than from anything predicted here, and one (M8) is a correctness trap that
> looks like an optimisation. Everything else is still unverified.

---

## 1. Executive summary

**The premise "feature flags make a page dynamic" is false, and it is worth
dismantling before choosing an architecture.** A flag decision is a pure function
of two things: a ruleset (identical for every visitor, changes when someone edits
a flag) and attributes (specific to this visitor). The ruleset is ordinary
cacheable content. The attributes are ordinary request data. The function joining
them costs microseconds and touches no network. Nothing about that is inherently
dynamic — the dynamism is in the attributes alone, and only in the parts of the
page that consume them.

**All four of the attributes we need are request-time.** Country, device,
audience, and daypart cannot be known at build. This does not force the page to
be request-time, because the thing worth prerendering is not the attributes but
the *decisions* they produce.

**The single most useful idea in this document:** precompute the decision space,
not the attribute space. Our attribute set has roughly 480 combinations. The
experiments we would actually run have around 12 outcomes. Building 480 pages is
absurd; building 12 is routine. The number of pages you must prerender is the
product of the flags' option counts and is entirely independent of how much you
know about the visitor (§7.1).

**Four integration tiers are available**, and a real application uses more than
one at once (§6). Ranked by what they cost and what they buy:

| Tier | Rendering | Use for |
| --- | --- | --- |
| 0 — shell flag | build time, in the static shell | release toggles, kill switches |
| 1 — streamed decision | request time, behind `<Suspense>` | most experiments — **the default** |
| 2 — precompute + rewrite | build time, one page per decision | above-the-fold hero/pricing tests |
| 3 — client-side | none | never, for anything that matters |

**Next.js 16.3 changed the calculus for Tier 2.** The two long-standing
objections to precompute — no fallback for un-built permutations, and having to
thread the encoded value through every component — are both now solved, by App
Shells and by `next/root-params` respectively (§7.3). This makes the build-time
option materially more attractive than the community write-ups from earlier
versions suggest.

**The highest risk is not performance, it is measurement integrity.** If an
experiment's exposure event fires inside a cached scope, it fires once per cache
entry instead of once per visitor. The page looks perfect, the cache works
perfectly, and the experiment results are silently worthless (§9). This is the
same class of failure as §5.3 in the companion report: correct-looking code,
no error, wrong outcome.

**What steps 1–5 have already shown** (§13.1). A flag with no targeting really
does cost nothing at request time — one read at build, zero per request. Two
build-breaking behaviours surfaced that no amount of reading would have
predicted: a `use cache` scope that throws fails the *build* even when the caller
catches the error, and a `cacheLife` with `stale` under five minutes makes shell
content unprerenderable while reporting an error that names something else
entirely. Both are now guarded in code, as risks F8 and F9.

**And one finding that arrived as a bug report rather than a prediction** (M5).
A flag rendered into the static shell shows its *old* value on first paint and
corrects itself a moment later, whenever it changed since the shell was built.
It is not a defect in the flag code — it is what a partial prerender looks like
when the cached value underneath it has moved. The generalisation is the useful
part, and it applies well beyond flags: **anything cached into the shell of a
partially-prerendered route can be stale, and serving it instantly is
incompatible with it always being current.** Neither `use cache: remote` nor a
`<Suspense>` boundary changes that; only regenerating the shell, or keeping the
value out of it with `await io()`, does.

**Recommendation:** proceed, building Tier 1 as the default and Tier 2 for the
hero slot only. Build the exposure counter described in §11.3 first — it is the
one demo that will change how the team writes this code.

**Amended since 0.1:** §11.1 recommended `@flags-sdk/growthbook` wholesale. The
position after measuring it (M7) is narrower and better: take the **Flags SDK**,
leave the **GrowthBook adapter**. The SDK's `Adapter` interface is a `decide`
function and four optional fields, so supplying our own — one that reads the
`use cache` ruleset instead of fetching — keeps `precompute`, the Flags
Explorer, the discovery endpoint and the exposure hooks while removing the stock
adapter's per-request round trip — and, per M9, it is the only way step 3 exists
at all, because the stock adapter's own fetch cannot be prerendered.

**Amended again in 0.5.** Every flag is now declared through the SDK, including
the prerendered one, and each implements `decide` directly against the cached
ruleset — no adapter at all, since an adapter earns its place when several flags
share non-trivial resolution logic and ours is one call.

The objection that had kept step 3 on a separate path turned out to be solvable
rather than inherent: `flag()` reads `headers()`, so the untargeted flag is read
with a stand-in request, which takes the one dispatch branch that never touches
`next/headers`. The other objection — that `flag()` discards GrowthBook's reason
code and experiment result — is real and was accepted rather than worked around:
the pages render values, and the explanatory readouts were dropped with them.

---

## 2. Objectives

1. Determine whether feature flags and experiments are compatible with Cache
   Components at all, and under what constraints.
2. Determine whether integrating them forces the page to request-time rendering,
   and if not, what build-time options exist.
3. Establish where each of our four targeting attributes can legally be read.
4. Produce a caching strategy for each moving part: ruleset, evaluation, rendered
   output, and sticky assignment.
5. Establish how this is done in industry, and where our situation differs.
6. Produce a build plan for Part 2 of the prototype.

## 3. Scope

**In scope.** GrowthBook as the flag provider; Next.js 16.3 App Router with
`cacheComponents: true`; Vercel as the deployment target; the attribute set
below; both feature flags and A/B experiments.

**Out of scope for now.** Multi-armed bandits; feature flag governance and
cleanup process; statistical analysis of results; self-hosting GrowthBook;
mobile SDKs.

**The attribute set under test.** Taken from the existing prototype selector,
with US city replaced by country:

| Attribute | Values | Cardinality |
| --- | --- | --- |
| `audience` | ad-anxiety, ad-belonging, organic, corporate, returning | 5 |
| `device` | mobile, low-end-mobile, desktop, tablet | 4 |
| `country` | IN, US, UK, BR, … | ~8 |
| `daypart` | day, evening, night | 3 |

Plus one attribute that is not a targeting dimension but is structurally
required: a stable anonymous `id` for bucketing (§5.2).

---

## 4. Background: what a flag system actually is

### 4.1 Three parts, not one

Every evaluation in every flag system reduces to:

```
decision = evaluate(ruleset, attributes)
```

| Part | What it is | Where it comes from | Cost |
| --- | --- | --- | --- |
| **Ruleset** | JSON: feature definitions, targeting rules, experiment configs, traffic weights, saved groups. GrowthBook calls this the *payload*. | Network fetch from the GrowthBook CDN | ~10–100ms of I/O |
| **Attributes** | This visitor's country, device, audience, daypart, id | Request headers and cookies | ~0, but request-bound |
| **`evaluate`** | Pure function. Hashes the bucketing attribute, walks the rules, returns a value. | Local CPU | microseconds, no I/O **[docs]** |

Three parts with three completely different caching characters, and almost every
mistake in this area comes from treating them as one indivisible "flag call".

- The ruleset is **shared content**. It is the same bytes for every visitor on
  Earth. It is exactly the kind of thing `use cache` exists for.
- The attributes are **request data**, no different from the country cookie the
  prototype already reads.
- The evaluation is **free**. It is a hash and some comparisons. It should never
  be cached, because caching it costs more than running it.

### 4.2 Why the "flags make pages dynamic" premise is false

The intuition is: flags depend on the user, the user is only known at request
time, therefore any page with a flag is a request-time page.

The error is in the last step. The page does not depend on the user; it depends
on the *decision*, and many users share a decision. This is precisely the lesson
of RND-NEXT-CACHE-001 §5.5 restated in a new domain: the prototype's violet slot
does not cache per visitor, it caches per country, because the country is what
the output actually varies on. Fifty thousand Indian visitors share one cache
entry.

Substitute "variant" for "country" and the entire existing architecture carries
over unchanged. **A flag variant is just another cache key component.** Read the
attributes outside the cached scope, evaluate, pass the resulting variant in as
an argument, and the cache splits by variant instead of by person.

### 4.3 Four kinds of flag, four different answers

Conflating flag types is the second common error. The industry taxonomy (Fowler)
maps cleanly onto our four cache directives:

| Kind | Example | Varies by user? | Lifetime | Correct home |
| --- | --- | --- | --- | --- |
| **Release toggle** | ship half-built checkout dark | No | weeks | `use cache` — static shell |
| **Ops toggle / kill switch** | disable recommendations under load | No | permanent | `use cache` with `cacheLife('seconds')`, or Edge Config |
| **Experiment toggle** | hero A/B/C | Yes, by bucket | days–weeks | `use cache: remote` keyed by variant, or precompute |
| **Permission / entitlement** | beta feature for this account | Yes, by identity | permanent | `use cache: private`, or uncached |

Two of the four do not vary per visitor at all. Those can be resolved at build
time and live in the static shell, costing nothing at request time. In practice
teams route every flag through the same request-time code path, which converts
what should have been free into a per-request cost — and then conclude that flags
are expensive.

**Classify the flags before choosing where to evaluate them.** This is the
cheapest optimisation available and it requires no code.

---

## 5. The attributes, and where each may legally be read

### 5.1 Provenance table

Under Cache Components, "where a value may be read" is a hard constraint, not a
style preference. `cookies()` and `headers()` throw inside `use cache` and inside
`use cache: remote`; only `use cache: private` may read them **[docs, and
measured in RND-NEXT-CACHE-001 §5.4]**.

| Attribute | Source | In proxy? | In `use cache`? | Notes |
| --- | --- | --- | --- | --- |
| `country` | `x-vercel-ip-country` header | ✅ | ❌ — pass as argument | `NextRequest.geo` was removed in v15; geo is whatever the platform injects **[docs]** |
| `device` | `userAgent(req).device` from User-Agent | ✅ | ❌ | Parse in proxy; do not ship UA parsing into the page |
| `audience` | `?utm_*` on landing, persisted to a cookie | ✅ | ❌ | `searchParams` is request-time. Must be persisted or it is lost on the second page view (§5.2) |
| `daypart` | `Date.now()` + timezone | ✅ | ⚠️ — needs `await io()` | See §5.2 |
| `id` (bucketing) | cookie, minted if absent | ✅ **only** | ❌ | See §5.2 |

Every attribute is request-time. None can be derived at build. As established in
§4.2, this constrains where the *decision* is made, not where the page is
rendered.

### 5.2 Three attributes that need special handling

**The anonymous `id` forces proxy into the design.** GrowthBook assigns variants
by hashing a bucketing attribute — normally `id`. A first-time visitor has no id,
so something must mint one and set a cookie. A Server Component cannot set
cookies during render; only Server Actions, Route Handlers, and Proxy can
**[docs]**. Therefore proxy must mint the id on first request, on every tier
including Tier 1. This is not optional and it should be decided early, because it
means `proxy.ts` exists in this project regardless of which tier we choose.

**`daypart` is a prerendering hazard.** `new Date()` evaluated during a prerender
is captured at build and frozen for every visitor thereafter, silently. Next.js
16.3 introduced `io()` for exactly this: `await io()` suspends during prerender so
the read is excluded from the static shell, while resolving immediately during a
real request **[docs]**. Inside a `use cache` scope `io()` is a no-op and the
value is captured — which is correct when the capture is what you want, and a bug
when it is not. Compute daypart in proxy where the ambiguity does not exist.

**`audience` decays.** UTM parameters exist only on the landing request. If the
experiment spans more than one page view, proxy must persist the audience to a
cookie on first sight and read from the cookie thereafter. Otherwise a returning
visitor silently reclassifies as `organic` mid-experiment, and the assignment
changes underneath them.

---

## 6. The four integration tiers

### 6.0 Tier 0 — shell flags (build time)

For flags with no per-visitor targeting: release toggles and kill switches.

```ts
// src/lib/flags/payload.ts
export async function getRuleset() {
  "use cache";
  cacheLife("minutes");
  cacheTag("growthbook-payload");
  const res = await fetch(`${API_HOST}/api/features/${CLIENT_KEY}`);
  return res.json();
}

// Evaluated with no attributes -> the answer is the same for everyone,
// so it prerenders straight into the static shell.
export async function getReleaseToggle(key: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("growthbook-payload");
  const gb = new GrowthBookClient();
  gb.initSync({ payload: await getRuleset() });
  return gb.isOn(key, { attributes: {} });
}
```

Cost at request time: zero. The flag value is baked into the prerendered HTML.
Flipping the flag does not require a deploy — a GrowthBook SDK webhook calls
`revalidateTag('growthbook-payload', 'max')` and the shell regenerates (§8.6).
Change latency is therefore the `cacheLife` window plus one regeneration, not a
CI cycle.

This tier is underrated. A large share of production flags are ops toggles that
never target anyone, and running them through request-time evaluation buys
nothing.

### 6.1 Tier 1 — streamed decision (request time) · **recommended default**

The page keeps its prerendered shell. A `<Suspense>` boundary reads attributes,
evaluates, and renders the variant. The variant markup is cached on the server,
keyed by variant.

```tsx
// The uncached wrapper — reads request data, evaluates, fires exposure.
export async function HeroSlot() {
  const attributes = await readAttributes();       // cookies + headers
  const variant = await heroFlag(attributes);      // pure, microseconds
  trackExposure(variant, attributes);              // OUTSIDE the cache — see §9
  return <HeroVariant variant={variant} />;
}

// The cached child — shared by every visitor in this variant.
async function HeroVariant({ variant }: { variant: HeroVariant }) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(`hero-${variant}`);
  return <Hero {...(await renderHero(variant))} />;
}
```

This is structurally identical to the prototype's group 2, with `variant` where
`code` used to be. `remote` rather than plain `use cache` for the reason
established in RND-NEXT-CACHE-001 §5.3 — this runs at request time on serverless,
where the in-memory cache does not exist **[measured, companion report]**.

- **Prerendering:** shell yes, hero no.
- **Cardinality:** unlimited. Attribute combinations do not multiply anything.
- **Flag change latency:** seconds (payload tag revalidation).
- **Cost:** the flagged region streams in after the shell. For a hero, that is a
  visible reflow.

### 6.2 Tier 2 — precompute and rewrite (build time)

Proxy evaluates the flags, encodes the *results* into a URL segment, and rewrites
to a fully prerendered page for that combination. The browser URL is unchanged.

```ts
// proxy.ts
import { precompute } from "flags/next";
import { heroFlags } from "./flags";

export const config = { matcher: ["/"] };

export async function proxy(request: NextRequest) {
  const code = await precompute(heroFlags);
  return NextResponse.rewrite(
    new URL(`/${code}${request.nextUrl.pathname}${request.nextUrl.search}`,
            request.url),
    { request },
  );
}
```

```tsx
// app/[code]/page.tsx
export async function generateStaticParams() {
  const codes = await generatePermutations(heroFlags);
  return codes.map((code) => ({ code }));
}
```

Calling a flag with `(code, group)` reads the value out of the precomputation
rather than re-running `decide()` **[vendor]**. Requires `FLAGS_SECRET`, a 32-byte
base64url random string, set per environment **[vendor]**.

**Why the URL must carry the variant at all.** A CDN keys its cache on the URL.
If the page branched on a header without the URL changing, one visitor's variant
would be served to the next. Encoding the decision into the path makes the cache
key correct by construction. This is not a Next.js quirk — it is the same reason
Akamai and Fastly deployments have manipulated cache keys for A/B tests for two
decades (§10).

- **Prerendering:** the whole page, hero included.
- **Cardinality:** Π(options per flag). See §7.
- **Flag change latency:** requires regeneration of the affected permutations.
- **Cost:** proxy runs on every request to the matched paths, including RSC
  prefetches **[inferred — measure, §13]**.

### 6.3 Tier 3 — client-side

GrowthBook's browser SDK evaluates after hydration. The page is fully static and
the variant swaps in on the client.

Acceptable for below-the-fold, low-stakes changes. Not acceptable for anything
above the fold: the visitor sees the control first, then the treatment, which
damages both conversion and Core Web Vitals. The traditional remedy — an
anti-flicker snippet that hides the page until the SDK responds — trades a flash
for a blank screen and is worse. Listed for completeness; recommended against.

### 6.4 Comparison

| | Tier 0 shell | Tier 1 streamed | Tier 2 precompute | Tier 3 client |
| --- | --- | --- | --- | --- |
| Hero prerendered | ✅ | ❌ | ✅ | ❌ (flashes) |
| Per-visitor targeting | ❌ | ✅ | ✅ | ✅ |
| Build cost | none | none | Π(options) pages | none |
| Attribute cardinality limit | n/a | none | none¹ | none |
| Flag change latency | seconds | seconds | regeneration | seconds |
| Proxy required | for id only | for id only | yes | no |
| Exposure tracking | n/a | server, uncached | proxy or client | client |

¹ Attribute cardinality never affects Tier 2. Only the number of flag *outcomes*
does. This is the point of §7.1.

---

## 7. Build time: what is actually possible

### 7.1 Precompute the decisions, not the attributes

This is the central result of this study.

The instinct is to enumerate what you know about the visitor. Our attribute set:

```
5 audiences × 4 devices × 8 countries × 3 dayparts = 480 combinations
```

480 prerendered pages, most never visited, all invalidated on every deploy. This
is why teams look at precompute and conclude it does not scale.

But the URL does not need to encode the attributes. It needs to encode the
**decisions**. Suppose the page runs three experiments:

```
hero copy (3 variants) × pricing badge (on/off) × CTA (2 variants) = 12 pages
```

Twelve. The 480 attribute combinations are the *input* to a function computed in
proxy in microseconds; only its 12 possible *outputs* need to exist as pages.

> **The number of pages to prerender is the product of the flags' option counts.
> It is independent of attribute cardinality.** Adding a fifth targeting
> dimension, or a hundred more countries, adds zero pages.

The reduction is real but not unconditional. Where a decision genuinely varies
per country — "show INR pricing" — country enters the decision space and you pay
8 pages for it. Even then the other three dimensions collapse: 8, not 480. You
pay only for the dimensions your output actually varies on, which is the same
principle as the existing prototype's per-country cache keys.

Two corollaries worth stating:

- **Declaring `options` on each flag matters.** The Flags SDK encodes declared
  options compactly; undeclared values get inlined into the URL, and ISR requires
  URLs under 1024 characters **[vendor]**.
- **Scope flag groups per page tree.** One global group multiplies every page's
  permutations by every flag in the app. The vendor guidance is explicit about
  this and it is the difference between 12 pages and 12,000 **[vendor]**.

### 7.2 What Next.js 16.3 changed

Community write-ups on precompute predate this release and describe two problems
that no longer apply:

**Problem 1: un-built permutations blocked the user.** Previously, a URL not
covered by `generateStaticParams` meant a cold full-server render with no
fallback. As of 16.3, Next serves the **App Shell** instantly for unlisted
params, then upgrades the route in the background; subsequent visitors get the
upgraded result, and a `<Link>` prefetch counts as the first visit **[docs]**.

This means you no longer choose between "build all permutations" and "nothing".
Prerender the four combinations you expect most traffic in; the other eight get an
instant shell and are upgraded on first contact. Build time stops being a
function of the permutation count.

**Problem 2: the encoded code had to be threaded through every component.** As of
16.3, `next/root-params` exposes route params above the root layout as importable
getters callable from any Server Component, with no prop drilling. Critically:
**a cached function that reads a root param gets only that param in its cache
key**, not every dynamic segment in the route **[docs]**.

Placing the precompute segment at `app/[code]/layout.tsx` — making `[code]` a
root param — should therefore give both ergonomics and correct cache-key scoping
for free. **[inferred]** — combining Flags SDK precompute with `next/root-params`
is not something the vendor documents; it follows from both specifications but
must be verified (§13).

### 7.3 The cost of a flag change

Tier 2's real weakness is not build count, it is change latency. Flipping a flag
in the GrowthBook UI changes what `decide()` returns, which changes which code
proxy computes, which routes traffic to a different prerendered page. That works
immediately — **provided the target page exists**. If it does not, the visitor
gets an App Shell and a background upgrade, which is acceptable.

The failure case is a flag whose *option set* changes: adding a fourth hero
variant means new codes that no `generateStaticParams` run has produced. This
degrades gracefully to App Shells rather than breaking, but the first visitors in
that variant get a slower page. Adding options should be paired with a deploy.

---

## 8. Caching strategy, part by part

### 8.1 The ruleset (payload)

This is the only I/O in the whole system, so it is the only thing worth caching
carefully. Three viable stores:

1. **Vercel Edge Config** — GrowthBook syncs the payload into it, keyed by the
   SDK client key. Near-zero read latency on Vercel, available in proxy, survives
   deploys. **Recommended on Vercel**, and now implemented in
   `src/lib/flags/ruleset.ts` with the CDN as fallback.

   Two corrections from wiring it up **[measured]**: the Vercel marketplace
   integration provisions the connection string as `EXPERIMENTATION_CONFIG`, not
   `GROWTHBOOK_EDGE_CONNECTION_STRING`; and the connection string's `?token=`
   query parameter is rejected by the REST endpoint, which wants
   `Authorization: Bearer`. The `@vercel/edge-config` client handles the latter,
   but raw `curl` against the string as provisioned will 401.
2. **`use cache: remote` + `cacheTag('growthbook-payload')`** — works anywhere,
   shared across instances. Does not survive a deploy **[docs]**, so every deploy
   causes a fresh payload fetch from every cold instance.
3. **The `fetch` Data Cache** — `fetch(url, { next: { revalidate, tags } })`,
   which is what GrowthBook's own Next.js guide recommends **[vendor]**. Notably,
   the Next.js migration guide states the fetch Data Cache "persists cached
   responses across deployments and across serverless instances" — a stronger
   guarantee than `use cache: remote` offers **[docs]**. Whether this layer still
   functions under `cacheComponents: true` needs verifying (§13).

**Do not rely on GrowthBook's own cache.** `configureCache({ staleTTL })` is an
in-memory, per-process cache — structurally identical to plain `use cache`, and
therefore, on serverless, structurally identical to no cache at all. This is the
same trap documented in RND-NEXT-CACHE-001 §5.3, arriving from a second vendor.
GrowthBook's Next.js guide already says to set `disableCache: true` and delegate
to the framework **[vendor]**; now we know precisely why.

### 8.2 The evaluation

**Do not cache it.** It is a hash and a rule walk. A `use cache: remote` lookup
requires a network round trip and incurs platform fees **[docs]**; the thing it
would be avoiding costs microseconds. Caching here is strictly negative.

### 8.3 The rendered variant

Cache keyed by **variant**, never by user. `use cache: remote` with
`cacheTag('hero-' + variant)`. Identical in shape to `CachedCountryPanel` in the
existing prototype, and it inherits the same properties: N visitors in M variants
produce M renders, not N.

### 8.4 Sticky buckets

Sticky bucketing pins a visitor to the variant they first saw, so that changing
traffic weights mid-experiment does not reshuffle people. It requires a per-user
read and write, which by definition cannot live in a shared cache. Store it in a
cookie and read it in proxy alongside the anonymous id — proxy is already reading
cookies for the id, so this is free there and awkward anywhere else. GrowthBook
ships cookie- and Redis-backed implementations of `StickyBucketService`
**[vendor]**.

### 8.5 Every store in play

Extends the companion report's §5.2 table with the stores this integration adds:

| Store | Shared across instances | Survives deploy | May read cookies | Cost |
| --- | --- | --- | --- | --- |
| `use cache` | ❌ on serverless | ❌ | ❌ | free |
| `use cache: remote` | ✅ | ❌ | ❌ | network hop + platform fee |
| `use cache: private` | per-browser | n/a | ✅ | free, but per-visitor |
| `fetch` Data Cache | ✅ | ✅ | n/a | included |
| GrowthBook in-memory cache | ❌ | ❌ | n/a | free and useless on serverless |
| Vercel Edge Config | ✅ | ✅ | n/a | ~0ms reads |

### 8.6 Invalidation

GrowthBook fires an SDK webhook when a flag changes. Point it at a Route Handler:

```ts
// app/api/growthbook-webhook/route.ts
export async function POST(request: Request) {
  await verifySignature(request);              // GrowthBook signs the payload
  revalidateTag("growthbook-payload", "max");  // stale-while-revalidate
  return Response.json({ ok: true });
}
```

`revalidateTag` with `profile: "max"` marks the tag stale and serves stale content
while refreshing in the background — the right semantics for a flag change, where
a few seconds of staleness is fine and a stampede is not. `updateTag` is the wrong
tool here: it expires immediately and forces the next request to block, and it is
callable only from Server Actions. `revalidateTag` cannot be called from Proxy
**[docs]**.

---

## 9. The exposure-tracking trap · **highest risk in this document**

An A/B test is not the variant rendering. It is the pairing of an **exposure
event** ("user 123 saw variant B") with a later conversion. If exposures are
wrong, the experiment does not fail loudly — it produces a confident, precise,
wrong answer.

**The failure.** Put GrowthBook's `trackingCallback` inside a cached scope and it
runs on the cache miss. Every subsequent hit skips the whole function body,
tracking call included. Fifty thousand visitors see variant B; three exposures are
recorded, one per cache entry created. Conversions still attach to all fifty
thousand. The measured lift is meaningless and every dashboard looks healthy.

This is the same shape as RND-NEXT-CACHE-001 §5.3 and §5.5: correct-looking code,
no error, no warning, no test failure, wrong result. It is worse than those two
because the damage is to the data rather than to latency, so it is not visible in
any timing measurement and may not be noticed for months.

**The rules.**

1. Exposure tracking must never execute inside `use cache` or `use cache: remote`.
2. Evaluate and track in the uncached wrapper; render inside the cache. The
   uncached wrapper runs per request; the cached child does not.
3. With the Flags SDK, use `setTrackingCallback` with `after()`, which defers the
   call until after the response is sent, per request **[vendor]**.
4. Under Tier 2, the assignment happened in proxy, so fire the exposure there via
   `event.waitUntil`. It is per-request by construction.
5. Where server-side tracking is impractical, use GrowthBook's deferred tracking:
   `getDeferredTrackingCalls()` on the server, replayed with
   `fireDeferredTrackingCalls()` in a client component **[vendor]**. Per-browser
   by construction — but note the deferred calls are then part of the cached
   markup, so they must be produced outside the cache too.

**Rule 2 restated, because it is the whole thing:** the boundary between "runs
every request" and "runs once per variant" is exactly the boundary between what
must be tracked and what may be cached. They are the same line. Draw it once.

---

## 10. How industry actually does this

**The universal pattern is: turn the variant into part of the cache key.**
Every scaled implementation does this; only the mechanism differs by era.

- **CDN-era (Akamai, Fastly, Cloudflare Workers).** Assignment happens at the
  edge, the variant is written to a cookie once, and the CDN cache key is
  extended to include that cookie. Downstream caching then works unmodified.
  Precompute is the same idea with the variant in the path instead of the cache
  key, because a rewrite is the only cache-key manipulation a framework can
  portably express.
- **Vercel/Next ecosystem.** Flags SDK precompute for marketing, landing, and
  pricing pages, where the flagged content is above the fold and a flash is
  unacceptable. Request-time evaluation for application pages, which were dynamic
  anyway.
- **The silent majority.** Most teams on most stacks evaluate server-side per
  request and let the page be dynamic. This is a perfectly reasonable choice when
  the page was never static — a logged-in dashboard gains nothing from
  prerendering. It is the wrong choice for a marketing page, which is our case.
- **Client-side (classic Optimizely Web).** Widely deprecated for above-the-fold
  work because of flicker and CWV damage.
- **Payload distribution.** Everyone pushes the ruleset to an edge KV store —
  Edge Config, Cloudflare KV, or GrowthBook's own proxy server — rather than
  fetching from an origin per request. Nobody treats the ruleset as request-time
  data.

**One practice worth importing, because it solves a caching problem as a side
effect.** Mature experimentation programmes assign experiments to *mutually
exclusive namespaces*: a visitor is in at most one experiment per namespace. The
motivation is statistical — it prevents concurrent experiments from interacting
and confounding each other. But it also caps the decision space, because flags in
different namespaces never multiply. The experimentation discipline and the
caching discipline point the same direction, which is a good sign that the
architecture is not fighting the domain.

---

## 11. Recommendation for Part 2 of the prototype

### 11.1 Library choice

**Superseded by M7. Take the Flags SDK; implement `decide` yourself.**

The original recommendation here was "use `@flags-sdk/growthbook`, not the raw
GrowthBook SDK". Half of that survives measurement.

**What was right.** `precompute` and `generatePermutations` are Flags SDK
features, not GrowthBook features. Going raw means hand-rolling the encoding,
the rewrite and the permutation generation, which is the entire Tier 2
mechanism. The SDK also brings the Vercel Toolbar's Flags Explorer and the
`.well-known/vercel/flags` discovery endpoint **[vendor]** — both verified
working here.

**What was wrong.** The claim that the adapter's built-in payload loading is a
benefit. It reads the ruleset once per request and caches nothing between
requests (M7), which is the single cost this whole project exists to remove.

**The resolution.** `decide` is yours to write, with or without an adapter.
Each flag in `src/lib/flags/sdk.ts` calls `getRuleset()` directly, so the ruleset
stays under `use cache` — 0 reads per request — and every SDK feature keeps
working. An `Adapter` would be worth introducing once several flags shared
non-trivial resolution logic; with one call each it is indirection. `sdk.ts` is
the only place GrowthBook is named either way, so it is also where a move to
another provider would happen.

**Both apparent costs turned out to be removable, though not by configuration:**

- *Nothing declared through `flag()` can be in the static shell.* True of the
  default call form, and `identify` is not the cause (M6). But `flag(request)`
  skips `next/headers` entirely, so an untargeted flag read with a stand-in
  request prerenders — measured as `○`, fully static, with the live value baked
  in. The stand-in must be constructed per call (M8).
- *`flag()` resolves to a value, discarding the rule id, reason code and
  experiment result.* True and unavoidable at the SDK's boundary. It can be
  recovered — `decide` sees all of it and can record it into a `cache()`-scoped
  map that panels read back — but that is a side-channel around the abstraction,
  and this prototype chose to drop the readouts instead. Worth knowing the
  option exists if a debugging surface ever needs it.

What remains genuinely fixed is that a **targeted** flag cannot be prerendered,
which is not an SDK limitation at all — its attributes are request data. Step 12
is the answer, and it works by removing the need to read them during render.

### 11.2 Route structure

A new `/flags` route mirroring the existing `/ppr` structure — four groups, one
per tier, each with the arrival timer already built:

| Group | Demonstrates | Expected observation |
| --- | --- | --- |
| **A** | Tier 0 shell flag, plain `use cache` | Renders in the shell at ~0ms. Flips via webhook without a deploy. |
| **B** | Tier 1, `use cache: remote` keyed by variant | Streams in. N visitors across M variants produce M renders. |
| **C** | Tier 2, `app/[code]/`, proxy rewrite | Whole page prerendered. `x-nextjs-prerender: 1` on the response. |
| **D** | Tier 3-adjacent: entitlement flag in `use cache: private` | Per-visitor, nothing user-specific in a shared cache. |

### 11.3 Build the exposure counter first

Before any of the above, build the demonstration in §9: two otherwise identical
slots, one with tracking inside the cached scope and one with it outside, each
displaying a live exposure count against the request count.

Expected: **3 exposures / 50 requests** against **50 exposures / 50 requests**.

This is the single artefact most likely to change how the team writes this code,
for the same reason the ~2031ms vs ~105ms comparison in the companion report
worked: the number is unarguable and the wrong version looks correct.

### 11.4 Sequencing

1. Exposure counter (§11.3) — establishes the correctness boundary first.
2. `proxy.ts` minting the anonymous id — required by every tier (§5.2).
3. Group A, then B — no new architecture, extends what already works.
4. Verification pass on deployed infrastructure (§13). **Not locally.**
5. Group C — the only genuinely new structure, and the only one that can fail.
6. Group D.

---

## 12. Risks

| ID | Risk | Severity | Detectable by | Mitigation |
| --- | --- | --- | --- | --- |
| **F1** | Exposure event inside a cached scope; experiment data silently invalid | **High** | Nothing automated. Only an exposure-vs-request count | §9 rules; the §11.3 counter as a permanent regression check |
| **F2** | Ruleset fetched per request because the SDK's in-memory cache is trusted on serverless | High | Deployed measurement only | Edge Config, or `use cache: remote` + tag. Never the SDK cache |
| **F3** | Permutation explosion from one global flag group | Medium | Build time and output size | Per-page-tree groups; declare `options` on every flag (§7.1) |
| **F4** | `new Date()` for daypart frozen into the static shell at build | Medium | Visual, and only after hours | Compute daypart in proxy; `await io()` if it must be in-page |
| **F5** | Adding a flag option orphans traffic onto unbuilt permutations | Low | Slower first visits in the new variant | Degrades to App Shell, not an error. Pair option changes with a deploy |
| **F6** | UTM audience lost after the landing page; visitors reclassify mid-experiment | Medium | Cohort sizes drifting over time | Persist audience to a cookie in proxy on first sight (§5.2) |
| **F7** | Proxy cost on every request including RSC prefetches | Unknown | Invocation counts on the deployment | Tighten `matcher`; measure before assuming (§13) |
| **F8** | A `use cache` scope that throws fails the **build**, so an outage at GrowthBook blocks every deploy | High | Only a real outage, or a deliberate bad key | Cached scopes return failure as a value, never throw (§13.1 M2) |
| **F9** | A `cacheLife` with `stale` under 5 min makes shell content unprerenderable, reported as an unrelated "uncached data" error | Medium | Build failure naming code that did not change | Keep `stale` ≥ 300 on anything in the static shell (§13.1 M3) |
| **F10** | A flag rendered into the static shell shows its **old** value on first paint and corrects a moment later, whenever it changed since the shell was built | Medium | Visible flash; invisible on a fully static route, which is worse | Invalidate on change; or `await io()` to keep it out of the shell entirely (§13.1 M5) |

F1 is the one to take seriously. Every other risk on this list costs money or
milliseconds. F1 costs you the ability to know whether any of your product
decisions were correct, and it does so without any symptom.

---

## 13. Evidence · **the §5.3 discipline**

The companion report's central lesson was that this stack's documentation can be
accurate while the local environment lies. Most of this document is still
**[docs]**, **[vendor]** or **[inferred]**. What has been measured is below.

### 13.1 Measured findings

Everything here comes from steps 1–3 of `FLAGS-PLAN.md`, on a local production
build. Local results do not settle deployment behaviour (§5.3 of the companion
report is the standing reminder), but these three are framework behaviour rather
than platform behaviour, so they are unlikely to differ.

---

**M1. A flag with no targeting costs nothing at request time.** **[measured]**

`getRuleset()` takes no request-time input, so it resolves during the prerender
and the value is baked into the static shell. Instrumented the fetch and counted:

| | Reads of the GrowthBook ruleset |
| --- | --- |
| During `next build` | **1** |
| Across 8 subsequent requests | **0** |

This is the whole argument of §4.3 made concrete. Release toggles and kill
switches — flags with no rules — are free, and routing them through request-time
evaluation buys nothing.

---

**M2. An error thrown inside a `use cache` scope fails the prerender even when
the caller catches it.** **[measured]** · *the important one*

With a deliberately invalid client key, `getRuleset()` threw and the `catch` in
`getFlag()` ran — visibly, twice, in the build log — returning the code default
exactly as designed. The build failed anyway:

```
[flags] falling back to default for "catalog-kill-switch"   ← the catch ran
Error occurred prerendering page "/flags"
Export encountered an error on /flags/page: /flags, exiting the build.
```

React surfaces the error to the prerender before the calling code ever sees it,
so catching it changes the value but not the outcome.

**Why it matters beyond this prototype.** Any `use cache` scope that wraps a
network call to a third party now has a property nobody would guess: *a bad
minute at that third party fails your deploy.* Not a degraded page — a failed
build. For a flag service, whose entire purpose is to be changed without
deploying, that is close to the opposite of what you want.

**The fix** is that a cached scope must not throw. Handle failure inside it and
report the failure as a value:

```ts
export async function getRuleset(): Promise<Ruleset | null> {
  "use cache";
  try {
    /* ... */
  } catch {
    return null;   // not `throw`
  }
}
```

---

**M3. A short `cacheLife` makes a shell-resident scope unprerenderable, and says
so in unrelated words.** **[measured]**

The first attempt at M2's fix used `cacheLife("seconds")` on the failure path, so
that an outage would be retried in a second rather than cached for minutes like
an answer. The build failed with:

```
Route "/flags": Next.js encountered uncached or runtime data during prerendering.
`fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or
`connection()` accessed outside of <Suspense> prevents the route from being
prerendered
```

Nothing in that message mentions cache lifetimes, and the code it names had not
changed. The cause is the `stale` field: it also decides whether content is
eligible for the route's **App Shell**, and the `seconds` profile has
`stale: 30s`. Anything under five minutes makes the scope unprerenderable, at
which point a scope outside `<Suspense>` is a build error.

`revalidate` and `expire` can be as short as you like. `stale` cannot:

```ts
cacheLife({ stale: 300, revalidate: 30, expire: 300 });
```

Fast retry, still shell-eligible. Worth noting the same threshold already appears
in the companion prototype — `PrivateComponentCountrySlot` sets `stale: 300` for
exactly this reason — so this is a general rule about the static shell rather
than anything specific to flags.

---

**M4. Both ruleset sources work; the transport is not yet the bottleneck.**
**[measured]**

Rebuilt with each source disabled in turn:

| Source | Read time (build, local) |
| --- | --- |
| Vercel Edge Config | 376ms |
| GrowthBook CDN | 1174ms |

Suggestive but not decisive, and *not* the number that matters. Both are a single
read at build, so at present the transport costs nothing per request either way
(M1). The comparison becomes load-bearing at step 11, where proxy cannot use
`use cache` and must read the ruleset on every request. Claim 9 below is still
the real test, and it has to run on the deployment.

---

**M5. A mutable value in the static shell flashes when it changes.** **[measured]**
· *found from a live bug report, not predicted anywhere in this document*

Toggling `catalog-kill-switch` in GrowthBook and reloading without invalidating
showed the **old** value, then the new one a moment later. Reproduced locally by
baking a shell that says `ON` while GrowthBook says `false`:

```
document the server sent:  ON
value over time:           40ms ON  →  143ms OFF
final DOM:                 OFF
```

Response headers name the mechanism:

```
x-nextjs-prerender: 1
x-nextjs-postponed: 1
```

`/flags` is a Partial Prerender, so every request does two things:

1. The **prerendered shell** is sent immediately, carrying whatever the flag was
   when that shell was last generated.
2. Because the page has dynamic parts, Next **resumes** the render to fill them.
   The component re-runs, reads the current ruleset, and React reconciles the
   result — patching the DOM.

They disagree exactly when the flag changed since the shell was last built,
which is why invalidating the tag fixes it permanently: that regenerates the
shell, and both renders agree again.

**Two fixes that do not work**, both worth knowing:

- **`use cache: remote`** changed nothing locally (`ON → OFF` unchanged). Not
  decidable here — `next start` has no real shared store, so build and runtime
  are separate memory either way. On Vercel it may let the resume reuse the
  entry the build wrote, which would make the two renders *consistent* — showing
  the old value with no flash, rather than showing the new one. Still unverified.
- **Wrapping it in `<Suspense>`** changed nothing either, and this is the more
  instructive one. A boundary only contributes a fallback to the shell if its
  content actually *suspends during prerendering*. The cached read completes at
  build, so the boundary resolves and its output lands in the shell regardless.
  **Suspense does not make something request-time.** `await io()` or
  `connection()` does.

**The general rule, which is not specific to flags.** Any `use cache` value
rendered into the shell of a partially-prerendered route is a cached value, and
a cached value can be stale. Serving it instantly and having it always current
are mutually exclusive:

| Approach | First paint | Correctness | Cost |
| --- | --- | --- | --- |
| In the shell, invalidate on change | instant | stale until invalidated | a flash of the old value in that window |
| `await io()` before the read | fallback | always current | the value is no longer free — it streams |
| In the shell, never invalidated | instant | stale indefinitely | silently wrong |

This project keeps the first row and closes the window with the `/invalidate`
button (a webhook would shrink it to seconds). The flash is the honest, visible
cost of caching something mutable, which is worth showing rather than hiding.

**Scope.** Only visible because the route has dynamic parts and therefore
resumes at all. A fully static route would serve the stale shell with no flash —
wrong for longer, and with nothing on screen to reveal it.

**M6. A Flags SDK flag cannot be in the static shell, and `identify` has
nothing to do with it.** **[measured]**

`getRun` (`flags/dist/next.cjs:208`) resolves the request context through one of
three branches, and the one a page component hits reads **both** stores
unconditionally:

```js
const [headersStore, cookiesStore] = await Promise.all([headers(), cookies()]);
...
overrides = await readOverrides(readonlyCookies);
```

`entities` — the result of `identify` — is computed *after* this, twenty lines
further down. So the read is not a consequence of targeting. It is inherent to
what `flag()` is: every invocation must check whether you have overridden that
flag in the Vercel Toolbar, and the override lives in a cookie.

Putting `catalogKillSwitch()` in a component with no `<Suspense>` around it
fails the build with the same error class as M3:

```
Error: Route "/sdk-probe": Next.js encountered uncached or runtime data
during prerendering.
`fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or
`connection()` accessed outside of `<Suspense>` ...
```

**Removing `identify` does not help** — measured, because it is the obvious
thing to try. A flag with no `identify`, no adapter and no entities, whose
`decide()` takes no arguments at all, fails the build identically. The cookie
read happens whether or not anything about the visitor is wanted.

**What does avoid it.** `flag()` dispatches on its arguments
(`next.cjs:668–688`), and only the last branch reaches `getRun`:

| Call form | Path | Touches `next/headers`? |
| --- | --- | --- |
| `flag(code, group)` | decodes the value out of `code` | **no** — returns before `run()` |
| `flag(request)` | uses the request you handed it | no |
| `flag()` inside `evaluate()` | reuses the bulk store | no |
| `flag()` | `headers()` + `cookies()` | **yes** |

The first row is what the official Vercel example uses, and it is why that
example prerenders under `cacheComponents` while a naive port of it does not:
its page is `app/[code]/page.tsx`, and it calls
`showSummerBannerFlag(params.code, productFlags)`. The decision is already in
the URL, so there is nothing to read.

**Measured here.** A probe route `precompute-probe/[code]` with
`generatePermutations(precomputeFlags)` in `generateStaticParams` builds as:

```
└   /precompute-probe/[code]
  ├ ◐ /precompute-probe/[code]                    ← App Shell, for unbuilt codes
  ├ ○ /precompute-probe/eyJhbGciOiJIUzI1NiJ9._f0A…
  ├ ○ /precompute-probe/eyJhbGciOiJIUzI1NiJ9._v0A…
  └ ◐ [+10 more paths]
```

`○` — **fully static**, not `◐`. Twelve permutations from 2 × 2 × 3 options,
the whole page prerendered, kill switch included. This also settles §7.3's
first open question: the `[code]` segment does get an App Shell for
permutations that were never built, so the "no fallback" objection to
precompute is obsolete on 16.3.

`generatePermutations` requires `FLAGS_SECRET` and fails the build without it,
which is worth knowing before step 12 rather than during it.

**Consequence for this project.** Until step 12, every SDK flag sits inside a
boundary; step 3's flag stays on the raw path, because being in the shell is
the entire claim of step 3. From step 12 the constraint inverts — precompute
does not work around the header read so much as make it unnecessary.

---

**M7. The stock GrowthBook adapter reads the ruleset once per request.**
**[measured]**

`@flags-sdk/growthbook@0.3.1` calls `refresh()` on every `decide`, and
`refresh()` re-reads the payload. Its only cache is a `WeakMap` keyed by the
request's `headers` object (`dist/index.js:23–52`), so it dedupes across the
flags *within* one request and caches nothing *between* requests.

Counted by patching `globalThis.fetch` in `instrumentation.ts` and filtering to
the Edge Config and GrowthBook CDN hosts, three flags per request:

| Path | Ruleset reads / 8 requests |
| --- | --- |
| `evaluate.ts` — `getRuleset()` under `use cache` | **0** |
| `@flags-sdk/growthbook` — stock | **8** |
| Own `decide` over `getRuleset()` | **0** |

One Edge Config round trip per request, on the critical path of whichever
boundary the flag sits in — the exact cost §4.1 argues is avoidable, since the
ruleset is the same bytes for every visitor on Earth.

**Resolution.** The `Adapter` interface is four optional fields and a `decide`,
so `src/lib/flags/sdk.ts` supplies its own: `decide` calls the same cached
`getRuleset()` the raw path uses. Measured at 0 reads across 8 requests with the
SDK path rendering. This keeps every SDK feature that matters — the Flags
Explorer, the discovery endpoint, `precompute`, exposure hooks — and drops only
the adapter's fetching.

**What the SDK still cannot give back.** `flag()` resolves to a *value*. The
rule id, the reason code and the experiment result are not exposed to the
caller, so a panel that explains *why* a visitor got a variant cannot be built
on it. That is why steps 3–6 stay on the raw path: those sections exist to show
the reasoning, and the SDK's own abstraction is what hides it.

**M8. A flag read with a reused `Request` is memoised for the life of the
process.** **[measured]**

`flag(request)` is the call form that avoids `next/headers` (M6), which is what
lets an untargeted flag reach the static shell. But the SDK also memoises
evaluations in a `WeakMap` keyed by the request's headers object
(`next.cjs:57–64`, `applyResult`). A module-level constant request therefore has
a stable key forever.

Two flags whose `decide` returns `Date.now()`, one given a shared request and
one a freshly-constructed one, across three requests:

```
shared:1786810661797  fresh:1786810676083
shared:1786810661797  fresh:1786810677107
shared:1786810661797  fresh:1786810678132
```

The shared one never moves. In this app that would outlive `/invalidate` and
every ruleset change with it — the cache would be correct, the flag would not,
and nothing would report a problem. `readStatic` in `sdk.ts` constructs a
`Request` per call for this reason alone.

**Generalisation.** Any SDK keyed on object identity turns a hoisted constant
into a process-lifetime cache. The hoist looks like an optimisation and reads
like one in review.

---

**M9. The stock GrowthBook adapter cannot be prerendered at all.** **[measured]**

M7 measured the stock adapter as one ruleset read per request against zero for
a custom one, which is a performance argument. This is the functional one, and
it is what actually decides the question.

Applying the M6 escape — reading the flag with a stand-in request so it never
touches `next/headers` — to a flag on `@flags-sdk/growthbook`:

```
Error fetching global config Error: During prerendering, dynamic "use cache"
rejects when the prerender is complete.
Error: Route "/sdk-probe": Next.js encountered uncached or runtime data
during prerendering.
```

The adapter's own uncached `fetch` to Edge Config fails the prerender. Avoiding
the headers read does not help, because the fetch is the second, independent
reason the scope cannot be static.

**And it cannot be configured away.** `feature().decide` calls `initialize()`
then `refresh()` on every evaluation (`dist/index.js:91–95`), with no option to
supply an already-fetched payload. Passing no `globalConfig` makes it worse:
`refresh()` then calls `growthbook.init()`, which fetches from the CDN instead.

**So avoiding the stock adapter is not a performance preference.** With it,
step 3 — a flag that costs nothing at request time — is not expressible at all.

**Caveat on the read counts.** M7's 8-vs-0 was measured locally, where Edge
Config is a real HTTPS round trip (M4: 376ms). On Vercel, Edge Config is
replicated to the runtime and reads are far cheaper, so the *performance* gap
there will be much smaller than these numbers suggest — this is RESEARCH.md
§5.3's lesson pointing the other way for once. The prerender failure above is
not a matter of degree and holds everywhere.

### 13.2 Claims still to verify

The following must be measured on the deployed application, using the
six-request curl loop already documented in `README.md`.

| # | Claim | Source | How to test |
| --- | --- | --- | --- |
| 1 | Tracking inside a cached scope fires once per entry, not per request | inferred | §11.3 counter, 50 requests across 3 variants |
| 2 | The `fetch` Data Cache still functions under `cacheComponents: true` | docs, ambiguous | Tag a payload fetch, measure hit rate on the deployment |
| 3 | The `fetch` Data Cache survives a deploy | docs | Measure across two consecutive deploys |
| 4 | `use cache: remote` does **not** survive a deploy | docs | Same test, opposite expectation |
| 5 | Proxy runs on `<Link>` prefetch/RSC requests, and what it costs | inferred | Invocation counts with and without prefetch |
| 6 | An unlisted `[code]` really serves an instant App Shell, then upgrades | docs | Request an unbuilt permutation; check timing and `x-nextjs-prerender` |
| 7 | `next/root-params` narrows the cache key to `[code]` alone | docs | Two routes sharing a cached component under different deeper params |
| 8 | Flags SDK precompute composes with root params at all | inferred | Build `app/[code]/layout.tsx` as the root layout |
| 9 | Edge Config vs `use cache: remote` vs GrowthBook CDN read latency | vendor | Three-way timing on the deployment |
| 10 | Payload cache behaviour on cold start after a deploy (stampede risk) | inferred | Deploy, then fire concurrent requests immediately |

Claims 1 and 2 are blocking. The rest can proceed in parallel with the build.

---

## 14. Open questions

- **Q1.** Does GrowthBook's payload hashing let us derive the decision space
  programmatically, so `generatePermutations` stays correct as flags change, or
  must the option lists be maintained by hand?
- **Q2.** What is the actual per-request cost of proxy on Vercel at our traffic,
  and does Tier 2 pay for itself against Tier 1's streaming?
- **Q3.** How do sticky buckets interact with precompute? If the sticky assignment
  is in a cookie and the code is in the URL, which wins on a mismatch?
- **Q4.** Can Tier 0 and Tier 2 share one payload fetch, or does proxy's copy
  necessarily diverge from the page's?
- **Q5.** What happens to in-flight experiments across a deploy, given that
  `use cache: remote` entries do not survive one?
- **Q6.** Is there a clean way to run Tier 1 and Tier 2 on the same page — hero
  precomputed, everything below streamed — without two flag groups fighting?

---

## 15. References

- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`
  — cache keys, root params in cache keys
- `.../04-functions/io.md` — new in 16.3; the `new Date()` prerender hazard
- `.../04-functions/next-root-params.md` — root params, cache-key scoping
- `.../04-functions/revalidateTag.md`, `updateTag.md` — invalidation semantics
- `.../03-file-conventions/proxy.md` — Node.js runtime, execution order, RSC rewrites
- `.../02-guides/incremental-static-regeneration-cache-components.md` — App Shells for unlisted params
- `.../02-guides/migrating-to-cache-components.md` §"fetch cache options" — the persistence comparison
- [Flags SDK — Precompute](https://flags-sdk.dev/frameworks/next/precompute)
- [Flags SDK — GrowthBook provider](https://flags-sdk.dev/providers/growthbook)
- [`vercel/flags` adapter-growthbook](https://github.com/vercel/flags/tree/main/packages/adapter-growthbook)
- [GrowthBook — Next.js App Router guide](https://docs.growthbook.io/guide/nextjs-app-router)
- [GrowthBook — Node.js SDK](https://docs.growthbook.io/lib/node)
- [GrowthBook — Next.js SDK](https://docs.growthbook.io/lib/nextjs)
- [Aurora Scharff — The Precompute Pattern](https://aurorascharff.no/posts/the-precompute-pattern-encoding-dynamic-data-into-urls-in-nextjs/)
- Deployment under test: `https://nextjs-caching-experiments.vercel.app`

---

## 16. Revision history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 15 Aug 2026 | Initial design study. No code, no measurements. |
| 0.2 | 15 Aug 2026 | Steps 1–3 built. §13 split into measured findings (M1–M4) and remaining claims; risks F8 and F9 added from M2 and M3. |
| 0.5 | 15 Aug 2026 | Every flag moved onto the Flags SDK, including the prerendered one. M8 (a reused `Request` memoises for the process lifetime) and M9 (the stock adapter cannot be prerendered at all) added. |
| 0.4 | 15 Aug 2026 | Flags SDK integrated behind a custom adapter. M6 (an SDK flag cannot be in the shell) and M7 (the stock adapter reads the ruleset once per request) added; §11.1 amended. |
| 0.3 | 15 Aug 2026 | Steps 4–5 built. M5 added from a live bug report — a mutable value in the static shell flashes when it changes — with risk F10. |
