import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { cacheLife, cacheTag } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * The plain-English flag explainer, read from disk.
 *
 * Markdown rather than JSX because the document is prose first — tables,
 * fenced blocks and an ASCII diagram — and hand-converting it to elements would
 * make every future edit a code change. It is the same file whichever way you
 * read it, which is the point: the route is a view of the document, not a
 * second copy of it.
 *
 * **`use cache` is not optional here.** `readFile` is real I/O, and an
 * uncached asynchronous gap fails the prerender outright — the same rule that
 * makes a bare `setTimeout` illegal in a prerendered scope. Declared cacheable,
 * it resolves at build and the route prerenders whole.
 *
 * `cacheLife("max")` because the content only changes when the repo does, and
 * the build id is part of the cache key. Without it the scope inherits the
 * 15-minute default profile and drags the whole route's revalidate window down
 * with it — the same reasoning as `highlight()`.
 *
 * The file is listed in `outputFileTracingIncludes` so it exists in the
 * serverless bundle. The build reads it, so a missing trace would not fail the
 * build — it would fail much later, on the first revalidation, which is the
 * kind of gap worth closing at the config rather than discovering in
 * production.
 */
export async function readExplainer(): Promise<string> {
  "use cache";
  cacheLife("max");
  cacheTag(CACHE_TAGS.explainer);

  return readFile(
    join(process.cwd(), "src/content/flags-explained.md"),
    "utf8",
  );
}
