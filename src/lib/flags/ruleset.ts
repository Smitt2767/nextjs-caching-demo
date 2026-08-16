import { createClient } from "@vercel/edge-config";
import { cacheLife, cacheTag } from "next/cache";
import type { FeatureApiResponse } from "@growthbook/growthbook";

/**
 * The GrowthBook ruleset — the JSON describing every feature, its rules and its
 * experiments.
 *
 * This is the only I/O in the whole flag system, which is why it is the only
 * part worth caching carefully. It is also the same bytes for every visitor on
 * Earth: nothing about it depends on who is asking, so it is ordinary cacheable
 * content rather than request data (RESEARCH-FLAGS.md §4.1).
 *
 * Plain `use cache`, not `remote` — and the original reason given here was
 * wrong, so it is worth stating what the real one is.
 *
 * The claim used to be that `remote` would stop the value reaching the static
 * shell. **Measured: it does not.** Switching this directive to
 * `use cache: remote` still builds, still leaves `/flags` a partial prerender,
 * and still bakes the correct live kill-switch value into the HTML at a
 * byte offset inside `<main>`. Shell eligibility is not the deciding factor.
 *
 * What actually decides it is unmeasured, and cuts both ways:
 *
 *   - **For `remote`:** on serverless, plain `use cache` is per-instance
 *     memory, so `updateTag` fired on one instance may not reach an instance
 *     already holding a warm entry. Since `/invalidate` is this project's whole
 *     flag-change mechanism (step 4's webhook being blocked), that is a
 *     correctness question, not a performance one.
 *   - **Against `remote`:** the work being cached is a single Edge Config read,
 *     which is cheap on Vercel. Per-instance memory amortises it across an
 *     instance's whole lifetime, whereas a shared store is a round trip per
 *     lookup. Unlike /ppr's 2000ms slots, `remote` here may cost more calls
 *     than it saves.
 *
 * Left as plain `use cache` because that is what M1 and M7 measured, and the
 * case for changing it is currently an argument rather than a number. See
 * RESEARCH-FLAGS.md §14 Q7 for the experiment that would settle it.
 *
 * Two sources, because they are good at different things:
 *
 *   - **Vercel Edge Config**, when `EXPERIMENTATION_CONFIG` is set. GrowthBook
 *     syncs the payload into it. Reads are replicated to the runtime on Vercel,
 *     which is what will matter in `proxy.ts` at step 12 — proxy cannot use
 *     `use cache`, so precompute needs the ruleset on every request, and a CDN
 *     round trip there would sit on the critical path.
 *   - **The GrowthBook CDN** otherwise, and as a fallback when Edge Config
 *     fails. Kept rather than replaced so §13's latency comparison still has a
 *     baseline to compare against.
 */

/** Invalidated by the GrowthBook webhook in step 4. */
export const RULESET_TAG = "growthbook-payload";

const DEFAULT_API_HOST = "https://cdn.growthbook.io";

/**
 * The cache profile used when the ruleset could not be read.
 *
 * `revalidate` is short so a blip is retried in half a minute rather than being
 * cached like an answer. `stale` is **not** short, and cannot be: it decides
 * whether content is eligible for the route's App Shell, and anything under
 * five minutes makes this scope unprerenderable — which fails the build with
 * "encountered uncached or runtime data during prerendering" rather than
 * anything mentioning cache lifetimes. Measured; `cacheLife("seconds")` here
 * does exactly that.
 */
const FAILURE_LIFE = { stale: 300, revalidate: 30, expire: 300 };

/**
 * The cache profile for a successful read.
 *
 * Long, deliberately. The webhook that would normally expire this on a flag
 * change is unavailable — GrowthBook's free plan allows one SDK webhook per
 * organisation and Vercel's Edge Config sync already holds it — but shortening
 * the cache to compensate would mean polling a service that rarely changes, and
 * would blur the very thing this project measures.
 *
 * So invalidation is explicit instead: the `growthbook-payload` button on
 * /invalidate. On a demo that is better than a timer, because the moment the
 * value changes is a moment you chose.
 *
 * `src/app/api/growthbook-webhook/route.ts` is built and tested and simply has
 * nothing pointed at it. Given a webhook slot it takes over, unchanged.
 */
const SUCCESS_LIFE = "hours";

export type RulesetSource = "edge-config" | "growthbook-cdn";

export type Ruleset = {
  payload: FeatureApiResponse;
  source: RulesetSource;
  /**
   * How long the read took.
   *
   * Cached along with everything else, so it describes the read that *filled*
   * this entry rather than the request you are looking at. Reading it as a
   * per-request latency is the mistake RESEARCH.md §7 warns about.
   */
  fetchMs: number;
};

/** GrowthBook stores the payload in Edge Config keyed by the SDK client key. */
async function readFromEdgeConfig(
  clientKey: string,
): Promise<FeatureApiResponse | null> {
  const connectionString = process.env.EXPERIMENTATION_CONFIG;
  if (!connectionString) return null;

  try {
    const client = createClient(connectionString);
    const payload = await client.get<FeatureApiResponse>(clientKey);
    return payload ?? null;
  } catch (error) {
    // Fall through to the CDN rather than failing: a misconfigured Edge Config
    // should degrade to a slower read, not to no flags at all. Logged, so the
    // degradation is visible rather than silent.
    console.error("[flags] Edge Config read failed, falling back to CDN", error);
    return null;
  }
}

async function readFromCdn(clientKey: string): Promise<FeatureApiResponse> {
  const host = process.env.GROWTHBOOK_API_HOST ?? DEFAULT_API_HOST;

  // No `next: { revalidate, tags }` here. Under Cache Components the enclosing
  // `use cache` scope owns the caching; the fetch options would be a second,
  // separate layer with different persistence rules.
  const response = await fetch(`${host}/api/features/${clientKey}`);

  if (!response.ok) {
    throw new Error(
      `GrowthBook returned ${response.status} fetching the ruleset`,
    );
  }

  return (await response.json()) as FeatureApiResponse;
}

/**
 * One read of the ruleset, with no caching of any kind.
 *
 * Split out of `getRuleset` so the *only* difference between the two callers is
 * the cache around them. Edge Config first, CDN as a fallback, failure reported
 * as `null` — that policy is written once here rather than once per caller,
 * because a proxy that fell back differently from the render would route a
 * visitor to a variant the render then disagreed with.
 *
 * `ok` is returned alongside because the caller picks the cache lifetime from
 * it, and `null` alone cannot distinguish "no client key" from "GrowthBook is
 * down" — both are failures, but only the caller knows what to do about them.
 */
async function loadRuleset(): Promise<{ ruleset: Ruleset | null; ok: boolean }> {
  const clientKey = process.env.GROWTHBOOK_CLIENT_KEY;
  if (!clientKey) {
    console.error("[flags] GROWTHBOOK_CLIENT_KEY is not set");
    return { ruleset: null, ok: false };
  }

  const startedAt = performance.now();

  const fromEdge = await readFromEdgeConfig(clientKey);
  if (fromEdge) {
    return {
      ruleset: {
        payload: fromEdge,
        source: "edge-config",
        fetchMs: Math.round(performance.now() - startedAt),
      },
      ok: true,
    };
  }

  try {
    return {
      ruleset: {
        payload: await readFromCdn(clientKey),
        source: "growthbook-cdn",
        fetchMs: Math.round(performance.now() - startedAt),
      },
      ok: true,
    };
  } catch (error) {
    console.error("[flags] could not read the ruleset", error);
    return { ruleset: null, ok: false };
  }
}

/**
 * The ruleset for `proxy.ts`, read fresh on every request.
 *
 * **Uncached, and it has to be.** `use cache` is a React/Next render-time
 * directive and proxy runs before the render exists, so `getRuleset()` cannot
 * be called there at all. Step 12 needs the ruleset in proxy — that is where
 * the precompute decision is made — so this is the read it gets.
 *
 * That makes it the one place in this project where flag I/O sits on the
 * critical path of every request, which is exactly what the Next docs warn
 * against: *"Proxy is not intended for slow data fetching."* Two things keep it
 * honest:
 *
 *   - **Edge Config is the fast path**, and it is why the Edge Config source
 *     exists at all. Its reads are replicated to the runtime rather than
 *     fetched over a network, so this costs a local lookup.
 *   - **The CDN fallback is a genuine degradation here**, not the equal
 *     alternative it is in the render. A cross-region round trip in front of
 *     every request is worse than the streaming it was meant to avoid. It stays
 *     because failing open beats failing closed, but if `EXPERIMENTATION_CONFIG`
 *     is unset, precompute is the wrong tool.
 *
 * Note that nothing is lost by not caching here beyond the lookup itself. The
 * *page* this feeds is prerendered — twelve static variants — so the expensive
 * half of the work was already paid for at build.
 */
export async function readRulesetForProxy(): Promise<Ruleset | null> {
  return (await loadRuleset()).ruleset;
}

/**
 * Returns `null` rather than throwing when the ruleset cannot be read, and that
 * is not a style choice.
 *
 * **Measured:** an error thrown inside a `use cache` scope fails the prerender
 * even when the caller catches it. With a bad client key the `catch` in
 * `getFlag()` ran — twice, visibly, in the logs — and `next build` still died
 * with `Error occurred prerendering page "/flags"`. React surfaces the error to
 * the prerender before the caller ever sees it.
 *
 * Left as-is, a bad minute at GrowthBook would fail every deploy. So failure is
 * handled inside the cached scope and reported as a value.
 */
export async function getRuleset(): Promise<Ruleset | null> {
  "use cache";
  cacheTag(RULESET_TAG);

  const { ruleset, ok } = await loadRuleset();

  // Called after the read rather than at the top, so a failed read carries a
  // different lifetime from a successful one. They differ only in `expire`: a
  // success is good for an hour, a failure for five minutes, and neither is
  // cached as though it were the other.
  //
  // Two calls rather than one on a ternary: `cacheLife` is overloaded on named
  // profile vs literal object, and a union of the two matches neither overload.
  if (ok) cacheLife(SUCCESS_LIFE);
  else cacheLife(FAILURE_LIFE);

  return ruleset;
}
