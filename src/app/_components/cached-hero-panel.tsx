import { cacheLife, cacheTag } from "next/cache";

import { ArrivalTimer } from "@/app/_components/arrival-timer";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { HERO_COPY, HERO_RENDER_MS } from "@/lib/flags/hero-copy";
import { heroCopy } from "@/lib/flags/sdk";

/**
 * The rendered variant, cached by **variant** rather than by visitor.
 *
 * This is the point of the whole project in one component. 50,000 visitors
 * across three variants should cost three renders, not 50,000 — and they do,
 * because the cache key is derived from the arguments, and the only argument
 * is the variant.
 *
 * `remote`, not plain `use cache`: this runs behind `<Suspense>` at request
 * time, and plain `use cache` is an in-memory LRU inside the server process. On
 * a single long-lived `next start` that is a cache; on serverless it is not,
 * because the instance holding the entry is gone by the next request
 * (RESEARCH.md §5.3, measured — six back-to-back requests produced six fresh
 * renders).
 *
 * **Nothing visitor-specific may go in here, and nothing enforces that.** The
 * variant is shared by design; the visitor is not. Reading the anon id, the
 * attributes or a cookie inside this scope would bake one visitor's value into
 * an entry that every other visitor in the same variant then receives. `cookies()`
 * and `headers()` are at least rejected outright — but an id passed *in* as a
 * prop is accepted silently, becomes part of the cache key, and quietly turns
 * this back into one entry per visitor. Same family of mistake as step 9's
 * exposure trap: correct-looking code, no error, wrong outcome.
 */
async function CachedHero({ variant }: { variant: string }) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.heroVariant(variant));

  // Stands in for whatever makes a real hero expensive.
  await new Promise((resolve) => setTimeout(resolve, HERO_RENDER_MS));

  const copy = HERO_COPY[variant] ?? HERO_COPY.control;
  const renderedAt = new Date().toISOString();

  return (
    <div data-testid="cached-hero">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[12px]">
        <span
          data-testid="cached-hero-variant"
          className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised"
        >
          {variant}
        </span>
        <span className="text-ink-subtle">
          rendered once at{" "}
          <span data-testid="cached-hero-rendered-at">{renderedAt}</span>
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

/**
 * Uncached wrapper: decides the variant at request time, then hands it to the
 * cached component.
 *
 * The split is the whole technique. Deciding is per-visitor and cheap — a hash
 * and a walk over rules already in memory. Rendering is per-variant and
 * expensive. Putting the decision inside the cached scope would cache the
 * decision too, and the first visitor's variant would be served to everyone.
 *
 * `heroCopy()` is the same call the experiment panel makes. The Flags SDK
 * memoises evaluations per request, so asking twice costs one evaluation.
 */
export async function CachedHeroPanel() {
  const variant = await heroCopy();

  return (
    <>
      <div className="mb-3 font-mono text-[12px]">
        <span className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised">
          <ArrivalTimer id="cached-hero" />
        </span>
      </div>
      {/* `key` so switching variant remounts rather than reconciling into the
          previous variant's markup. */}
      <CachedHero key={variant} variant={variant} />
    </>
  );
}

/** Matches the panel's shape so the card does not jump when it lands. */
export function CachedHeroSkeleton() {
  return (
    <div data-testid="cached-hero-skeleton">
      <div className="mb-3 font-mono text-[12px]">
        <span className="bg-ink/10 px-1.5 py-0.5 text-ink-subtle dark:bg-white/10">
          rendering…
        </span>
      </div>
      <div
        className="space-y-2 border-l-[3px] border-line pl-3"
        aria-hidden="true"
      >
        <div className="h-5 w-72 max-w-full bg-ink/10 dark:bg-white/10" />
        <div className="h-3 w-56 max-w-full bg-ink/10 dark:bg-white/10" />
      </div>
      <span className="sr-only">Rendering the hero variant…</span>
    </div>
  );
}
