# The catalogue

Each entry: how it presents, what actually causes it, and the fix. Grouped by how
you find out — which is the part that matters, because the ones at the bottom
have no symptom at all.

---

## A. Found at build time

These fail loudly. They cost an afternoon, not a quarter.

### A1. "Uncached or runtime data during prerendering", pointing nowhere useful

```
Error: Route "/thing": Next.js encountered uncached or runtime data during
prerendering.

`fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or
`connection()` accessed outside of `<Suspense>` prevents the route from being
prerendered…
```

The message lists the usual causes and is frequently about none of them. Run
`next build --debug-prerender` — it names the line.

Causes seen in practice, in rough order of how surprising they are:

1. Genuine request data outside a boundary. The message is right.
2. **`params` or `searchParams`**, even on a path from `generateStaticParams`.
   Enumerable at build ≠ exempt.
3. **An uncached asynchronous gap** — see A2.
4. **A `cacheLife` with `stale` under 300s** on shell content — see A3.
5. A library doing its own uncached `fetch` inside something you thought was
   cached. Provider SDKs do this constantly.

### A2. A `setTimeout` fails the build

A prerendered scope must not *wait* on anything it has not declared cacheable.
This is not a rule about request data — a bare timer reads nothing, is fully
deterministic, and still fails:

```tsx
// Fails the prerender.
async function Hero() {
  await new Promise((r) => setTimeout(r, 600));
  return <div>…</div>;
}

// Passes: the wait is declared cacheable.
async function Hero() {
  "use cache: remote";
  cacheLife("hours");
  await new Promise((r) => setTimeout(r, 600));
  return <div>…</div>;
}
```

The reflex "this is deterministic, it doesn't need caching" is wrong here.
Expensive work in a prerendered page has to be *declared* cacheable, not merely
*be* deterministic.

### A3. A build breaks after a change to `cacheLife` alone

`stale` gates static-shell eligibility. Under 300s and the scope becomes
unprerenderable, reported as A1 rather than as anything about lifetimes.

If you want a short revalidate on shell content, shorten `revalidate` and leave
`stale` at 300 or more:

```ts
cacheLife({ stale: 300, revalidate: 30, expire: 300 });
```

### A4. A caught error still fails the build

An error thrown inside `use cache` reaches the prerender before the caller's
`catch` runs. The `catch` executes — you can watch it log — and the build dies
anyway.

Left alone, this means a bad minute at an upstream provider fails every deploy.

```ts
// Failure is a value, never an exception.
export async function getConfig(): Promise<Config | null> {
  "use cache";
  cacheTag("config");
  try {
    const data = await fetchConfig();
    cacheLife("hours");
    return data;
  } catch (error) {
    console.error("[config] unreachable", error);
    cacheLife({ stale: 300, revalidate: 30, expire: 300 });
    return null;
  }
}
```

Note the two different lifetimes: a failure should not be cached as though it
were an answer.

**At request time this rule does not apply.** A throw inside a cached scope
during a normal request is an ordinary rejection and an ordinary `try`/`catch`
contains it. The distinction is *when* the throw happens, not *where*.

### A5. A non-serialisable return value

Cache boundaries serialise. A client instance, a class with methods, a function —
none of them survive. Cache the plain data and construct the object on the far
side, which is usually just an assignment anyway.

---

## B. Found on deployment, never locally

The expensive category. Everything here passes a full local suite.

### B1. Plain `use cache` is not a cache on serverless

In-process memory. A long-lived `next start` gives you a real cache and total
confidence; a serverless deployment gives you a different instance per request
and no reuse at all. Identical code, identical tests, opposite behaviour.

Use `use cache: remote` when cross-request sharing is the point.

**How to check:** compare a value generated *inside* the cached scope — a
timestamp is ideal — across many requests. If it moves, there is no reuse. On
Vercel, `x-vercel-id`'s prefix identifies the instance, so you can also confirm
that one value is being served from several distinct instances.

### B2. A cached scope awaited inside `use cache: private`

Builds, runs, passes every local test, fails deployed.

```tsx
// Wrong — genuine nesting.
export async function Panel() {
  "use cache: private";
  const value = await somethingReachingACachedScope();
  return <div>{value}</div>;
}

// Right — evaluate outside, hand the finished value in.
export async function Panel() {
  const value = await somethingReachingACachedScope();
  return <Body value={value} />;
}

async function Body({ value }: { value: string }) {
  "use cache: private";
  cacheLife({ stale: 300 });
  return <div>{value}</div>;
}
```

The trap is that the wrong version is the *obvious* version: a private scope may
read `cookies()`, so it looks like the natural place to do the whole job.

Watch for indirect reach. The awaited call may be three functions deep before it
touches a cached scope; the nesting is just as real.

---

## C. No symptom at all

Nothing fails. Nothing logs. The page looks right.

### C1. Identity in a shared cache key

`cookies()` and `headers()` are rejected inside a shared cached scope. **A prop
is not.**

```tsx
// One entry per variant — three entries for the whole population.
<Rendered variant={variant} />

// One entry per visitor. Compiles, runs, looks correct, saves nothing.
<Rendered variant={variant} userId={userId} />
```

Hit rates stay plausible because each visitor does hit their own entry on reload.
Only the entry count reveals it.

**The rule: pass decisions in, never identities.** If a value would differ
between two people who should share a render, it does not belong in a shared
cache key.

### C2. Side effects inside a cached scope

Anything with an effect — analytics, exposure events, counters, audit rows,
rate-limit increments — runs on the miss and is skipped on every hit. The
function body *is* the cache.

```tsx
// Wrong: fires once per cache entry.
async function Rendered({ variant }: { variant: string }) {
  "use cache: remote";
  track("saw-variant", variant);
  return <div>…</div>;
}
```

Fifty thousand visitors, three entries, three events. Downstream systems receive
well-formed events, just far too few of them — so nothing alerts. Move the effect
to an uncached wrapper.

This is the highest-consequence item on this page: it damages *data* rather than
latency, and no timing measurement can see it.

**A counter-check worth building:** serve N synthetic visitors through both
shapes and compare the event count to N. A ratio of 3/50 is unmistakable, and a
timing graph would show nothing.

### C3. A timestamp frozen at build

`new Date()` in a prerendered scope is captured once. Every visitor sees the
build time, indefinitely, with no error.

Compute time-derived values in proxy, or `await io()` to keep them out of the
shell. Inside a cached scope this behaviour is sometimes exactly what you want —
a timestamp taken there stamps the *entry*, which is how you tell a hit from a
miss.

### C4. A hoisted constant that memoises forever

Libraries that key an internal cache on an object identity — a `Request`, a
headers object — will memoise for the lifetime of the process if you hoist that
object to a module constant.

```ts
// Wrong: one Request for the process lifetime, so the value never changes again.
const REQ = new Request("https://internal.invalid/");
export const read = () => someLib(REQ);

// Right: a fresh one per call. Allocating a Request is free next to being wrong.
export const read = () => someLib(new Request("https://internal.invalid/"));
```

It outlives every invalidation. It looks like an optimisation and reviews like
one.

### C5. A stale value that was never invalidated, because it did not need to be

Not a bug, but it produces false conclusions. `cacheLife("hours")` has
`stale: 300`, so content refreshes on next touch after five minutes with no
invalidation involved.

Two consequences:

- "I changed it and the page updated, so my webhook works" is not sound. Wait
  five minutes and it would have updated anyway.
- Any experiment about invalidation has a five-minute window. Miss it and there
  is nothing stale left to detect.

### C6. `router.refresh()` on a rewritten route

If proxy rewrites a URL to different underlying routes depending on request state,
`router.refresh()` re-fetches the URL, resolves it *elsewhere*, and mounts the new
tree beside the old one rather than reconciling — two `<main>` elements, two of
everything.

A rewritten route is the case where "refresh this page" and "request this URL
again" stop being the same operation. Only a real navigation re-enters routing.

Guard it in a test with a count:

```ts
expect(await page.locator("main").count()).toBe(1);
```

---

## D. Traps in measuring

Wrong conclusions, confidently held.

### D1. Testing a stale server

`pkill`/`fuser` failing silently, `next start` hitting `EADDRINUSE`, and the old
process still serving. You then measure new source against an old build and
record a finding that is pure fiction.

Always confirm the server you are about to measure is the one you just built —
check the startup log, or probe for a marker that only exists in the new code.
If the same "impossible" result repeats byte-for-byte across runs, suspect this
before suspecting the framework.

### D2. `toContain` cannot tell shell from stream

A response body contains everything eventually. Use document order against
`</main>`.

And know its limit: a Suspense child that resolves fast enough is inlined before
the shell flushes, so a streamed thing can legitimately appear before `</main>`.
Position proves "prerendered"; it does not prove "not prerendered". For the
negative claim, assert the behaviour instead — two users getting different
answers, or a header like `x-nextjs-prerender`.

### D3. Timing cannot tell a cache hit from cheap work

If the cached work is fast, a hit and a miss look the same. Assert on something
that identifies the *entry* — a value generated inside the scope — rather than on
elapsed time.

### D4. Local numbers reported as deployed behaviour

Say which you measured. They are different claims, and B1 and B2 exist precisely
because they diverge.
