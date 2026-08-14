// Dummy module — the "expensive but cacheable" half of the demo.
// It takes no runtime input, so `use cache` lets it be computed once and
// baked into the static shell.

import { cacheLife, cacheTag } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";

export type CatalogEntry = { name: string; blurb: string };

export type Catalog = {
  entries: CatalogEntry[];
  /** When this entry was produced. Frozen — if it never moves, you're on a cache hit. */
  cachedAt: string;
};

/** Fake cost of the "expensive" catalog build. */
const CATALOG_COMPUTE_MS = 2000;

const ENTRIES: CatalogEntry[] = [
  { name: "Starter", blurb: "Everything you need to kick the tyres." },
  { name: "Team", blurb: "Shared workspaces, roles and audit history." },
  { name: "Enterprise", blurb: "SSO, data residency and a named engineer." },
];

/**
 * Cached with `use cache`: no cookies, no headers, no params — nothing
 * request-specific — so Next can prerender it into the static shell and
 * serve it without recomputing.
 */
export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.catalogData);

  // The expense that caching saves. Paid once, then never again.
  await new Promise((resolve) => setTimeout(resolve, CATALOG_COMPUTE_MS));

  return {
    entries: ENTRIES,
    cachedAt: new Date().toISOString(),
  };
}
