"use client";

/**
 * Roughly when this panel's markup arrived, in ms since the page started
 * loading.
 *
 * Measured by an inline `<script>` immediately after the badge. It runs while
 * the browser is still parsing that chunk of the document, so each panel is
 * stamped as its own markup lands: shell chunks at parse time, a streamed slot
 * when its chunk arrives.
 *
 * This is why it is not a `useEffect`. Effects all run in the same commit once
 * React has hydrated, so every panel that is already present reports the same
 * number and the cached slots become indistinguishable from the static ones.
 * The parse-time reading separates them.
 *
 * Scope: a **fresh page load**. On a client navigation no new document is
 * parsed, so the script does not run again and the ref fallback below reports
 * against the original page-load clock — which includes time spent on the
 * previous page. Reload to read the badges properly; the index page says so.
 */
export function ArrivalTimer({ id }: { id: string }) {
  const domId = `arrival-${id}`;

  return (
    <>
      <span
        id={domId}
        // The inline script rewrites this before React hydrates, which is a
        // deliberate mismatch.
        suppressHydrationWarning
        ref={(node) => {
          // Fallback only: keeps the badge from being stuck on the placeholder
          // after a client navigation, where the script cannot run. Skipped
          // entirely when the script already stamped this node.
          if (node && !node.dataset.renderedAt) {
            const ms = Math.round(performance.now());
            node.dataset.renderedAt = String(ms);
            node.textContent = `~${ms}ms`;
          }
        }}
      >
        measuring…
      </span>
      <script
        dangerouslySetInnerHTML={{
          __html:
            `(function(){var n=document.getElementById(${JSON.stringify(domId)});` +
            `if(n&&!n.dataset.renderedAt){var t=Math.round(performance.now());` +
            `n.dataset.renderedAt=t;n.textContent="~"+t+"ms";}})()`,
        }}
      />
    </>
  );
}
