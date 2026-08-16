---
name: growthbook-nextjs-flags
description: >
  Integrate GrowthBook feature flags and A/B experiments into a Next.js App
  Router project with Cache Components, using the Vercel Flags SDK — including
  build-time precompute with a proxy rewrite. Use when adding feature flags or
  experiments to a Next.js app, when flag evaluation is making pages dynamic or
  costing a network round trip per request, when deciding where a flag may be
  read (static shell, streamed, precomputed, per-user), when wiring exposure
  tracking for an experiment, when precomputing variants into prerendered pages,
  or when setting up ruleset invalidation via a GrowthBook webhook. Requires
  Next.js 16.3+ with cacheComponents and `flags` v4.
---

# GrowthBook flags in a cached Next.js app

The premise "feature flags make a page dynamic" is false, and dismantling it is
the whole architecture.

A flag decision is a pure function of two inputs:

- **the ruleset** — the JSON describing every flag, its rules and its
  experiments. Identical for every visitor on Earth. Ordinary cacheable content.
- **the attributes** — country, device, user id, whatever you target on.
  Ordinary request data.

The function joining them is a hash and a walk over rules already in memory:
microseconds, no network. **Cache the ruleset. Never cache the evaluation. Never
cache the visitor.**

The dynamism lives in the attributes alone, and only in the parts of the page
that consume them.

Read `reference/setup.md` for the wiring (ruleset source, flag declarations,
env vars) and `reference/precompute.md` when building the proxy-rewrite tier.
Read them on demand.

**This skill assumes `nextjs-cache-components`.** Everything about `use cache`
correctness lives there; this one is about flags specifically.

## Pick a tier per flag, not per app

| Tier | Where decided | Rendering | Use for |
| --- | --- | --- | --- |
| 0 — shell flag | build | in the static shell | kill switches, release toggles — **no targeting** |
| 1 — streamed | request, in `<Suspense>` | streamed | most experiments — **the default** |
| 2 — precompute | proxy, before render | prerendered, one page per outcome | above-the-fold hero/pricing tests |
| 3 — per-user | request | `use cache: private` | entitlements, anything keyed on identity |

A real app uses several at once. Start at Tier 1; it is correct for almost
everything and costs one streamed region.

## The rule that decides the tier

**Who else gets the same answer?**

- Everyone → Tier 0, can be in the static shell.
- Many people, few outcomes → Tier 1 or 2. The *decision* is shareable even
  though the attributes are not.
- Only this person → Tier 3. `use cache: private` or nothing.

Getting this wrong in the unsafe direction — a per-person answer in a shared
cache — serves one visitor's entitlement to whoever lands on that entry next.

## Cache the ruleset, and only the ruleset

One cached function, one network read, everything else free:

```ts
export const RULESET_TAG = "flag-ruleset";

export async function getRuleset(): Promise<Ruleset | null> {
  "use cache";
  cacheTag(RULESET_TAG);
  try {
    const payload = await fetchPayload();
    cacheLife("hours");
    return payload;
  } catch (error) {
    console.error("[flags] ruleset unreachable", error);
    cacheLife({ stale: 300, revalidate: 30, expire: 300 });
    return null;   // never throw: a throw here fails the build
  }
}
```

**Do not cache the evaluation.** A cache lookup costs more than the hash it would
avoid, and a per-visitor evaluation cache is one entry per visitor.

**Do not trust a provider SDK's own cache.** `@flags-sdk/growthbook` and similar
adapters fetch the ruleset themselves and memoise per *request* — deduping within
one request and caching nothing between them, which is one network read per
request. They also cannot be prerendered, because that fetch is uncached. Write
`decide` yourself against `getRuleset()`.

**Always declare defaults.** A flag system sits behind a network call and network
calls fail. Without a fallback, an outage at your provider decides your app's
behaviour. Keep defaults boring — the safe state, not the interesting one.

## The trap that costs you the experiment

**An A/B test is not the variant rendering. It is an exposure event paired with a
later conversion.**

Put the exposure call inside a cached scope and it fires on the miss and is
skipped on every hit. Fifty thousand visitors, three variants, three exposures.
Conversions still attach to all fifty thousand, so the measured lift is
meaningless and every dashboard looks healthy.

Nothing catches it: not the build, not TypeScript, not a test, not any timing
measurement. The damage is to the data.

```tsx
// The line between "runs every request" and "runs once per variant" is exactly
// the line between what must be tracked and what may be cached.
export async function Hero() {
  const variant = await heroFlag();      // decide: per request, ~free
  trackExposure(variant);                // outside the cache
  return <HeroBody variant={variant} />;
}

async function HeroBody({ variant }: { variant: string }) {
  "use cache: remote";                   // render: per variant, expensive
  cacheLife("hours");
  cacheTag(`hero-${variant}`);
  return <div>{/* … */}</div>;
}
```

With the Flags SDK, use `setTrackingCallback` with `after()` so the call is
deferred until the response is sent, per request.

**Build the counter-check.** Serve N synthetic visitors through both shapes and
compare the event count to N. A ratio of 3/50 is unmistakable; a latency graph
shows nothing.

## Never let identity into a shared cache key

`cookies()` and `headers()` are rejected inside a shared cached scope. A prop is
not:

```tsx
<HeroBody variant={variant} />              // 3 entries
<HeroBody variant={variant} userId={id} />  // one per visitor, silently
```

The cache still "works". The page still looks right. The saving is gone.

## Declaring flags

Use the Vercel Flags SDK (`flags` v4) — it gives you the Toolbar's Flags
Explorer, a discovery endpoint, and precompute. Implement `decide` yourself
against the cached ruleset.

```ts
export const heroFlag = flag<string, Attributes>({
  key: "homepage-headline",
  defaultValue: "control",
  description: "Hero A/B/C.",
  options: ["control", "urgency", "reassurance"],   // required for precompute
  identify,
  decide: ({ entities }) => evaluate("homepage-headline", entities ?? {}, "control"),
});
```

**Declare `options` on every flag you might precompute.** The SDK encodes a
precomputed decision as an index into that list, so a flag without `options`
drops out of the permutation set and silently falls back to request-time
evaluation.

**Do not declare `options` on a per-user flag.** A flag keyed on individual
identity has no decision space; including it tries to prerender one page per
human being.

## Getting a flag into the static shell

An ordinary `flag()` call reads `headers()` and `cookies()` unconditionally —
before `identify` is consulted — because every invocation checks for a Toolbar
override, and overrides live in a cookie. That alone makes a scope
unprerenderable. **Removing `identify` does not help.**

The escape is `flag()`'s argument dispatch: hand it a request and it takes the
branch that never touches `next/headers`.

```ts
function readStatic<T>(f: (request: Request) => Promise<T>): Promise<T> {
  // Per call. A module constant memoises for the process lifetime, outliving
  // every invalidation — the SDK keys its cache on the headers object identity.
  return f(new Request("https://prerender.invalid/"));
}

export const getKillSwitch = () => readStatic(killSwitchFlag);
```

**Only for flags with no targeting.** The stand-in request carries no cookies and
no headers, so a flag consulting `identify` would see nothing and mis-target
rather than fail.

## Invalidating the ruleset

`revalidateTag(RULESET_TAG, "max")` from a Route Handler — stale-while-revalidate,
so nobody blocks and a flag change cannot stampede every instance.

Know how little this buys before you build it: `cacheLife("hours")` is
`stale: 300`, so a change propagates on its own within five minutes anyway.
Invalidation makes a change *immediate*; it is not what makes it happen.

See `reference/setup.md` for GrowthBook's two webhook systems, which sign
differently, and for the race that can make invalidation briefly *worse*.

## Checklist for a flag review

- Is the ruleset cached and the evaluation not?
- Does any cached scope's key contain something personal?
- Does any exposure/analytics call sit inside a cached scope?
- Does every flag have a default, and is that default the safe state?
- Does anything read `cookies()` outside `<Suspense>` or outside `private`?
- Do flags that will be precomputed declare `options`, and per-user flags not?
- Are the answers above verified deployed, or only locally?
