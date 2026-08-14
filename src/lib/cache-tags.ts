import { COUNTRY_CODES, type CountryCode } from "@/lib/countries";

/**
 * Every cache tag on /ppr, in one place.
 *
 * Tags were previously written as bare strings at the `cacheTag()` call sites,
 * which meant the invalidation page could drift out of sync with them silently.
 * Both sides now read from here.
 */
export const CACHE_TAGS = {
  /** `getCatalog()` — the cached catalog *data*. */
  catalogData: "catalog-data",
  /** `ComponentCachedCatalog` — the cached catalog *markup*. */
  catalogPanel: "catalog-panel",
  /** `highlight()` — the Shiki-rendered code excerpts. */
  snippets: "snippets",
  /** `getCachedCountryOffer(code)` — cached lookup, one entry per country. */
  countryOffer: (code: CountryCode) => `country-offer-${code}` as const,
  /** `CachedCountryPanel` — cached markup, one entry per country. */
  countryPanel: (code: CountryCode) => `country-panel-${code}` as const,
  /** `RemoteCountryPanel` — same markup, in the remote handler. */
  countryRemote: (code: CountryCode) => `country-remote-${code}` as const,
} as const;

export type TagDescriptor = {
  tag: string;
  label: string;
  /** What actually recomputes when this tag is expired. */
  effect: string;
};

/** Tags that are not country-specific. */
export const SHARED_TAGS: TagDescriptor[] = [
  {
    tag: CACHE_TAGS.catalogData,
    label: "catalog data",
    effect: "getCatalog() re-runs its 2000ms compute on the next request",
  },
  {
    tag: CACHE_TAGS.catalogPanel,
    label: "catalog panel",
    effect: "the component-cached catalog re-renders, markup and all",
  },
  {
    tag: CACHE_TAGS.snippets,
    label: "code snippets",
    effect: "Shiki re-highlights every excerpt on the page",
  },
];

/** Per-country tags, two per code. */
export const COUNTRY_TAGS: { code: CountryCode; tags: TagDescriptor[] }[] =
  COUNTRY_CODES.map((code) => ({
    code,
    tags: [
      {
        tag: CACHE_TAGS.countryOffer(code),
        label: `offer data · ${code}`,
        effect: `the amber slot pays its 2000ms lookup again for ${code} only`,
      },
      {
        tag: CACHE_TAGS.countryPanel(code),
        label: `panel markup · ${code}`,
        effect: `the violet slot re-renders for ${code} only`,
      },
      {
        tag: CACHE_TAGS.countryRemote(code),
        label: `remote panel · ${code}`,
        effect: `the remote-cached slot re-renders for ${code} only`,
      },
    ],
  }));

/** Every tag as a flat list — the allowlist the Server Action validates against. */
export const ALL_PPR_TAGS: string[] = [
  ...SHARED_TAGS.map((t) => t.tag),
  ...COUNTRY_TAGS.flatMap((c) => c.tags.map((t) => t.tag)),
];
