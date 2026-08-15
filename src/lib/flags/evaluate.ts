import { GrowthBookClient } from "@growthbook/growthbook";

import { getRuleset, type RulesetSource } from "@/lib/flags/ruleset";
import type { Attributes } from "@/lib/personas";

/**
 * Turning a ruleset plus attributes into a decision.
 *
 * The evaluation itself is a hash and a walk over some rules: no network, no
 * I/O, microseconds. It is never worth caching — a cache lookup costs more than
 * the work it would avoid (RESEARCH-FLAGS.md §8.2). What *is* worth caching is
 * the ruleset behind it, which `getRuleset()` handles.
 *
 * Note the client is built per call and thrown away. A `GrowthBookClient` is
 * not serialisable, so it could not be returned from a `use cache` scope even
 * if we wanted to keep one — and it does not matter, because constructing one
 * around an already-fetched payload is just an assignment.
 */

/**
 * What each flag falls back to when the ruleset cannot be reached.
 *
 * Not optional. A flag system sits behind a network call, and a network call
 * can fail; without a value here an outage at GrowthBook would decide the
 * behaviour of this app. Copies of the GrowthBook defaults, kept deliberately
 * boring — the fallback should be the safe state, not the interesting one.
 */
export const FLAG_DEFAULTS = {
  "catalog-kill-switch": true,
  "pricing-badge": false,
} as const satisfies Record<string, boolean>;

export type FlagKey = keyof typeof FLAG_DEFAULTS;

export type FlagResult = {
  value: boolean;
  /** Which store served the ruleset, or `fallback` if none could. */
  source: RulesetSource | "fallback";
  /** How long filling the cache entry took. See `Ruleset.fetchMs`. */
  fetchMs?: number;
  /**
   * Why GrowthBook returned this value — `defaultValue`, `force`, `experiment`
   * and so on, plus the id of the rule that matched.
   *
   * Surfaced because "the flag is off" and "the flag is off *because no rule
   * matched you*" are different problems, and the second one is the one people
   * spend an afternoon on.
   */
  reason?: string;
  /** Populated when the ruleset could not be read. */
  error?: string;
};

async function evaluate(
  key: FlagKey,
  attributes: Partial<Attributes>,
): Promise<FlagResult> {
  const fallback = FLAG_DEFAULTS[key];
  const ruleset = await getRuleset();

  // `getRuleset` reports failure as `null` rather than throwing, because an
  // error crossing a `use cache` boundary fails the prerender even when it is
  // caught out here. See the note on `getRuleset`.
  if (!ruleset) {
    return { value: fallback, source: "fallback", error: "ruleset unreachable" };
  }

  const client = new GrowthBookClient();
  client.initSync({ payload: ruleset.payload });

  // `evalFeature` rather than `getFeatureValue`, so the *reason* comes back
  // with the value.
  const result = client.evalFeature(key, { attributes });
  client.destroy();

  return {
    value: typeof result.value === "boolean" ? result.value : fallback,
    source: ruleset.source,
    fetchMs: ruleset.fetchMs,
    reason: result.ruleId ? `${result.source} · ${result.ruleId}` : result.source,
  };
}

/**
 * Read a flag that has no targeting.
 *
 * No attributes, because a flag with no rules gives the same answer to
 * everyone. That is what lets this whole call resolve during the prerender and
 * land in the static shell.
 */
export async function getFlag(key: FlagKey): Promise<FlagResult> {
  return evaluate(key, {});
}

/**
 * Read a flag whose answer depends on the visitor.
 *
 * **Must be called inside a `<Suspense>` boundary**, because the attributes it
 * needs come from `cookies()` and `headers()` and can never be part of the
 * static shell.
 *
 * Note what is and is not request-time here. The ruleset behind this is still
 * the cached, build-time one — the same entry the kill switch uses. Only the
 * attributes are per-request, and matching them against the rules is free. So
 * "this flag is personalised" costs a rule walk, not a fetch.
 */
export async function getTargetedFlag(
  key: FlagKey,
  attributes: Attributes,
): Promise<FlagResult> {
  return evaluate(key, attributes);
}
