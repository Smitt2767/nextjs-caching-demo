import { cacheLife, cacheTag } from "next/cache";

import { OfferBody, StatusLine } from "@/app/_components/slot-body";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  fetchCountryOffer,
  simulateRenderWork,
  type CountryCode,
} from "@/lib/countries";
import { resolveCountry } from "@/lib/geo";
import { trace } from "@/lib/trace";

/**
 * Group 2's component-cached slot, with the cache moved off the server's
 * memory and into a remote handler.
 *
 * Same shape as `CachedCountryPanel`: `use cache: remote` cannot read
 * `cookies()` any more than plain `use cache` can, so the code still arrives
 * as a prop from an uncached wrapper. The only line that differs is the
 * directive.
 *
 * What changes is *where* the entry lives. Plain `use cache` is in-memory:
 * scoped to one server instance, gone when it restarts or is evicted. A remote
 * handler is shared across every instance, so a hit does not depend on landing
 * on the machine that happened to compute it. That is what makes it reliable
 * on serverless, where the in-memory variant frequently misses.
 *
 * The trade, per the docs: infrastructure cost and a network round trip on
 * every lookup. Entries also do not survive a deploy — the build id is part of
 * the cache key.
 */
async function RemoteCountryPanel({ code }: { code: CountryCode }) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.countryRemote(code));

  // Only prints on a miss, same as the other cached scopes.
  trace("G3", "component", "RemoteCountryPanel", "RAN", `code=${code}`);

  const offer = await fetchCountryOffer(code);
  const renderMs = await simulateRenderWork();
  const renderedAt = new Date().toISOString();

  return (
    <>
      <StatusLine
        timerId="remote-component"
        status={
          <>
            rendered once in {renderMs}ms ·{" "}
            <span data-testid="remote-component-rendered-at">{renderedAt}</span>
          </>
        }
      />
      <OfferBody offer={offer} testId="remote-component-slot" />
    </>
  );
}

/**
 * Uncached wrapper: reads the cookie at request time, then hands the resolved
 * code to the remote-cached component.
 */
export async function RemoteCachedCountrySlot() {
  trace(
    "G3",
    "component",
    "RemoteCachedCountrySlot",
    "requested",
    "wrapper (uncached)",
  );

  const { code } = await resolveCountry();
  return <RemoteCountryPanel key={code} code={code} />;
}
