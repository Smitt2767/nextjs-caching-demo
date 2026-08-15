import { cacheLife, cacheTag } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";

import { OfferBody, StatusLine } from "@/app/_components/slot-body";
import { getCatalog } from "@/lib/catalog";
import { fetchCountryOffer, type CountryCode } from "@/lib/countries";
import { resolveCountry } from "@/lib/geo";

/**
 * `use cache` on the component, not on a data function.
 *
 * The cached value is the rendered output — this whole tree — so a hit skips
 * the fetch *and* the render. Compare with the data-cached catalog, which
 * caches only `getCatalog()` and re-renders every request.
 *
 * Note what this rules out: you cannot time a cache hit from inside a cached
 * component, because the timing would be cached along with everything else.
 * The honest signal is the timestamp below, frozen into the cache entry.
 */
export async function ComponentCachedCatalog() {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.catalogPanel);

  // Inside the cached component: silent on a hit, because the whole function
  // is skipped and the stored markup is replayed instead.

  const catalog = await getCatalog();
  const renderedAt = new Date().toISOString();

  return (
    <>
      <StatusLine
        timerId="catalog-component"
        status={`rendered once at ${renderedAt}`}
      />
      <CatalogList
        entries={catalog.entries}
        testId="component-cached-catalog"
      />
    </>
  );
}

export function CatalogList({
  entries,
  testId,
}: {
  entries: { name: string; blurb: string }[];
  testId: string;
}) {
  return (
    <ul data-testid={testId} className="space-y-2 text-[13px]">
      {entries.map((entry) => (
        <li key={entry.name}>
          <span className="font-medium text-ink">{entry.name}</span>
          <span className="text-ink-subtle"> — {entry.blurb}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The same idea with request-time input. `code` arrives as a prop and becomes
 * part of the cache key, so there is one cached panel per country — and the
 * cookie read that produced `code` stays outside, in the wrapper below.
 *
 * A hit skips both the 2000ms lookup and the 400ms render.
 */
export async function CachedCountryPanel({
  code,
  slot = "component-country",
}: {
  code: CountryCode;
  /**
   * Which card this instance renders into. Group 3 reuses this exact
   * component behind a private wrapper, and the two need distinct element ids
   * so their arrival badges don't collide.
   *
   * It is part of the cache key, so the two cards get their own entries rather
   * than sharing one. Everything else about them is identical.
   */
  slot?: "component-country" | "private-component";
}) {
  // See `getCachedCountryOffer`: request-time work needs a cache that outlives
  // the instance, so this is `remote` rather than plain `use cache`.
  "use cache: remote";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.countryPanel(code));

  const offer = await fetchCountryOffer(code);
  const renderedAt = new Date().toISOString();

  return (
    <>
      <StatusLine
        timerId={slot}
        status={
          <>
            rendered once at{" "}
            <span data-testid={`${slot}-rendered-at`}>{renderedAt}</span>
          </>
        }
      />
      <OfferBody offer={offer} testId={`${slot}-slot`} />
    </>
  );
}

/**
 * Uncached wrapper: reads the cookie at request time (which is why this slot
 * still streams on a cold load), then hands the resolved code to the cached
 * component.
 */
export async function ComponentCachedCountrySlot() {
  const { code } = await resolveCountry();
  return <CachedCountryPanel key={code} code={code} />;
}
