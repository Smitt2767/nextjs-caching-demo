import Link from "next/link";

/**
 * Index. Deliberately trivial and fully static: no await, no runtime reads, so
 * it prerenders whole and the <Link> below prefetches /ppr's App Shell before
 * the click. That is what makes the navigation into the demo instant.
 */
export default function Home() {
  // No background of its own: `body` paints the surface token, so setting a
  // second colour here produced a visible seam where this element ended.
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <header data-testid="home-shell">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Next.js caching demos
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-muted">
          Small, self-contained pages that show what Next.js prerenders and what
          it defers to request time.
        </p>
      </header>

      <ul className="space-y-3">
        <li>
          <Link
            href="/ppr"
            data-testid="ppr-link"
            className="block rounded-xl border-2 border-dashed border-emerald-500/60 bg-surface-raised p-5 transition-colors hover:border-emerald-500"
          >
            <span className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              /ppr
            </span>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              Partial Prerendering &amp;{" "}
              <code className="font-mono">use cache</code>
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Seven slots: what lands in the static shell, what streams in at
              request time, and the difference between caching the data,
              caching the whole component, and caching it in the browser.
            </p>
          </Link>
        </li>
      </ul>
    </main>
  );
}
