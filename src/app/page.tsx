import Link from "next/link";

/**
 * Index. Fully static: no runtime reads, so it prerenders whole and the
 * <Link>s below prefetch each destination's App Shell before the click. That
 * is what makes the navigation into a demo instant.
 *
 * Deliberately just a menu. Explanation that belongs to one page now lives on
 * that page — the badge caveat with the badges on /ppr, the directive
 * reference on /cache-api — so nothing has to be scrolled past to reach the
 * thing it describes.
 *
 * Laid out as full-width rows rather than a card grid. With four entries a
 * four-column grid either leaves a dead half-page below it or, if stretched,
 * four tall empty columns. Rows use the width instead of the height, stay
 * legible at any count, and leave room for a line of metadata per entry.
 */

// Reference first: it is the page that makes the other three legible.
const PAGES = [
  {
    href: "/cache-api",
    testId: "cache-api-link",
    rail: "bg-violet-500",
    accent: "text-violet-700 dark:text-violet-400",
    title: "The cache API",
    body: "Reference, one card each: the three directives, cacheLife and its seven profiles, cacheTag, and the three ways to throw an entry away.",
    meta: "3 directives · cacheLife · cacheTag · 3 invalidators",
  },
  {
    href: "/ppr",
    testId: "ppr-link",
    rail: "bg-emerald-500",
    accent: "text-emerald-700 dark:text-emerald-400",
    title: "Partial Prerendering & use cache",
    body: "Eight slots: what lands in the static shell, what streams in at request time, and the difference between caching the data, caching the whole component, and caching it in the browser.",
    meta: "8 slots · static shell vs streamed · measured on Vercel",
  },
  {
    href: "/invalidate",
    testId: "invalidate-link",
    rail: "bg-ink-subtle",
    accent: "text-ink-subtle",
    title: "Invalidate caches",
    body: "Expire a single entry by tag, or the whole route, then watch which panels pay for their work again.",
    meta: "updateTag · revalidateTag · revalidatePath",
  },
  {
    href: "/flags",
    testId: "flags-link",
    rail: "bg-amber-500",
    accent: "text-amber-700 dark:text-amber-400",
    title: "Feature flags & experiments",
    body: "Where a flag decision may be read, and where its exposure event must fire. Built one step at a time — see FLAGS-PLAN.md.",
    meta: "12 steps · targeting · experiments · exposure events",
  },
  {
    href: "/precomputed",
    testId: "precomputed-link",
    rail: "bg-sky-500",
    accent: "text-sky-700 dark:text-sky-400",
    title: "Precomputed variants",
    body: "The same flags as /flags, decided in proxy before the render and served from one of twelve prebuilt pages. The hero arrives in the first HTML instead of streaming in.",
    meta: "12 pages, not 180 · one per decision, not per visitor",
  },
  {
    href: "/flags-explained",
    testId: "flags-explained-link",
    rail: "bg-ink",
    accent: "text-ink",
    title: "How flags work",
    body: "The four kinds of feature flag — fixed, targeted, experiment, per-person — in plain English, using the real live configuration. Start here if flags are new to you.",
    meta: "no prior knowledge assumed · the only page here with no flags on it",
  },
] as const;

export default function Home() {
  // No background of its own: `body` paints the surface token, so setting a
  // second colour here produced a visible seam where this element ended.
  return (
    <main className="flex w-full flex-1 flex-col gap-5 px-4 py-5">
      <header data-testid="home-shell">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Next.js caching demos
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-muted">
          Small, self-contained pages that show what Next.js prerenders and what
          it defers to request time.
        </p>
      </header>

      {/* Rows size to their content. Stretching them to fill the viewport just
          padded four entries out into empty columns. */}
      <ul className="grid grid-cols-1 gap-3">
        {PAGES.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              data-testid={page.testId}
              className="group relative flex items-center border border-line bg-surface-raised py-4 pr-5 pl-6 hover:border-ink-subtle hover:bg-surface-sunken"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-[3px] ${page.rail}`}
              />

              <div className="grid w-full grid-cols-1 items-center gap-x-6 gap-y-2 lg:grid-cols-[11rem_minmax(0,1fr)_auto]">
                <span
                  className={`font-mono text-[13px] font-bold tracking-wider ${page.accent}`}
                >
                  {page.href}
                </span>

                <div className="min-w-0">
                  <h2 className="text-xl font-semibold leading-tight text-ink">
                    {page.title}
                  </h2>
                  <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-ink-muted">
                    {page.body}
                  </p>
                  <p className="mt-1.5 font-mono text-[12px] text-ink-subtle">
                    {page.meta}
                  </p>
                </div>

                <span className="font-mono text-[13px] text-ink-subtle group-hover:text-ink">
                  open →
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
