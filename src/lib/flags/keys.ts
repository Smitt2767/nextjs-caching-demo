/**
 * Names shared between `proxy.ts` and the page, plus the two derivations proxy
 * performs.
 *
 * Their own module because proxy runs before the request reaches React and
 * cannot import `next/headers`, so anything both sides need has to live
 * somewhere neither of them owns.
 */

import type { Daypart, Device } from "@/lib/personas";

/** The anonymous visitor id. Minted in proxy — see the note in `src/proxy.ts`. */
export const ANON_ID_COOKIE = "demo-anon-id";

/** How long a visitor keeps their id, and so their experiment variant. */
export const ANON_ID_MAX_AGE_DAYS = 365;

/**
 * Where the visitor came from, captured once from `?utm_campaign=` and kept.
 *
 * A cookie rather than a re-read of the URL because UTM parameters exist only
 * on the landing request. If the experiment outlives that one page view, a
 * returning visitor silently reclassifies as `organic` and their assignment
 * changes underneath them.
 */
export const AUDIENCE_COOKIE = "demo-audience";

/** How long a captured campaign keeps classifying someone. */
export const AUDIENCE_MAX_AGE_DAYS = 30;

/** Demo override: pins all four attributes to a named persona. */
export const PERSONA_COOKIE = "demo-persona";

/**
 * Proxy's two derivations, forwarded to the render as request headers.
 *
 * Headers rather than cookies because they are recomputed every request and
 * have no business persisting in a browser — a device class written to a cookie
 * would outlive the device.
 */
export const DEVICE_HEADER = "x-demo-device";
export const DAYPART_HEADER = "x-demo-daypart";

/**
 * Client Hints that describe device capability rather than device identity.
 * Advertised by proxy so the browser starts sending them.
 */
export const ACCEPT_CH = "Device-Memory, ECT, Downlink, RTT, Save-Data";

/** What the browser told us about its own capability, if anything. */
export type CapabilityHints = {
  /** RAM in GiB, quantised by the browser to 0.25/0.5/1/2/4/8. */
  deviceMemory?: number;
  /** Effective connection type: slow-2g | 2g | 3g | 4g. */
  ect?: string;
  /** The user has asked for reduced data use. */
  saveData?: boolean;
};

/**
 * Device class.
 *
 * `type` comes from `userAgent()` in `next/server`, which is `ua-parser-js`
 * bundled into Next — there is no better library to reach for, and no
 * dependency to add. It reliably separates mobile / tablet / desktop.
 *
 * What it cannot tell you is whether a phone is a *cheap* phone: that is not in
 * the User-Agent, and every library that claims otherwise is pattern-matching
 * model names against a list that is out of date the week it ships. The signal
 * that does exist is Client Hints, which is what the second half uses.
 *
 * Caveat worth knowing: Client Hints are Chromium-only, and they arrive only
 * *after* a response has advertised `Accept-CH` — so the very first request
 * from a new browser has none, and Safari and Firefox never send them. Both
 * cases fall back to plain `mobile`, which is the safe direction to be wrong
 * in: a fast phone treated as a fast phone.
 */
export function classifyDevice(
  type: string | undefined,
  hints: CapabilityHints,
): Device {
  if (type === "tablet") return "tablet";
  if (type !== "mobile") return "desktop";

  const constrained =
    hints.saveData === true ||
    (hints.deviceMemory !== undefined && hints.deviceMemory <= 2) ||
    (hints.ect !== undefined && hints.ect !== "4g");

  return constrained ? "low-end-mobile" : "mobile";
}

/** Pull the capability hints off a request, if the browser sent any. */
export function readCapabilityHints(get: (name: string) => string | null) {
  const memory = Number(get("device-memory"));
  return {
    deviceMemory: Number.isFinite(memory) && memory > 0 ? memory : undefined,
    ect: get("ect") ?? undefined,
    saveData: get("save-data") === "on",
  } satisfies CapabilityHints;
}

/**
 * Local hour to daypart.
 *
 * Computed in proxy because `new Date()` read during a prerender is captured at
 * build and then frozen for every visitor, silently. Next 16.3 added `io()` as
 * the in-page escape hatch, but proxy has no prerender to be captured into, so
 * the ambiguity never comes up.
 *
 * UTC, which is wrong for a real product — daypart should follow the visitor's
 * own clock — but right for a demo, where a reproducible value beats a
 * plausible one.
 */
export function currentDaypart(now: Date = new Date()): Daypart {
  const hour = now.getUTCHours();
  if (hour >= 6 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}
