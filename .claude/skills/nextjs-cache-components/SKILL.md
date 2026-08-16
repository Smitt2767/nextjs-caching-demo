---
name: nextjs-cache-components
description: >
  Correctness rules and failure catalogue for Next.js Cache Components
  (`cacheComponents: true`, PPR). Use when writing or reviewing code that uses
  `use cache`, `use cache: remote`, `use cache: private`, `cacheLife`,
  `cacheTag`, `updateTag`/`revalidateTag`, or Suspense boundaries under PPR;
  when a build fails with "encountered uncached or runtime data during
  prerendering"; when deciding which cache directive a scope should carry; when
  something is cached that should not be, or a route will not prerender. Also
  use when writing tests that assert what is in the static shell versus what
  streams. Requires Next.js 16.3+.
---

# Next.js Cache Components — what actually breaks

Cache Components makes a page part static and part streamed. The directives are
few and the API is small; almost everything that goes wrong goes wrong *quietly*
— a build that fails naming code you did not touch, or a cache that works
locally and does not exist in production.

This skill is a failure catalogue, not a tutorial. Read `reference/api.md` for
the directive/profile tables and `reference/traps.md` for the full catalogue with
symptoms and fixes. Read them on demand rather than upfront.

Distinct from `next-cache-components-optimizer`, which is a test-driven loop for
making one route's navigation instant. This one is about being *correct* — use it
while writing, and that one when driving a route to a performance goal.

## The one rule that outranks the rest

**A local success is not evidence about serverless.** Plain `use cache` is
in-process memory. On a long-lived `next start` that is a real cache; on
serverless the instance holding the entry may be gone by the next request, so the
same code is *no cache at all* and looks identical while testing.

Three consequences, all of which have cost real time:

- Never conclude "the cache works" from a local run. Conclude "the cache does not
  break the build" from a local run.
- `use cache: remote` is the one whose entries are shared across instances. If
  cross-request reuse is the point, it is the directive you want.
- Anything you record as a finding should say whether it was measured locally or
  deployed. They are different claims.

## Choosing a directive

| Need | Directive |
| --- | --- |
| Shared across every visitor **and** every instance | `use cache: remote` |
| Shared, but only worth the memory within one process | `use cache` |
| Specific to one visitor | `use cache: private` |
| Reads `cookies()` / `headers()` | `use cache: private`, or don't cache |

Decide by **who may see the entry**, never by what is convenient. A cache key
derived from something personal, in a shared scope, serves one visitor's data to
the next.

## The five things that break prerendering

The first four fail the **build**, all with the same message — *"Next.js
encountered uncached or runtime data during prerendering"* — which names the
symptom and not the cause. Run `next build --debug-prerender` to get the
offending line.

The fifth builds fine and fails in production, which is why it is here rather
than in the silent list below.

1. **`cookies()`, `headers()`, `params`, `searchParams`, `connection()`** read
   outside `<Suspense>`. `params` counts even when `generateStaticParams`
   enumerates every value — pass the unresolved promise into a `use cache` scope
   and `await` it in there.
2. **An uncached asynchronous gap.** A prerendered scope must not *wait* on
   anything it has not declared cacheable. A bare `setTimeout` reads no request
   data, is fully deterministic, and still fails the build. Declare it cacheable.
3. **A throw inside `use cache` during prerender.** It fails the build even when
   the caller catches it — React surfaces it to the prerender first. Cached scopes
   must return failure as a value (`null`, a result object), never throw.
4. **`cacheLife` with `stale` under 300s** on anything in the static shell. `stale`
   decides shell eligibility, so a short profile makes the scope unprerenderable
   and reports it as an unrelated data error.
5. **Awaiting a cached scope inside `use cache: private`.** A cached element may be
   **returned** from a private scope; awaiting one inside it is genuine nesting.
   The build passes, the local suite passes, and it fails on deployment. Watch
   for indirect reach — the awaited call may be three functions deep before it
   touches a cached scope.

## The two things that break silently

Worse than the above, because nothing tells you.

**Identity in a shared cache key.** `cookies()` and `headers()` are rejected
inside a shared cached scope — but a prop is not. Pass a user id into a
variant-keyed component and one entry per variant quietly becomes one per
visitor. Hit rates stay plausible; only the entry count reveals it. **Pass
decisions in, never identities.**

**Side effects inside a cached scope.** Analytics, exposure events, counters, and
audit writes run on the *miss* and are skipped on every hit. The function body is
the cache; everything in it is cached, including the parts that were never meant
to be values. Do the effect in an uncached wrapper and let the cached scope
render only.

```tsx
// The boundary between "runs every request" and "runs once per key" is exactly
// the boundary between what must be tracked and what may be cached.
async function Panel({ userId }: { userId: string }) {
  const variant = decide(userId);
  track("exposure", { userId, variant });   // outside: once per request
  return <Rendered variant={variant} />;    // inside: once per variant
}

async function Rendered({ variant }: { variant: string }) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(`panel-${variant}`);
  return <div>{/* expensive, shared by everyone in this variant */}</div>;
}
```

## Time is frozen at build

`new Date()` or `Date.now()` evaluated during a prerender is captured once and
served to everyone until the entry is rebuilt. It does not error. Compute
time-derived values in proxy, or use `await io()` to opt a scope out of the
prerender.

Inside a cached scope this is sometimes what you want — a timestamp taken there
stamps *the entry*, which is a useful way to see whether a cache was hit.

## Testing: assert position, not presence

A response body contains everything eventually, so `toContain` cannot tell the
shell from the stream. Document **order** can: shell content is written in place
inside `<main>`, and content still pending when the shell flushed is appended
after it and moved into place by a script.

```ts
const html = await (await page.request.get("/route")).text();
const closingMain = html.indexOf("</main>");
const marker = html.indexOf('data-testid="thing"');
expect(marker).toBeLessThan(closingMain);   // prerendered
```

**Its limit, which is easy to miss:** a Suspense child that resolves fast enough
is inlined before the shell flushes, so a *streamed* thing can legitimately land
before `</main>`. Byte position proves "this was prerendered"; it does not prove
"this was not". For the negative claim, assert the behaviour you actually care
about — two users getting different answers, a skeleton being present, a header
like `x-nextjs-prerender`.

## Before you record a cache finding

- Did the entry exist, or was the work simply fast? A timing measurement cannot
  tell a cache hit from cheap work.
- Was it measured locally or deployed? Say which.
- Is the server you measured actually running the code you just built? A failed
  `pkill` and a stale `next start` will happily answer with the old build and
  produce a confident, wrong finding.
- Could the value have refreshed on its own? `cacheLife` profiles have a `stale`
  much shorter than their name suggests — `hours` is `stale: 300`, so content
  refreshes on next touch after five minutes regardless of any invalidation.

## References

- `reference/api.md` — directives, `cacheLife` profile numbers, `cacheTag`,
  the three invalidators and when each is callable.
- `reference/traps.md` — the full catalogue: symptom, cause, fix, and how each
  one presents.
