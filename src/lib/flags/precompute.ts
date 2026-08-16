import { serialize } from "flags/next";

import { resolveAttributesFrom } from "@/lib/flags/attributes";
import { evaluateWith, FLAG_DEFAULTS, type FlagKey } from "@/lib/flags/evaluate";
import type { RequestReaders } from "@/lib/flags/request-readers";
import { readRulesetForProxy } from "@/lib/flags/ruleset";
import { precomputeFlags } from "@/lib/flags/sdk";

/**
 * Turning one visitor into one of twelve prerendered pages.
 *
 * This is step 12, and it inverts the arrangement every earlier step used.
 * Steps 3–11 keep the page static and let the *decision* arrive at request
 * time, streaming each flag-dependent region in behind `<Suspense>`. Precompute
 * does the opposite: it makes the decision *before* the render, encodes it into
 * a URL segment, and serves a page that was built for exactly that decision.
 * Nothing streams, because nothing is still undecided by the time rendering
 * starts.
 *
 * ## Why the page count stays small
 *
 * The instinct is that personalisation multiplies pages, and with attributes it
 * would: five audiences × four devices × three countries × three dayparts is
 * 180 combinations. But we do not prerender per *visitor* — we prerender per
 * *decision*, and the flags produce only 2 × 2 × 3 = **12** outcomes between
 * them. Adding a country or an audience adds zero pages. Adding a flag with n
 * options multiplies by n, which is the number to actually watch.
 *
 * ## Why this does not go through `flag()`
 *
 * The SDK's `precompute(flags)` is `evaluate(flags)` followed by `serialize`,
 * and `evaluate` calls each flag's `decide`. Ours reach `getRuleset()`, which
 * is a `use cache` scope — and `use cache` is a render-time directive, so it
 * cannot run in proxy at all. There is no way to hand `decide` a ruleset:
 * its parameters are fixed by the SDK.
 *
 * So this calls `serialize` — the same SDK function, the second half of
 * `precompute` — with values it computed itself through `evaluateWith`. The
 * evaluation is byte-for-byte the one the render path uses; only the ruleset
 * read differs, and that difference is forced.
 *
 * **The cost of that choice** is Vercel Toolbar overrides. `evaluate` consults
 * the `vercel-flag-overrides` cookie before calling `decide`; this path never
 * sees it, so an override set in the Toolbar does not move the precomputed
 * page. It still works on `/flags`, which evaluates through `flag()` normally —
 * which is one more reason that route was kept rather than replaced.
 */

/**
 * The fallbacks for the precomputed flags, in `precomputeFlags` order.
 *
 * Positional, and it must stay that way: `serialize` encodes values by their
 * index in the flag array, so a mismatch here would not throw — it would encode
 * the kill switch's value into the hero's slot and produce a page that is
 * wrong in a way nothing checks.
 */
const PRECOMPUTE_FALLBACKS = precomputeFlags.map(
  (flag) => FLAG_DEFAULTS[flag.key as FlagKey],
);

/**
 * Decide every precomputed flag for this request and encode the result.
 *
 * The returned code is signed with `FLAGS_SECRET`, which is what makes it safe
 * to put in a URL: without a signature the segment would be an open invitation
 * to enumerate the variant space, and to request a combination the flags would
 * never have produced.
 */
export async function precomputeCode(readers: RequestReaders): Promise<string> {
  const ruleset = await readRulesetForProxy();
  const { attributes } = resolveAttributesFrom(readers);

  const values = precomputeFlags.map((flag, index) =>
    evaluateWith(ruleset, flag.key, attributes, PRECOMPUTE_FALLBACKS[index]),
  );

  return serialize(precomputeFlags, values);
}
