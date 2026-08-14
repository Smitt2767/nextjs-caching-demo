import { cacheLife, cacheTag } from "next/cache";

import {
  COUNTRY_FETCH_DELAY_MS,
  fetchCountryOffer,
  type CountryCode,
  type CountryOffer,
} from "@/lib/countries";

/**
 * The same 2000ms lookup as the uncached slot, wrapped in `use cache`.
 *
 * `code` is an argument, not something read in here: the cache key is derived
 * from the arguments, so each country gets its own entry, and the cookie read
 * that produced it stays outside the cached scope (reading cookies inside one
 * is not allowed).
 */
export async function getCachedCountryOffer(
  code: CountryCode,
): Promise<CountryOffer> {
  "use cache";
  cacheLife("hours");
  cacheTag(`country-offer-${code}`);

  return fetchCountryOffer(code);
}

export type CachedOfferResult = {
  offer: CountryOffer;
  /** How long the cached call took this time. */
  serverMs: number;
  /** Whether that was fast enough to have skipped the underlying lookup. */
  hit: boolean;
};

/**
 * Calls the cached lookup and times it, so the UI can show whether this
 * request paid for the work or was served from the cache.
 *
 * The timing lives here rather than in a component because `performance.now()`
 * is impure and must not run during render.
 */
export async function loadCachedCountryOffer(
  code: CountryCode,
): Promise<CachedOfferResult> {
  const startedAt = performance.now();
  const offer = await getCachedCountryOffer(code);
  const serverMs = Math.round(performance.now() - startedAt);

  return { offer, serverMs, hit: serverMs < COUNTRY_FETCH_DELAY_MS / 2 };
}
