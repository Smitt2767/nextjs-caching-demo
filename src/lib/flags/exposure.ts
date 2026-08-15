import { cacheLife, cacheTag } from "next/cache";

import { evaluateRaw } from "@/lib/flags/evaluate";
import { HERO_COPY, HERO_RENDER_MS } from "@/lib/flags/hero-copy";

/**
 * The most dangerous mistake in this project, built twice so it can be counted.
 *
 * An A/B test is not the variant rendering. It is an **exposure event** ("visitor
 * 123 saw variant B") paired with a later conversion. Put the exposure call
 * inside a cached scope and it runs on the miss; every hit skips the whole
 * function body, tracking included. Fifty thousand visitors, three exposures —
 * one per cache entry. Conversions still attach to all fifty thousand, so the
 * measured lift is meaningless and every dashboard looks healthy.
 *
 * This is the same shape as RESEARCH.md §5.3 and §5.5 — correct-looking code, no
 * error, no warning, no failing test — and worse than either, because the damage
 * is to the data rather than the latency. Nothing in a timing measurement can
 * show it, and nobody notices for months.
 *
 * Both paths below render identical markup with identical caching. The only
 * difference is which side of the cache boundary the tracking call sits on.
 */

/** Cleared together with the counters, so the probe can be re-run. */
export const EXPOSURE_TAG = "exposure-probe";

/**
 * Every tag the probe writes, so a reset can expire all of them.
 *
 * Derived from `HERO_COPY` rather than listed by hand — a variant added there
 * and missed here would leave a warm entry behind, and the next run would report
 * *fewer* exposures on the broken path than it should. That would look like the
 * bug getting worse rather than like a stale cache.
 */
export function exposureTags(): string[] {
  return Object.keys(HERO_COPY).flatMap((variant) => [
    `${EXPOSURE_TAG}-inside-${variant}`,
    `${EXPOSURE_TAG}-outside-${variant}`,
  ]);
}

export type ExposureSide = "inside" | "outside";

export type ExposureCounts = {
  /** How many simulated visitors were served. */
  visitors: number;
  /** Exposures recorded by the path that tracks inside the cached scope. */
  inside: number;
  /** Exposures recorded by the path that tracks in the uncached wrapper. */
  outside: number;
  /** Variant spread as the *correct* path saw it — one entry per visitor. */
  byVariant: Record<string, number>;
};

/**
 * Module-level, and that is a real limitation rather than a shortcut.
 *
 * On a single `next start` this counts exactly. On serverless each instance
 * keeps its own tally, so a deployed run undercounts both sides — the *ratio*
 * survives, which is the thing the demo is about, but the absolute numbers do
 * not. A real system sends exposures to an analytics pipeline instead, which is
 * precisely why the bug this demonstrates is invisible: the pipeline receives
 * well-formed events, just far too few of them.
 */
const counts = { visitors: 0, inside: 0, outside: 0 } as {
  visitors: number;
  inside: number;
  outside: number;
};
const byVariant = new Map<string, number>();

function record(side: ExposureSide) {
  counts[side] += 1;
}

export function readCounts(): ExposureCounts {
  return {
    visitors: counts.visitors,
    inside: counts.inside,
    outside: counts.outside,
    byVariant: Object.fromEntries(byVariant),
  };
}

export function resetCounts(): void {
  counts.visitors = 0;
  counts.inside = 0;
  counts.outside = 0;
  byVariant.clear();
}

/**
 * **The wrong one.** Tracking inside the cached scope.
 *
 * Reads perfectly: assign the visitor, record that they saw it, render. The
 * `use cache: remote` on top is the only thing wrong with it, and it is the same
 * directive the correct version uses.
 *
 * Note that nothing here is *incorrect* on a miss. It is right the first time
 * and silently skipped every time after.
 */
async function renderTrackingInside(variant: string) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(`${EXPOSURE_TAG}-inside-${variant}`);

  // Fires once per cache entry, not once per visitor. This is the bug.
  record("inside");

  await new Promise((resolve) => setTimeout(resolve, HERO_RENDER_MS));
  return HERO_COPY[variant] ?? HERO_COPY.control;
}

/**
 * **The right one.** The cached scope renders and nothing else.
 *
 * Identical caching, identical output, identical cost. The tracking call moved
 * one level up, into `serveVisitor` below, where it runs per request.
 */
async function renderTrackingOutside(variant: string) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(`${EXPOSURE_TAG}-outside-${variant}`);

  await new Promise((resolve) => setTimeout(resolve, HERO_RENDER_MS));
  return HERO_COPY[variant] ?? HERO_COPY.control;
}

/**
 * One simulated visitor through both paths.
 *
 * The id is the only input, and it is hashed by the real ruleset — this is the
 * same `evaluateRaw` the flags themselves use, so the split is GrowthBook's
 * rather than something invented here.
 *
 * **The line to notice** is the one between `record("outside")` and
 * `renderTrackingOutside`. The boundary between "runs every request" and "runs
 * once per variant" is exactly the boundary between what must be tracked and
 * what may be cached. They are the same line, and drawing it once is the whole
 * discipline.
 */
export async function serveVisitor(visitorId: string): Promise<void> {
  const variant = await evaluateRaw("hero-copy", { id: visitorId }, "control");

  counts.visitors += 1;
  byVariant.set(variant, (byVariant.get(variant) ?? 0) + 1);

  // Outside the cache: once per visitor, which is what an exposure means.
  record("outside");

  await Promise.all([
    renderTrackingInside(variant),
    renderTrackingOutside(variant),
  ]);
}
