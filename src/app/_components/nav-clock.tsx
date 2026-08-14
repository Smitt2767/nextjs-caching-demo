"use client";

import { useEffect } from "react";

/**
 * When the current navigation started, as a `performance.now()` value.
 *
 * `0` means "the document load", which is the right origin for a hard
 * navigation: `performance.now()` is already measured from there.
 *
 * On a **soft** navigation there is no new document, so the time origin stays
 * pinned to whenever the first page was loaded. Left uncorrected, a badge on
 * /ppr reports "time since you loaded the home page" — every slot inflated by
 * the same constant, which makes fast and slow slots look alike. Sit on the
 * index for ten seconds and everything reads ~10s.
 */
let navigationStart = 0;

/**
 * Increments on every navigation.
 *
 * Badges stamp themselves once per node, which stops the two measurement paths
 * from overwriting each other. But React preserves the previous route rather
 * than unmounting it (Cache Components keeps routes alive via `<Activity>`),
 * so navigating back reuses the very same DOM nodes — already stamped, and
 * showing a reading from a navigation that is over. Pairing the stamp with the
 * navigation it belongs to lets a node re-stamp when the navigation changes
 * while still stamping only once within one.
 */
let navigationId = 0;

/** Milliseconds from the start of the current navigation until now. */
export function msSinceNavigationStart(): number {
  return Math.round(performance.now() - navigationStart);
}

/** Which navigation is currently in progress. */
export function currentNavigationId(): string {
  return String(navigationId);
}

function markNavigationStart() {
  navigationStart = performance.now();
  navigationId += 1;
}

/**
 * Stamps the navigation start on link clicks and history moves.
 *
 * A capture-phase listener on the document is the earliest hook available —
 * it runs before the router begins the transition, so the reading covers the
 * whole navigation rather than starting partway through it. Mounted once in
 * the root layout.
 */
export function NavClock() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return; // opens a new tab: no client navigation happens here
      }

      const anchor = (event.target as Element | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      // Same-origin, non-hash links only — those are the ones the router
      // handles without a document load.
      if (!href?.startsWith("/") || anchor?.target === "_blank") return;

      markNavigationStart();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", markNavigationStart);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", markNavigationStart);
    };
  }, []);

  return null;
}
