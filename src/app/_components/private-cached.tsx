import { cacheLife } from "next/cache";
import { cookies } from "next/headers";

import { OfferBody, StatusLine } from "@/app/_components/slot-body";
import { trace } from "@/lib/trace";
import {
  DEFAULT_COUNTRY,
  fetchCountryOffer,
  isCountryCode,
  simulateRenderWork,
} from "@/lib/countries";
import { COUNTRY_COOKIE } from "@/lib/geo";

/**
 * Group 2's uncached slot — same 2000ms lookup, same 400ms render — with
 * `use cache: private` applied directly to the component.
 *
 * Two things that buys, neither available to plain `use cache`:
 *
 * 1. It reads `cookies()` from inside the cached scope, so it needs no
 *    uncached wrapper and no `code` prop — it resolves its own country.
 * 2. The result is held in the browser, so navigating away and back reuses it
 *    with no server round trip and **no loading state**. Compare with the red
 *    slot in group 2, which shows its skeleton on every navigation.
 *
 * The cost: nothing is stored on the server, so this runs in full on every
 * server render, and a full page reload (which clears browser memory) pays for
 * it again. `stale: 300` is what makes it eligible for the App Shell — 30s is
 * the minimum for runtime prefetching, 5 minutes for the shell.
 */
export async function PrivateComponentCountrySlot() {
  "use cache: private";
  cacheLife({ stale: 300 });

  // Private results are never stored on the server, so this prints on every
  // server render — unlike the G2 cached component, which goes quiet. What
  // the browser cache buys shows up on a client navigation, not here.
  trace(
    "G3",
    "component",
    "PrivateComponentCountrySlot",
    "RAN",
    "server render (never server-cached)",
  );

  const raw = (await cookies()).get(COUNTRY_COOKIE)?.value;
  const code = isCountryCode(raw) ? raw : DEFAULT_COUNTRY;

  const offer = await fetchCountryOffer(code);
  const renderMs = await simulateRenderWork();
  const renderedAt = new Date().toISOString();

  return (
    <>
      <StatusLine
        timerId="private-component"
        status={
          <>
            rendered in {renderMs}ms ·{" "}
            <span data-testid="private-component-rendered-at">
              {renderedAt}
            </span>
          </>
        }
      />
      <OfferBody offer={offer} testId="private-component-slot" />
    </>
  );
}
