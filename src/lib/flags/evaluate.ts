import { GrowthBookClient } from "@growthbook/growthbook";

import { getRuleset } from "@/lib/flags/ruleset";
import type { Attributes } from "@/lib/personas";

/**
 * Turning a ruleset plus attributes into a value.
 *
 * **Not the public API.** This is the engine behind the adapter in `sdk.ts`,
 * and that adapter is the only thing that should call it. Flags are declared
 * and read through the Flags SDK; this file exists because the SDK decides
 * *nothing* on its own — `decide` is ours to implement, and this is it.
 *
 * The evaluation is a hash and a walk over some rules: no network, no I/O,
 * microseconds. It is never worth caching — a cache lookup costs more than the
 * work it would avoid (RESEARCH-FLAGS.md §8.2). What *is* worth caching is the
 * ruleset behind it, which `getRuleset()` handles.
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
 *
 * It doubles as the type source: a flag's value is shaped like its default, so
 * a boolean flag cannot be read as a string by mistake.
 */
export const FLAG_DEFAULTS = {
  "catalog-kill-switch": true,
  "pricing-badge": false,
  "hero-copy": "control",
} as const;

export type FlagKey = keyof typeof FLAG_DEFAULTS;
export type FlagValue<K extends FlagKey> = (typeof FLAG_DEFAULTS)[K];

/**
 * Evaluate one flag and return its value.
 *
 * The key is a `string` because that is what the Flags SDK hands `decide` — it
 * has no way to know about `FlagKey`. `sdk.ts` puts the types back on at the
 * boundary, where the flag declarations live.
 *
 * Returns the value and nothing else, matching what `flag()` exposes to a
 * caller. GrowthBook's `evalFeature` also reports *why* it decided — the rule
 * id, the reason code, the experiment result — and that is genuinely useful
 * when a flag is behaving unexpectedly. It is deliberately dropped here: the
 * pages render a value, and carrying the rest through the adapter meant a
 * side-channel that outweighed what it bought. `evalFeature` rather than
 * `getFeatureValue` is kept anyway, so restoring it is a one-line change.
 */
export async function evaluateRaw<V>(
  key: string,
  attributes: Partial<Attributes>,
  fallback: V,
): Promise<V> {
  const ruleset = await getRuleset();

  // `getRuleset` reports failure as `null` rather than throwing, because an
  // error crossing a `use cache` boundary fails the prerender even when it is
  // caught out here. See the note on `getRuleset`.
  if (!ruleset) return fallback;

  const client = new GrowthBookClient();
  client.initSync({ payload: ruleset.payload });
  const result = client.evalFeature(key, { attributes });
  client.destroy();

  // Check the type rather than trusting it: the value lives in GrowthBook,
  // where a flag can be changed from boolean to string without the code
  // hearing about it. Falling back beats rendering something incoherent.
  return result.value !== null && typeof result.value === typeof fallback
    ? (result.value as V)
    : fallback;
}
