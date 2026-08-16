import type { Identify } from "flags";
import { dedupe, flag } from "flags/next";

import { resolveAttributesFrom } from "@/lib/flags/attributes";
import { evaluateRaw, FLAG_DEFAULTS } from "@/lib/flags/evaluate";
import type { Attributes } from "@/lib/personas";

/**
 * Every flag in this app, declared through Vercel's Flags SDK.
 *
 * This is the only place a flag is defined. Nothing outside this file talks to
 * GrowthBook, and nothing outside it evaluates anything.
 *
 * ## What the SDK gives us
 *
 *   1. The Vercel Toolbar's Flags Explorer — override any flag on a deployed
 *      preview, for your browser only, without touching GrowthBook.
 *   2. `.well-known/vercel/flags` discovery, which lists every flag declared
 *      here whether or not a component happens to render it.
 *   3. `setTrackingCallback` + `after()` for exposure logging (step 9).
 *   4. **`precompute`** — step 12, now built. Encoding the decision space into
 *      the URL is a Flags SDK feature, not a GrowthBook one, and hand-rolling
 *      the encoding and permutation generation is the entire Tier 2 mechanism.
 *
 * A flag resolves to a **value** — that is the whole surface, and the pages are
 * written to it. GrowthBook also reports *why* it decided (rule id, reason code,
 * experiment result), which the SDK drops at its boundary; surfacing it again
 * meant threading a side-channel through the adapter, and it was not worth what
 * it cost to read.
 *
 * ## The one thing we do not take from it
 *
 * `@flags-sdk/growthbook` fetches the ruleset itself and caches it in a
 * `WeakMap` keyed by the request, so it dedupes across the flags in one request
 * and caches nothing between requests — 8 Edge Config round trips across 8
 * requests, against 0 for `getRuleset()` under `use cache` (M7).
 *
 * So each flag implements `decide` itself, against the cached ruleset.
 *
 * No `adapter` at all: an adapter is worth having when several flags share
 * non-trivial resolution logic, and ours is one call to `evaluateRaw`. The one
 * thing given up is `adapterId`, which lets `evaluate()` batch flags into a
 * single `bulkDecide`. That buys nothing here — batching amortises I/O, and
 * `decide` does none: the ruleset it reads is already cached.
 */

/** Deep-links each flag to its GrowthBook page from the Vercel Toolbar. */
const APP_ORIGIN =
  process.env.GROWTHBOOK_APP_ORIGIN ?? "https://app.growthbook.io";

/** Where a flag is managed, for the Toolbar's "open in GrowthBook" link. */
const origin = (key: string) => `${APP_ORIGIN}/features/${key}`;

/**
 * Everything the SDK is allowed to know about the visitor.
 *
 * `dedupe` makes this run once per request no matter how many flags ask for
 * it — five flags must not mean five cookie reads and five geo lookups.
 *
 * **Reads the stores the SDK hands it, rather than calling `next/headers`
 * itself.** That matters for `readStatic` below: it evaluates a flag against a
 * synthetic request, and an `identify` that went to `next/headers` would
 * quietly answer from the *real* request instead — targeting on one visitor's
 * attributes while claiming to be a build-time read. Taking the params means
 * the synthetic request gets synthetic (empty) attributes, which is what it
 * asked for.
 *
 * Note what this does *not* cause. A flag carrying this cannot be prerendered,
 * but neither can one without it: `getRun` reads `headers()` and `cookies()`
 * before `identify` is ever consulted, because every invocation has to check
 * for a Toolbar override and the override lives in a cookie (M6). The escape is
 * `readStatic` below, not the removal of this function.
 */
const identify = dedupe((({ headers, cookies }) =>
  resolveAttributesFrom({ headers, cookies })
    .attributes) satisfies Identify<Attributes>);

/**
 * Read a flag during the prerender, so its value lands in the static shell.
 *
 * `flag()` dispatches on its arguments, and handing it a request takes the
 * branch that never touches `next/headers` — so a flag read this way resolves
 * at build time. Measured: a probe page built as `○` (fully static, no
 * postpone) with the correct live value baked into the HTML.
 *
 * **Only for flags with no targeting.** The request is a stand-in carrying no
 * cookies and no headers, so a flag that consulted `identify` would silently
 * see nothing and mis-target rather than fail. Anything visitor-dependent must
 * be awaited normally, inside `<Suspense>`.
 *
 * **The `new Request` is per call and must stay that way.** The SDK memoises
 * evaluations in a `WeakMap` keyed by the request's headers object, so a module
 * constant here would freeze the value for the lifetime of the server process,
 * outliving `/invalidate` and every ruleset change with it. Measured: with a
 * shared request one flag's timestamp never moved across three requests while a
 * freshly-constructed one moved every time (M8). Allocating a `Request` is free
 * next to being wrong.
 */
function readStatic<T>(f: (request: Request) => Promise<T>): Promise<T> {
  return f(new Request("https://prerender.invalid/"));
}

/*
 * `options` is declared on every flag below deliberately.
 *
 * The Flags SDK encodes a precomputed decision as an index into the declared
 * option list, so a flag with no `options` cannot be precomputed — it drops out
 * of the permutation set and quietly falls back to request-time evaluation.
 * Step 12 needed no change here because of it.
 */

/**
 * No `identify`, because this flag has no targeting rules — the answer is the
 * same for every visitor, which is what makes it prerenderable.
 *
 * Read it through `getCatalogKillSwitch()` rather than calling it directly.
 */
export const catalogKillSwitch = flag<boolean>({
  key: "catalog-kill-switch",
  origin: origin("catalog-kill-switch"),
  defaultValue: FLAG_DEFAULTS["catalog-kill-switch"],
  description: "Hides the catalogue outright. No targeting rules.",
  options: [false, true],
  decide: () =>
    evaluateRaw(
      "catalog-kill-switch",
      {},
      FLAG_DEFAULTS["catalog-kill-switch"],
    ),
});

/** The kill switch, read so that it lands in the static shell. */
export function getCatalogKillSwitch(): Promise<boolean> {
  return readStatic(catalogKillSwitch);
}

export const pricingBadge = flag<boolean, Attributes>({
  key: "pricing-badge",
  origin: origin("pricing-badge"),
  defaultValue: FLAG_DEFAULTS["pricing-badge"],
  description: "Regional pricing badge. Forced on for IN and UK.",
  options: [false, true],
  identify,
  decide: ({ entities }) =>
    evaluateRaw(
      "pricing-badge",
      entities ?? {},
      FLAG_DEFAULTS["pricing-badge"],
    ),
});

export const heroCopy = flag<string, Attributes>({
  key: "hero-copy",
  origin: origin("hero-copy"),
  defaultValue: FLAG_DEFAULTS["hero-copy"],
  description: "Hero A/B/C. Corporate visitors are excluded by a forced rule.",
  options: ["control", "urgency", "reassurance"],
  identify,
  decide: ({ entities }) =>
    evaluateRaw("hero-copy", entities ?? {}, FLAG_DEFAULTS["hero-copy"]),
});

/**
 * Whether this specific visitor may see the beta.
 *
 * Unlike every other flag here, the answer is **genuinely per-person**: it is
 * forced on for a list of individual ids, so no two visitors can be assumed to
 * share it. That rules out both shared caches — `use cache` and
 * `use cache: remote` would each serve one visitor's entitlement to everybody
 * in the entry.
 *
 * Read it inside `use cache: private`, the only cache that is per-browser and
 * the only one permitted to read cookies. See `entitlement-panel.tsx`.
 *
 * No `options`, deliberately: a flag keyed on individual identity has no
 * decision space to precompute, and declaring one would put it into step 12's
 * permutation set as though it did.
 */
export const betaEntitlement = flag<boolean, Attributes>({
  key: "beta-entitlement",
  origin: origin("beta-entitlement"),
  defaultValue: FLAG_DEFAULTS["beta-entitlement"],
  description: "Per-visitor beta access. Forced on for a list of ids.",
  identify,
  decide: ({ entities }) =>
    evaluateRaw(
      "beta-entitlement",
      entities ?? {},
      FLAG_DEFAULTS["beta-entitlement"],
    ),
});

/**
 * The group precomputed at step 12, in `precompute.ts` and
 * `app/precomputed/[code]/`.
 *
 * Order is load-bearing: the generated code is positional, so reordering this
 * array invalidates every precomputed URL already in the wild. Append only.
 */
export const precomputeFlags = [
  catalogKillSwitch,
  pricingBadge,
  heroCopy,
] as const;
