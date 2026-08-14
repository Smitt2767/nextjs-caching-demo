"use client";

import {
  currentNavigationId,
  msSinceNavigationStart,
} from "@/app/_components/nav-clock";

/**
 * When this panel landed on screen, in ms since **this navigation** started.
 *
 * "This navigation", not "the document load" — the two are the same on a hard
 * load, but on a soft navigation the document clock is still running from
 * whenever the first page was opened. Measuring against it added the time
 * spent on the previous page to every badge equally, which compressed the
 * differences and made a 428ms slot and a 2026ms slot look comparable. See
 * `nav-clock.tsx`.
 *
 * Two paths, because the honest answer differs by how the panel arrived:
 *
 * 1. **Initial load** — an inline `<script>` immediately after the badge. It
 *    runs while the browser is still parsing that chunk of the document, so it
 *    records the moment the markup arrived, long before React has loaded. This
 *    matters: React does not finish hydrating this page until the streamed
 *    country slot lands, so any commit-time reading would report the static
 *    shell at ~2s and make the fastest thing on the page look like the
 *    slowest. Shell chunks stamp themselves at parse time; the streamed chunk
 *    stamps itself when it arrives.
 *
 * 2. **Soft navigations and re-renders** — the ref callback, which React runs
 *    during commit. Script elements React creates client-side never execute,
 *    and by then hydration is long done, so commit time is the right reading.
 *    This path subtracts the navigation start, since no new document clock
 *    was created.
 *
 * Whichever fires first wins; `data-rendered-at` keeps the other from
 * overwriting it.
 */
export function ArrivalTimer({ id }: { id: string }) {
  const domId = `arrival-${id}`;

  return (
    <>
      <span
        id={domId}
        // The inline script rewrites this text before React hydrates, which is
        // a deliberate mismatch.
        suppressHydrationWarning
        ref={(node) => {
          if (!node) return;
          // Stamp once per navigation, not once per node. React keeps the
          // previous route mounted and reuses these nodes, so a node-only
          // guard left the badge showing a reading from a navigation that had
          // already finished.
          const nav = currentNavigationId();
          if (node.dataset.navId === nav) return;

          node.dataset.navId = nav;
          const ms = msSinceNavigationStart();
          node.dataset.renderedAt = String(ms);
          node.textContent = `rendered @${ms}ms`;
        }}
      >
        rendered @…
      </span>
      <script
        dangerouslySetInnerHTML={{
          // navId="0" is the document load. Claiming it here stops the ref
          // callback from overwriting this parse-time reading — which is the
          // accurate one — with a later commit-time reading during hydration.
          __html:
            `(function(){var n=document.getElementById(${JSON.stringify(domId)});` +
            `if(n&&!n.dataset.renderedAt){var t=Math.round(performance.now());` +
            `n.dataset.renderedAt=t;n.dataset.navId="0";` +
            `n.textContent="rendered @"+t+"ms";}})()`,
        }}
      />
    </>
  );
}
