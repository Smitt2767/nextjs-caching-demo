import { cacheLife, cacheTag } from "next/cache";

import { ArrivalTimer } from "@/app/_components/arrival-timer";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { HERO_COPY, HERO_RENDER_MS } from "@/lib/flags/hero-copy";

/**
 * The same hero as step 8, rendered with no `<Suspense>` around it.
 *
 * That omission is the point. On `/flags` this component needs a boundary —
 * 600ms is 600ms of blank card, and the variant is not known until the request
 * arrives. Here the variant arrives as a prop, decided in `proxy.ts` before
 * this render existed, so there is nothing to wait for and nothing to stream.
 *
 * ## Why it still carries a cache directive
 *
 * The first version of this component had none, on the reasoning that a cache
 * inside a prerendered page is a cache around something already static. That
 * reasoning was wrong, and the build said so:
 *
 *     Route "/precomputed/[code]": Next.js encountered uncached or runtime
 *     data during prerendering.
 *
 * pointing at the `setTimeout` below. A prerender will not accept an *uncached
 * asynchronous gap* — it does not matter that a timer reads no cookie, no
 * header and no network; what matters is that the render did not complete
 * without waiting on something the prerender cannot resolve. Expensive work in
 * a prerendered page has to be declared cacheable, not merely be deterministic.
 *
 * Once it is declared, the directive also does real work for codes that were
 * *not* prebuilt. `dynamicParams` is left on, so an unknown-but-valid code
 * renders on demand — and that render is a real 600ms on a real request.
 * `remote` rather than plain `use cache` for the reason step 8 measured: plain
 * `use cache` is per-process memory, which is a cache on `next start` and
 * nothing at all on serverless (RESEARCH.md §5.3).
 */
export async function PrecomputedHero({ variant }: { variant: string }) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.heroVariant(variant));

  // Stands in for whatever makes a real hero expensive. For the twelve prebuilt
  // codes this is paid twelve times, by the build, and never again.
  await new Promise((resolve) => setTimeout(resolve, HERO_RENDER_MS));

  const copy = HERO_COPY[variant] ?? HERO_COPY.control;

  return (
    <div data-testid="precomputed-hero">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[12px]">
        <span
          data-testid="precomputed-hero-variant"
          className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised"
        >
          {variant}
        </span>
        {/* Reads ~0ms here and hundreds of ms on /flags. Same hero, same cost
            to produce, different moment at which it was produced. */}
        <span className="text-ink-subtle">
          in the first HTML · <ArrivalTimer id="precomputed-hero" />
        </span>
      </div>

      <div className="border-l-[3px] border-line pl-3">
        <h3 className="text-lg font-semibold leading-tight text-ink">
          {copy.headline}
        </h3>
        <p className="mt-1 text-[14px] text-ink-muted">{copy.body}</p>
      </div>
    </div>
  );
}
