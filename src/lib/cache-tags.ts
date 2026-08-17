import { COUNTRY_CODES, type CountryCode } from "@/lib/countries";
import { RULESET_TAG } from "@/lib/flags/ruleset";

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
  /** `readExplainer()` — the markdown behind /flags-explained. */
  explainer: "explainer",
  /** `getCachedCountryOffer(code)` — cached lookup, one entry per country. */
  countryOffer: (code: CountryCode) => `country-offer-${code}` as const,
  /** `CachedCountryPanel` — cached markup, one entry per country. */
  countryPanel: (code: CountryCode) => `country-panel-${code}` as const,
  /** `CachedHero` — rendered markup, one entry per experiment variant. */
  heroVariant: (variant: string) => `hero-variant-${variant}` as const,
} as const;

/**
 * The variants `hero-copy` can return, for building the tag list.
 *
 * Duplicated from the flag's declared `options` rather than imported, because
 * `sdk.ts` pulls in `flags/next` and this module is read by the invalidation
 * page's client bundle. If a fourth variation is added in GrowthBook, its
 * markup simply has no button here until this list catches up — the cache still
 * works, it just cannot be expired by hand.
 */
const HERO_VARIANTS = ["control", "urgency", "reassurance"] as const;

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
    ],
  }));

/** Tags belonging to /flags. */
export const FLAGS_TAGS: TagDescriptor[] = [
  {
    tag: RULESET_TAG,
    label: "GrowthBook ruleset",
    effect:
      "the flag payload is re-read from Edge Config on the next request, so a change made in GrowthBook shows up immediately",
  },
  ...HERO_VARIANTS.map((variant) => ({
    tag: CACHE_TAGS.heroVariant(variant),
    label: `hero markup · ${variant}`,
    effect: `the cached hero re-renders for ${variant} only — the other two variants keep their frozen timestamps`,
  })),
];

/** Every tag as a flat list — the allowlist the Server Action validates against. */
export const ALL_TAGS: string[] = [
  ...SHARED_TAGS.map((t) => t.tag),
  ...COUNTRY_TAGS.flatMap((c) => c.tags.map((t) => t.tag)),
  ...FLAGS_TAGS.map((t) => t.tag),
];
