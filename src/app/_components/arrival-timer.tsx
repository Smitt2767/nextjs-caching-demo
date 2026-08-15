"use client";

import { useSyncExternalStore } from "react";

/** The cookie-cutter "never changes" store: server says true, client says false. */
const noSubscription = () => () => {};
const onClient = () => false;
const onServer = () => true;

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
 * parsed, so the script cannot run and the ref fallback below reports against
 * the original page-load clock — which includes time spent on the previous
 * page. Reload to read the badges properly; /ppr says so.
 */
export function ArrivalTimer({ id }: { id: string }) {
  const domId = `arrival-${id}`;

  // Only emit the script where it can actually do something: in the HTML
  // document, parsed by the browser. A script element created during a *client*
  // render is inert — the browser does not execute injected scripts — and React
  // 19 logs a console error for it in development. That error was accurate and
  // permanent on every client navigation into a page carrying these badges.
  //
  // `useSyncExternalStore` is the sanctioned way to ask "am I rendering the
  // server HTML?": React uses the server snapshot for SSR *and* for the
  // hydration pass, so the markup matches and there is no mismatch, then swaps
  // to the client snapshot afterwards and drops the script. By then it has
  // already run.
  const inDocument = useSyncExternalStore(
    noSubscription,
    onClient,
    onServer,
  );

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
      {inDocument ? (
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){var n=document.getElementById(${JSON.stringify(domId)});` +
              `if(n&&!n.dataset.renderedAt){var t=Math.round(performance.now());` +
              `n.dataset.renderedAt=t;n.textContent="~"+t+"ms";}})()`,
          }}
        />
      ) : null}
    </>
  );
}
