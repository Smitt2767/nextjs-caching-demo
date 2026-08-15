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
 * Plain `use cache`, not `remote`, and deliberately so. This call takes no
 * request-time input, so it resolves during the prerender and the answer is
 * baked into the static shell. Measured: one read during the build, zero across
 * eight subsequent requests.
 *
 * Two sources, because they are good at different things:
 *
 *   - **Vercel Edge Config**, when `EXPERIMENTATION_CONFIG` is set. GrowthBook
 *     syncs the payload into it. Reads are replicated to the runtime on Vercel,
 *     which is what will matter in `proxy.ts` at step 11 — proxy cannot use
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

  // `cacheLife` is called once per branch below rather than once at the top:
  // a successful read is good for minutes, but a failure should be retried
  // much sooner than that — otherwise one blip is cached as if it were an
  // answer.
  const clientKey = process.env.GROWTHBOOK_CLIENT_KEY;
  if (!clientKey) {
    console.error("[flags] GROWTHBOOK_CLIENT_KEY is not set");
    cacheLife(FAILURE_LIFE);
    return null;
  }

  const startedAt = performance.now();

  const fromEdge = await readFromEdgeConfig(clientKey);
  if (fromEdge) {
    // `minutes` for now: a flag change shows up within about a minute. Step 4
    // adds the webhook, after which this is a ceiling rather than the mechanism.
    cacheLife("minutes");
    return {
      payload: fromEdge,
      source: "edge-config",
      fetchMs: Math.round(performance.now() - startedAt),
    };
  }

  try {
    const payload = await readFromCdn(clientKey);
    cacheLife("minutes");
    return {
      payload,
      source: "growthbook-cdn",
      fetchMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    console.error("[flags] could not read the ruleset", error);
    cacheLife(FAILURE_LIFE);
    return null;
  }
}
