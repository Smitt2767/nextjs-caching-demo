import { OfferBody, StatusLine } from "@/app/_components/slot-body";
import { trace } from "@/lib/trace";
import {
  COUNTRY_FETCH_DELAY_MS,
  fetchCountryOffer,
  simulateRenderWork,
} from "@/lib/countries";
import { loadCachedCountryOffer } from "@/lib/country-cache";
import { resolveCountry } from "@/lib/geo";

const SOURCE_NOTE = {
  preference: "cookie preference",
  "geo-header": "platform geo header",
  fallback: "no preference or geo header — fell back to US",
} as const;

/**
 * Uncached. Reads cookies (a runtime API) and does slow per-country work, so
 * it can never be prerendered — it streams in after the shell, every request.
 *
 * Renders a body only: the frame, title and disclosures around it are static
 * and live in the SlotCard wrapper.
 */
export async function CountrySlot() {
  trace("G2", "component", "CountrySlot", "requested", "no cache");

  const { code, source } = await resolveCountry();
  const offer = await fetchCountryOffer(code);

  trace("G2", "component", "CountrySlot", "rendered", `code=${code}`);

  return (
    <>
      <StatusLine
        timerId="country"
        status={`${COUNTRY_FETCH_DELAY_MS}ms lookup · ${SOURCE_NOTE[source]}`}
      />
      <OfferBody offer={offer} testId="country-slot" />
    </>
  );
}

/**
 * Same content, same 2000ms lookup — but behind `use cache`, keyed by country
 * code. The cookie is read out here at request time (so this slot also
 * streams), and only the resolved code crosses into the cached scope.
 */
export async function CachedCountrySlot() {
  // This component is NOT cached, so this line prints on every request even
  // when the data below it is a hit. That gap is the point of the slot.
  trace("G2", "component", "CachedCountrySlot", "requested", "data cached");

  const { code } = await resolveCountry();
  const { offer, serverMs, hit } = await loadCachedCountryOffer(code);
  // Not cached: the data came back instantly on a hit, but this component
  // still runs, so this cost is paid on every request.
  const renderMs = await simulateRenderWork();

  trace(
    "G2",
    "component",
    "CachedCountrySlot",
    "rendered",
    `code=${code} render=${renderMs}ms`,
  );

  return (
    <>
      <StatusLine
        timerId="country-cached"
        status={
          <>
            <span data-verdict data-testid="cached-country-verdict">
              {hit ? "cache HIT" : "cache MISS"}
            </span>{" "}
            lookup <span data-testid="cached-country-ms">{serverMs}ms</span> ·
            render still{" "}
            <span data-testid="cached-country-render-ms">{renderMs}ms</span>
          </>
        }
      />
      <OfferBody offer={offer} testId="cached-country-slot" />
    </>
  );
}
