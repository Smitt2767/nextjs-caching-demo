# Wiring it up

## Packages

```bash
pnpm add flags @growthbook/growthbook
pnpm add @vercel/edge-config      # optional, and see "Ruleset source" below
```

- `flags` v4 — Vercel's Flags SDK. Provides `flag()`, `dedupe`, `precompute`,
  `serialize`, `deserialize`, `generatePermutations`, `getPrecomputed`,
  `createFlagsDiscoveryEndpoint`, `getProviderData`.
- `@growthbook/growthbook` — the evaluation engine. You use `GrowthBookClient`
  directly rather than letting it fetch anything.
- `@flags-sdk/growthbook` — the stock adapter. **Deliberately not used**; see
  "Why not the stock adapter".

## Environment

| Variable | For |
| --- | --- |
| `GROWTHBOOK_CLIENT_KEY` | Reading the ruleset from GrowthBook's CDN |
| `FLAGS_SECRET` | Signing precomputed URL segments. 32 random bytes, base64url |
| `EXPERIMENTATION_CONFIG` | Vercel Edge Config connection string, if used |
| `GROWTHBOOK_EVENT_WEBHOOK_SECRET` | Verifying event-webhook deliveries |

Generate `FLAGS_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`generatePermutations` throws at build time without it, so a precompute route
fails the deploy if it is missing from the build environment.

## Ruleset source

Two options, good at different things.

**GrowthBook CDN** — `GET {apiHost}/api/features/{clientKey}`. Works anywhere, no
extra infrastructure, and it is a real network round trip.

**Vercel Edge Config** — GrowthBook syncs the payload into it via its Vercel
integration. Reads are replicated to the runtime rather than fetched, so they are
a local lookup. This matters enormously if you use precompute, because proxy
cannot use `use cache` and will read the ruleset on **every request**.

Use Edge Config when available and keep the CDN as a fallback:

```ts
async function loadRuleset() {
  const key = process.env.GROWTHBOOK_CLIENT_KEY;
  if (!key) return null;

  const conn = process.env.EXPERIMENTATION_CONFIG;
  if (conn) {
    try {
      const payload = await createClient(conn).get(key);
      if (payload) return payload;
    } catch (error) {
      // Degrade to a slower read, not to no flags. Log it so it is visible.
      console.error("[flags] Edge Config read failed", error);
    }
  }

  const res = await fetch(`${apiHost}/api/features/${key}`);
  if (!res.ok) throw new Error(`ruleset ${res.status}`);
  return res.json();
}
```

Write the fallback policy **once** and have both the cached reader and any proxy
reader call it. Two implementations drift, and if proxy falls back differently
from the render, a visitor gets routed to one variant and rendered another —
which looks exactly like a caching bug and is not one.

## Evaluating

```ts
import { GrowthBookClient } from "@growthbook/growthbook";

export function evaluateWith<V>(
  ruleset: Ruleset | null,
  key: string,
  attributes: Partial<Attributes>,
  fallback: V,
): V {
  if (!ruleset) return fallback;

  // Built per call and thrown away. A GrowthBookClient is not serialisable, so
  // it could not be returned from a `use cache` scope anyway — and constructing
  // one around an already-fetched payload is just an assignment.
  const client = new GrowthBookClient();
  client.initSync({ payload: ruleset.payload });
  const result = client.evalFeature(key, { attributes });
  client.destroy();

  // Check the type rather than trusting it: a flag can be changed from boolean
  // to string in the dashboard without the code hearing about it.
  return result.value !== null && typeof result.value === typeof fallback
    ? (result.value as V)
    : fallback;
}
```

`evalFeature` rather than `getFeatureValue` — it also reports *why* it decided
(rule id, reason code, experiment result), which is worth surfacing while
debugging even if you drop it in the returned value.

## Attributes must be readable from two places

If you will ever use precompute, write attribute resolution as a **pure function
over `(headers, cookies)`** with a thin async wrapper, from the start. Retrofitting
this later touches every call site.

```ts
// Structural types: `next/headers` stores, NextRequest's stores, and the Flags
// SDK's sealed stores all satisfy these.
type HeaderReader = { get(name: string): string | null | undefined };
type CookieReader = { get(name: string): { value: string } | undefined };

export function resolveAttributes(r: {
  headers: HeaderReader;
  cookies: CookieReader;
}): Attributes {
  /* … */
}

export async function readAttributes(): Promise<Attributes> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return resolveAttributes({ headers: h, cookies: c });
}
```

Three callers need this and only one of them can use `next/headers`: a Server
Component (can), proxy (cannot), and the Flags SDK's `identify` callback (is
handed sealed stores instead).

**`identify` should read the stores it is given**, not call `next/headers`
itself. Otherwise a flag evaluated against a synthetic request — the `readStatic`
trick — would quietly answer from the *real* request, targeting on one visitor's
attributes while claiming to be a build-time read.

```ts
const identify = dedupe((({ headers, cookies }) =>
  resolveAttributes({ headers, cookies })) satisfies Identify<Attributes>);
```

`dedupe` makes it run once per request however many flags ask for it.

## Attributes that need care

**Anonymous id.** Must exist before the first render, and only proxy, a Route
Handler or a Server Action may set a cookie — a Server Component cannot. Mint it
in proxy. Make it `httpOnly`: an id JavaScript can rewrite is an id an injected
script can use to move someone between variants.

**Campaign / UTM.** Exists only on the landing request. Persist it to a cookie in
proxy on first sight, or a returning visitor silently reclassifies mid-experiment
and your cohorts drift.

**Anything time-derived.** `new Date()` in a prerender is captured at build and
frozen. Compute it in proxy, where there is no prerender to be captured into.

**Device class.** `userAgent()` from `next/server` (ua-parser, bundled) separates
mobile/tablet/desktop. It cannot tell you a phone is a *cheap* phone — that is
Client Hints (`Device-Memory`, `ECT`, `Save-Data`), which are Chromium-only and
arrive only after a response has advertised `Accept-CH`. So the first request
from any new browser has none. Fall back to treating a fast phone as a fast
phone.

## Why not the stock adapter

`@flags-sdk/growthbook` fetches the ruleset itself and caches it in a `WeakMap`
keyed by the request. That dedupes across flags within one request and caches
nothing between requests — one network read per request, where a cached
`getRuleset()` gives zero.

It also cannot be prerendered at all: its own fetch is uncached, so it fails the
prerender even when the flag is read with the `readStatic` stand-in request.

Neither is configurable away. Implementing `decide` against your own cached
ruleset is a few lines and removes both problems.

If you prefer an adapter for its own sake, `Adapter` carries `origin`,
`identify`, and `decide`, and `decide` receives the flag's `key` — so a custom
adapter can centralise the origin URL and the default lookup. That is a style
choice, not a correctness one.

## Discovery endpoint

Exposes your flag definitions to the Vercel Toolbar.

```ts
// app/.well-known/vercel/flags/route.ts
export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({ killSwitch, heroFlag /* list them explicitly */ }),
);
```

List flags explicitly. A namespace import (`import * as flags`) sweeps up helper
exports that are not flags and breaks the type.

It answers `401` without a valid access proof, and **the raw `FLAGS_SECRET` is
also a 401** — `verifyAccess` wants an encrypted proof token minted by the
Toolbar, not the secret's value. Use `createAccessProof()` if you want to test
the 200 path yourself.

## Webhooks — GrowthBook has two systems

They do different jobs and sign differently. Choosing the wrong one produces a
`400` that looks like a bug in your handler.

| | SDK Webhook | Event Webhook |
| --- | --- | --- |
| sends | the ruleset payload | a notification only |
| header | `webhook-id`, `webhook-timestamp`, `webhook-signature` | `X-GrowthBook-Signature` |
| signs | `{id}.{timestamp}.{body}` | the raw body alone |
| digest | base64 | hex |
| secret | yours | GrowthBook's, `ewhk_`-prefixed |
| free-plan limit | **one per organisation** | separate limit |

**For invalidation, an Event Webhook is what you want.** A handler that only
expires a cache tag needs the notification, not the payload — and the single SDK
webhook slot is usually already taken by a platform integration (Vercel's Edge
Config sync is itself an SDK webhook).

Subscribe to `feature.*` **and** `experiment.*`. The payload contains experiments,
so a change to an experiment rule under `feature.*` alone notifies nobody.

Acknowledge the provider's test event without invalidating — a test button that
quietly expires production's cache is a surprising thing for a test button to do.

```ts
export async function POST(request: Request) {
  const body = await request.text();   // raw bytes: the signature covers them
  const provided = request.headers.get("x-growthbook-signature");
  const secret = process.env.GROWTHBOOK_EVENT_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not configured" }, { status: 500 });

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (!safeEqual(provided ?? "", expected))
    return Response.json({ error: "invalid signature" }, { status: 401 });

  if (readEvent(body) === "webhook.test")
    return Response.json({ ok: true, revalidated: null });

  revalidateTag(RULESET_TAG, "max");
  return Response.json({ ok: true });
}
```

`timingSafeEqual` **throws** on a length mismatch, so calling it directly on
attacker-controlled input turns a forged signature into a 500 rather than a 401.
Compare lengths first. (GrowthBook's own documented sample has this bug.)

**Event Webhooks are replayable by construction.** Signing the body alone means
no timestamp in the signed material, so a captured delivery stays valid
indefinitely and nothing can detect it. Acceptable only because a replay expires
one cache tag — idempotent, one extra read, reveals nothing. An endpoint doing
anything more needs a better scheme. (SDK webhooks follow Standard Webhooks and
do carry a timestamp; enforce a five-minute tolerance.)

**A race worth knowing about.** If your ruleset comes from a platform store that
the *SDK* webhook keeps in sync, a flag change fires both webhooks at once. If
your invalidation-triggered refetch beats the store's write, you re-read the old
payload and cache it again — the invalidation making staleness worse. Using
`revalidateTag(..., "max")` means nobody blocks on it, but the window is real.
Keep a manual invalidation route as the reliable override.
