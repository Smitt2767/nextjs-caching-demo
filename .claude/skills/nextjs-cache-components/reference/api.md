# The API surface

Next.js 16.3+. Enable with `cacheComponents: true` in `next.config.ts`.

## Build output markers

| Marker | Meaning |
| --- | --- |
| `○` | Static — fully prerendered, nothing deferred |
| `◐` | Partial prerender — a static shell plus streamed regions |
| `ƒ` | Dynamic — rendered per request |

A route that unexpectedly shows `ƒ` has request data outside every `<Suspense>`
boundary. A route that shows `◐` when you wanted `○` has a boundary you did not
intend, or a `cacheLife` with `stale` under 300s.

## The three directives

Each goes at the top of an async function body, like `"use server"`.

### `use cache`

In-process memory. Real on a long-lived server, effectively absent on
serverless where the next request may land on a different instance.

- Cannot read `cookies()`, `headers()`, or other request APIs.
- Arguments form the cache key, so every argument must be serialisable.
- Return values must be serialisable. A class instance with methods cannot cross
  the boundary — construct it on the far side from cached plain data.

### `use cache: remote`

A shared store, reachable from every instance. This is the directive to use when
the point is that N visitors cost M renders rather than N.

Costs a round trip per lookup, so it is not automatically better than plain
`use cache`. It wins when the cached work is genuinely expensive; it can lose
when the work is one fast local read that per-instance memory would amortise.

### `use cache: private`

Stored per browser rather than on the server. The only cached scope permitted to
read `cookies()`.

Nothing in it is ever shared, so everything it contains is paid for by every
visitor — keep it to the minimum. Its natural size is "the finished answer",
not "the work that produced the answer".

**Nesting rule.** A cached scope may be **returned** from a private scope. It may
not be **awaited** inside one. The awaited form builds, runs and passes local
tests, then fails on deployment.

```tsx
// Correct: evaluate outside, hand the finished value in.
export async function Panel() {
  const value = await somethingReachingACachedScope();
  return <Body value={value} />;             // returned, not awaited
}

async function Body({ value }: { value: string }) {
  "use cache: private";
  cacheLife({ stale: 300 });
  return <div>{value}</div>;
}
```

## `cacheLife`

Called inside a cached scope. Takes a named profile or a literal object.

| Profile | `stale` | `revalidate` | `expire` |
| --- | --- | --- | --- |
| `default` | — | 15 min | infinite |
| `seconds` | 30s | 1s | 60s |
| `minutes` | 5 min | 60s | 60 min |
| `hours` | 5 min | 60 min | 24 h |
| `days` | 5 min | 24 h | 7 d |
| `weeks` | 5 min | 7 d | 30 d |
| `max` | 5 min | 30 d | 365 d |

Verified in `node_modules/next/dist/server/config-shared.js` — check there if the
numbers matter, since they are a version detail.

**Read this table before reasoning about propagation.** Every profile from
`minutes` upward has `stale: 300`. The profile name describes `revalidate`, not
how long a value can actually persist: past five minutes an entry is refreshed on
next touch. "Cached for hours" means "refetched on next touch after five
minutes", not "frozen for an hour".

**`stale` also gates the static shell.** Anything under 300s makes the scope
unprerenderable, reported as an unrelated "uncached data" error. If a build
breaks after only a `cacheLife` change, this is why.

**Named profile and literal object are separate overloads.** A ternary producing
a union of the two matches neither — branch instead:

```ts
if (ok) cacheLife("hours");
else cacheLife({ stale: 300, revalidate: 30, expire: 300 });
```

Omitting `cacheLife` entirely inherits `default` — 15-minute revalidation, which
is wrong for both a constant and a fast-moving value. Set it deliberately.

## `cacheTag`

Called inside a cached scope; labels the entry so it can be invalidated later.

```ts
async function getThing(id: string) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(`thing-${id}`);
  return fetchThing(id);
}
```

Derive tag names from the same source as the values they key, rather than listing
them by hand. A tag added in one place and missed in another leaves warm entries
behind, and the symptom looks like a bug getting worse rather than a stale cache.

## Invalidation

| Function | Effect | Callable from |
| --- | --- | --- |
| `updateTag(tag)` | Expires immediately; the next request blocks on fresh data | Server Actions only |
| `revalidateTag(tag, profile)` | Marks stale; serves stale while refreshing behind it | Server Actions and Route Handlers |
| `revalidatePath(path)` | Everything on the route | Server Actions and Route Handlers |

None of them is callable from proxy.

Prefer `revalidateTag` for anything triggered by an external event (a webhook, a
CMS publish): nobody waits, and a change cannot stampede every instance at once.
Prefer `updateTag` when a user just performed the action and must see its result
on the next render.

**An open question worth knowing about:** whether tag invalidation reaches every
serverless instance for a plain `use cache` entry. If it does not, plain
`use cache` makes webhook-driven invalidation unreliable and `remote` becomes a
correctness requirement rather than a performance one. Measure it in your own
deployment before relying on either answer — and note that the five-minute
`stale` window makes the experiment hard to run, because entries refresh on their
own before you can observe a failure to invalidate.

## `fetch` inside a cached scope

Do not add `next: { revalidate, tags }` to a `fetch` inside `use cache`. The
enclosing scope owns the caching; the fetch options are a second, separate layer
with different persistence rules.

## Request data

`cookies()`, `headers()`, `params`, `searchParams`, `connection()`, and
`draftMode()` all count as runtime data. Read them:

- in a Server Component inside `<Suspense>`, or
- in `use cache: private` (cookies and headers only), or
- in proxy, and forward the derived value as a request header.

`params` is runtime data even on a path produced by `generateStaticParams`. The
documented shape is to hand the promise to a cached scope:

```tsx
async function decode(params: Promise<{ id: string }>) {
  "use cache";
  cacheLife("max");
  const { id } = await params;
  return lookup(id);
}

export default async function Page({ params }: PageProps<"/thing/[id]">) {
  const data = await decode(params);
  ...
}
```

## `io()`

`await io()` from `next/cache` suspends during prerendering, keeping what follows
out of the static shell.

It exists for the case Cache Components cannot decide for you: a synchronous
value like `new Date()`, `Math.random()`, `crypto.randomUUID()`, or a sync
database driver. Either you want that captured once and reused for every visitor
— wrap it in `use cache` — or you want it fresh per request, which is `await
io()` inside a `<Suspense>` boundary.

```tsx
import { io } from "next/cache";

async function CurrentTime() {
  await io();
  return <p>{new Date().toISOString()}</p>;
}
```

It resolves immediately during a request, inside cached scopes, in the browser,
and in apps without Cache Components — so it costs nothing where it does not
apply.
