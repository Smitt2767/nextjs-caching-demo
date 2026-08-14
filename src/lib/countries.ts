// Dummy module — stands in for whatever real per-country service this becomes.
// Everything here is fake data; the point of the demo is *when* it arrives,
// not what it says.

export const COUNTRY_CODES = ["IN", "US", "UK"] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export const DEFAULT_COUNTRY: CountryCode = "US";

export function isCountryCode(value: string | undefined): value is CountryCode {
  return !!value && (COUNTRY_CODES as readonly string[]).includes(value);
}

export type CountryOffer = {
  code: CountryCode;
  label: string;
  flag: string;
  currency: string;
  greeting: string;
  headline: string;
  price: string;
  shipping: string;
  support: string;
};

const OFFERS: Record<CountryCode, CountryOffer> = {
  IN: {
    code: "IN",
    label: "India",
    flag: "🇮🇳",
    currency: "INR",
    greeting: "Namaste",
    headline: "Festive pricing for India",
    price: "₹1,499 / mo",
    shipping: "Free delivery in 2–4 days",
    support: "Support in IST (09:00–21:00)",
  },
  US: {
    code: "US",
    label: "United States",
    flag: "🇺🇸",
    currency: "USD",
    greeting: "Hey there",
    headline: "Standard pricing for the US",
    price: "$29 / mo",
    shipping: "Free 2-day shipping",
    support: "24/7 support in ET",
  },
  UK: {
    code: "UK",
    label: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    greeting: "Hello",
    headline: "VAT-inclusive pricing for the UK",
    price: "£24 / mo",
    shipping: "Next-day delivery, VAT included",
    support: "Support in GMT (08:00–20:00)",
  },
};

/** How long the fake per-country lookup takes. Fixed, so the demo is stable. */
export const COUNTRY_FETCH_DELAY_MS = 2000;

/**
 * Fake cost of rendering a panel once its data is in hand — formatting,
 * currency rules, whatever. This is the cost that *data* caching cannot
 * remove: cache the fetch and you still re-render every request. Only caching
 * the component itself skips it.
 */
export const RENDER_COST_MS = 400;

/** Returns its own elapsed ms, so components never have to call the impure
 *  `performance.now()` during render. */
export async function simulateRenderWork(): Promise<number> {
  const startedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, RENDER_COST_MS));
  return Math.round(performance.now() - startedAt);
}

/**
 * Dummy per-country lookup. Deliberately slow and deliberately NOT cached —
 * this is the request-time work that has to stream in behind <Suspense>.
 */
export async function fetchCountryOffer(
  code: CountryCode,
): Promise<CountryOffer> {
  await new Promise((resolve) =>
    setTimeout(resolve, COUNTRY_FETCH_DELAY_MS),
  );
  return OFFERS[code];
}
