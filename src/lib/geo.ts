import { cookies, headers } from "next/headers";

import {
  DEFAULT_COUNTRY,
  isCountryCode,
  type CountryCode,
} from "@/lib/countries";
import type { RequestReaders } from "@/lib/flags/request-readers";

export const COUNTRY_COOKIE = "demo-country";

/**
 * Headers that hosting providers inject with the caller's country.
 * Next.js itself gives us nothing: `NextRequest.geo` was removed in v15,
 * so geo is whatever the platform in front of us decided to tell us.
 * On localhost none of these are present, which is why the cookie exists.
 */
const GEO_HEADERS = [
  "x-vercel-ip-country", // Vercel
  "cf-ipcountry", // Cloudflare
  "cloudfront-viewer-country", // AWS CloudFront
  "x-country-code", // generic / manual override for local testing
] as const;

export type CountrySource = "preference" | "geo-header" | "fallback";

export type ResolvedCountry = {
  code: CountryCode;
  source: CountrySource;
  /** The raw header value we saw, if any — useful for showing the truth in the UI. */
  detail: string | null;
};

/**
 * Resolve the country from stores the caller already holds.
 *
 * Synchronous and free of `next/headers`, which is what lets `proxy.ts` and the
 * Flags SDK's `identify` callback use it — neither can reach the async stores.
 * Step 12 needs the same country resolution at the edge that the render uses,
 * and two implementations would drift into two different variants for one
 * visitor.
 *
 * Order: explicit user preference -> provider geo header -> fallback.
 */
export function resolveCountryFrom({
  headers: headerStore,
  cookies: cookieStore,
}: RequestReaders): ResolvedCountry {
  const preference = cookieStore.get(COUNTRY_COOKIE)?.value;
  if (isCountryCode(preference)) {
    return { code: preference, source: "preference", detail: COUNTRY_COOKIE };
  }

  for (const header of GEO_HEADERS) {
    const value = headerStore.get(header)?.toUpperCase();
    if (!value) continue;
    // GB is what providers actually send for the United Kingdom.
    const normalized = value === "GB" ? "UK" : value;
    if (isCountryCode(normalized)) {
      return {
        code: normalized,
        source: "geo-header",
        detail: `${header}: ${value}`,
      };
    }
  }

  return { code: DEFAULT_COUNTRY, source: "fallback", detail: null };
}

/**
 * Resolve the country for this request. Reads runtime APIs, so this must only
 * ever be called inside a <Suspense> boundary — it can never be part of the
 * static shell.
 */
export async function resolveCountry(): Promise<ResolvedCountry> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  return resolveCountryFrom({ headers: headerStore, cookies: cookieStore });
}
