/**
 * Server-side cache tracing.
 *
 * These run on the server, so the output goes to the terminal running
 * `next dev` / `next start` — not the browser console.
 *
 * How to read it. Anything inside a `"use cache"` scope only executes on a
 * cache **miss**, so its line only prints when the cache did not serve the
 * request. Uncached callers print unconditionally. That pairing is the whole
 * trick:
 *
 *   requested + RAN   -> cache miss, the work actually happened
 *   requested only    -> cache hit, the work was skipped
 *
 * Set CACHE_TRACE=0 to silence it.
 */

const ENABLED = process.env.CACHE_TRACE !== "0";

const C = {
  reset: "[0m",
  dim: "[2m",
  bold: "[1m",
  green: "[32m",
  yellow: "[33m",
  red: "[31m",
  violet: "[35m",
  sky: "[36m",
  grey: "[90m",
} as const;

/** Groups mirror the sections on /ppr, so a line maps to a card on screen. */
export type TraceGroup = "G1" | "G2" | "G3" | "shared";

const GROUP_COLOR: Record<TraceGroup, string> = {
  G1: C.green,
  G2: C.yellow,
  G3: C.sky,
  shared: C.grey,
};

export type TraceLayer = "component" | "data";

/**
 * `RAN` is deliberately loud: it is the line that means work happened. On a
 * warm cache you should see the quiet `requested`/`rendered` lines and no
 * `RAN` at all.
 */
export type TraceEvent = "requested" | "RAN" | "rendered" | "cached-hit";

const EVENT_STYLE: Record<TraceEvent, string> = {
  requested: C.dim,
  RAN: C.bold + C.red,
  rendered: C.dim,
  "cached-hit": C.green,
};

function pad(value: string, width: number) {
  return value.length >= width
    ? value
    : value + " ".repeat(width - value.length);
}

export function trace(
  group: TraceGroup,
  layer: TraceLayer,
  name: string,
  event: TraceEvent,
  detail?: string,
) {
  if (!ENABLED) return;

  const g = `${GROUP_COLOR[group]}${pad(group, 6)}${C.reset}`;
  const l = `${C.grey}${pad(layer, 9)}${C.reset}`;
  const n = pad(name, 28);
  const e = `${EVENT_STYLE[event]}${pad(event, 11)}${C.reset}`;
  const d = detail ? `${C.grey}${detail}${C.reset}` : "";

  console.log(`${C.violet}[cache]${C.reset} ${g} ${l} ${n} ${e} ${d}`);
}

/**
 * Times a cached call from the *outside* and reports whether it was fast
 * enough to have skipped the underlying work.
 *
 * Has to wrap the call rather than live inside it: a timer inside a cached
 * scope would be cached along with everything else, so it could never report
 * a hit.
 */
export async function traceCachedCall<T>(
  group: TraceGroup,
  name: string,
  thresholdMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  const value = await fn();
  const ms = Math.round(performance.now() - startedAt);

  trace(
    group,
    "data",
    name,
    ms < thresholdMs ? "cached-hit" : "RAN",
    `${ms}ms`,
  );

  return value;
}
