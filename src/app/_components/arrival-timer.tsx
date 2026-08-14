"use client";

/**
 * When this panel actually landed on screen, in ms since the page started
 * loading.
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
 * 2. **Later re-renders** (switching country) — the ref callback, which React
 *    runs during commit. Script elements React creates client-side never
 *    execute, and by then hydration is long done, so commit time is the right
 *    reading.
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
          if (node && !node.dataset.renderedAt) {
            const ms = Math.round(performance.now());
            node.dataset.renderedAt = String(ms);
            node.textContent = `rendered @${ms}ms`;
          }
        }}
      >
        rendered @…
      </span>
      <script
        dangerouslySetInnerHTML={{
          __html:
            `(function(){var n=document.getElementById(${JSON.stringify(domId)});` +
            `if(n&&!n.dataset.renderedAt){var t=Math.round(performance.now());` +
            `n.dataset.renderedAt=t;n.textContent="rendered @"+t+"ms";}})()`,
        }}
      />
    </>
  );
}
