# Tier 2 — precompute and rewrite

Proxy decides the flags *before* the render, encodes the decision into a signed
URL segment, and rewrites to a page prebuilt for exactly that combination. The
hero is in the first HTML response; nothing streams, nothing flashes.

Do this last. It is the only tier that restructures routing, and the only one
that can genuinely fail.

## The economics, which are the whole point

**Prerender per decision, not per visitor.**

A realistic attribute set — 5 audiences × 4 devices × 3 countries × 3 dayparts —
is 180 combinations. Prerendering per visitor is absurd. But three flags with 2,
2 and 3 options produce **12 outcomes**, and 12 pages is routine.

Adding a country or an audience adds **zero** pages. Adding a flag with n options
multiplies the count by n — that is the number to watch, and the reason to keep
precomputed flags in small per-page-tree groups rather than one global list.

**Why the URL must carry the variant.** A CDN keys its cache on the URL. A page
that branched on a header without the URL changing would serve one visitor's
variant to the next. Encoding the decision into the path makes the cache key
correct by construction. This is not a Next.js quirk — CDN deployments have
manipulated cache keys for A/B tests for twenty years.

## Route shape

```
app/
  promo/
    [code]/
      page.tsx        ← the prerendered variants
```

Proxy rewrites `/promo` → `/promo/<code>`. The browser URL never changes.

**Only put `[code]` at the app root if you are precomputing the home page.** A
root-level `[code]` swallows every other route, which is why the common example
pairs it with a second root layout and a route group. If you are precomputing one
inner route, a nested `[code]` needs neither, and moves no existing file.

**Consider keeping the streamed version alive at its own URL.** Two routes
rendering the same flags two ways is a direct comparison, and it means the tier-2
work cannot break what already worked.

## Proxy

```ts
export const config = { matcher: ["/promo", "/promo/:path*"] };

export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // …derive anything the render needs, e.g. device class…

  // Cookies minted here must be written to `request.cookies` too, not only to
  // the response: the code is computed *now*, and a first-time visitor would
  // otherwise be bucketed on a fallback id and then rendered under their real
  // new one. One visitor, two variants, on the one request nobody re-checks.
  if (!request.cookies.get(ID_COOKIE)) {
    const id = crypto.randomUUID();
    request.cookies.set(ID_COOKIE, id);
    // …and set it on the response below…
  }

  if (request.nextUrl.pathname !== "/promo") {
    return NextResponse.next({ request: { headers } });
  }

  const code = await precomputeCode({ headers, cookies: request.cookies });
  const target = new URL(`/promo/${code}`, request.nextUrl);
  target.search = request.nextUrl.search;
  return NextResponse.rewrite(target, { request: { headers } });
}
```

Rewrite only the exact path, so `/promo/<code>` stays directly reachable — useful
for confirming by hand that a code renders what it claims, and harmless because
an unknown code is verified rather than trusted.

**A rewrite, not a redirect.** No extra round trip, and the variant never ends up
bookmarked, shared, or pasted into a bug report by someone who then cannot
reproduce anything.

## Computing the code

`precompute(flags)` is `evaluate(flags)` followed by `serialize`, and `evaluate`
calls each flag's `decide`. **If your `decide` reaches a `use cache` scope, this
cannot run in proxy** — `use cache` is a render-time directive and proxy runs
before any render exists. There is no way to hand `decide` a ruleset; its
parameters are fixed by the SDK.

So call `serialize` — the SDK's own second half — with values you computed:

```ts
const FALLBACKS = precomputeFlags.map((f) => DEFAULTS[f.key]);

export async function precomputeCode(readers: RequestReaders): Promise<string> {
  const ruleset = await readRulesetUncached();          // no `use cache` here
  const attributes = resolveAttributes(readers);

  const values = precomputeFlags.map((flag, i) =>
    evaluateWith(ruleset, flag.key, attributes, FALLBACKS[i]),
  );

  return serialize(precomputeFlags, values);
}
```

The evaluation is byte-for-byte the one the render path uses; only the ruleset
read differs, and that difference is forced.

**`precomputeFlags` order is load-bearing.** The encoding is positional, so
reordering the array invalidates every precomputed URL already in the wild.
Append only. The fallback array must be built from the same list, in the same
order — a mismatch would not throw, it would encode one flag's value into
another's slot and produce a page that is wrong in a way nothing checks.

**What this costs:** Toolbar overrides. `evaluate` consults the
`vercel-flag-overrides` cookie before calling `decide`; this path never sees it,
so an override does not move the precomputed page. It still works on any route
that evaluates through `flag()` normally.

## The page

```tsx
export async function generateStaticParams() {
  const codes = await generatePermutations(precomputeFlags);
  return codes.map((code) => ({ code }));
}

async function decode(params: Promise<{ code: string }>) {
  "use cache";
  cacheLife("max");                       // a pure function of the segment

  const { code } = await params;          // `params` is runtime data — see below

  try {
    // The array form verifies the signature once and unpacks all values.
    const [a, b, c] = await getPrecomputed(
      [flagA, flagB, flagC],
      precomputeFlags,
      code,
    );
    return { code, a, b, c, valid: true };
  } catch (error) {
    console.error("[flags] code did not verify", error);
    return { code, ...DEFAULTS, valid: false };
  }
}

export default async function Page({ params }: PageProps<"/promo/[code]">) {
  const { code, a, b, c, valid } = await decode(params);
  return <main>{/* … */}</main>;
}
```

Three things in there are not stylistic:

**`params` is runtime data.** Reading it in the page body fails the prerender
even though `generateStaticParams` enumerates every value. Hand the unresolved
promise to a `use cache` scope and resolve it inside. Give that scope a
`cacheLife`, or it inherits `default` and revalidates a pure function every 15
minutes.

**Catch the verification failure.** `getPrecomputed` throws on a segment that does
not verify. Unhandled, the response is a **200 whose entire `<main>` is missing** —
not a 500, not an error page: a shell with no content and nothing saying why.
Fall back to declared defaults and surface the state in the UI.

**Expensive work still needs a cache directive.** A prerendered scope must not
wait on anything undeclared, even something deterministic. If your variant render
is genuinely slow, give it `use cache: remote` — which also does real work for
codes outside the prebuilt set, since `dynamicParams` defaults to `true` and those
render on demand.

`dynamicParams` is worth leaving on: a code outside the set — the flag list
changed, a permutation was filtered out, someone pasted an old URL — then renders
on demand rather than 404ing, and the signature check means an unknown code is
either a valid combination you did not prebuild or it is rejected.

## Interacting with a precomputed page

Anything that changes an input to the decision needs a **real navigation**, not a
re-render.

A Server Action that writes a cookie is not enough: proxy already ran on that
request, with the old cookie, before the action existed. Re-rendering faithfully
re-renders the page proxy already chose, so the control appears to do nothing
exactly once.

`router.refresh()` does not fix it either — it re-fetches the URL, proxy resolves
it to a *different* underlying route than the one mounted, and the router mounts
the new tree beside the old one. Two `<main>` elements.

Use a real navigation. On a prerendered page a full load is close to the cheapest
thing the app can do.

**This is the honest cost of deciding early.** A streamed route re-streams in
place; a precomputed route needs a whole new request. Cheaper to serve, more
expensive to change your mind about.

## Verifying it

```
x-nextjs-prerender: 1          # served from a prerender
x-vercel-cache: PRERENDER      # on Vercel, confirms it deployed
```

Then assert **document order**, not presence — a body contains everything
eventually:

```ts
const html = await (await page.request.get("/promo")).text();
expect(html.indexOf('data-testid="hero"')).toBeLessThan(html.indexOf("</main>"));
expect(html).not.toContain('data-testid="hero-skeleton"');
```

Worth testing beyond the happy path:

- **The streamed control.** Without it, "the hero is in the shell" only proves the
  page is static, not that precompute made it so.
- **Proxy and the render agree on the variant.** They resolve attributes
  separately; if they ever diverge, a visitor is routed to one variant and
  rendered another, which looks exactly like a caching bug.
- **The URL never shows the code.**
- **A code that does not verify falls back** rather than emptying the page.
- **Two users get different per-user answers.** These pages are *shared* — a
  per-person value baked into one is served to everyone who resolves to that
  code. This is the worst failure available here.

Do **not** assert "a per-person flag streams" by byte position. A Suspense child
that resolves fast enough is inlined before the shell flushes, so the offset
tracks how fast it resolved rather than whether it was shared. Assert the
behaviour — two users, two answers.

## Sticky bucketing

If you need a visitor to keep a variant across a flag-list change, that is sticky
bucketing, and on GrowthBook it is a paid-plan feature (Settings → General →
Experiment Settings). Check your plan before designing around it. Without it,
assignment is a pure hash of the id against the current rules — stable as long as
neither changes.

Namespaces are worth looking at once you have several experiments: mutually
exclusive experiments do not multiply together, which keeps the permutation count
down.
