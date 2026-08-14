import Link from "next/link";

import { Disclosure } from "@/app/_components/disclosure";
import { highlight } from "@/lib/highlight";
import { SNIPPETS } from "@/lib/snippets";

/**
 * How the `rendered @Nms` badges are measured.
 *
 * Lives on the index because it applies to every demo, and because the
 * measurement technique is the part people ask about first. Still fully
 * static: `highlight()` is behind `use cache` and takes a constant, so this
 * prerenders with the rest of the page.
 */
async function TimingExplainer() {
  const snippet = SNIPPETS.timing;
  const html = await highlight(snippet.code);

  return (
    <section
      data-testid="timing-explainer"
      className="overflow-hidden rounded-xl border border-line bg-surface-raised"
    >
      <div className="p-5">
        <h2 className="text-base font-semibold text-ink">
          How the{" "}
          <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold text-surface-raised">
            rendered @164ms
          </span>{" "}
          badges are measured
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Each badge reports one thing: how many milliseconds after the page
          started loading that panel actually reached the screen. One number,
          one meaning, so panels are directly comparable.
        </p>
      </div>

      <Disclosure
        testId="timing-toggle"
        label="how it works"
        hint={snippet.file}
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-muted">
          <p>
            The reading is taken by an inline{" "}
            <code className="font-mono">&lt;script&gt;</code> sitting directly
            after each badge. It runs while the browser is still parsing that
            chunk of the document — before React has loaded — and writes{" "}
            <code className="font-mono">performance.now()</code> straight into
            the DOM.
          </p>
          <p>
            <strong className="text-ink">Why not an effect or a ref.</strong>{" "}
            Both report when <em>React committed</em> the node, and React does
            not finish hydrating a streamed page until its slowest slot arrives.
            On the demo page that meant the static shell — the fastest thing
            there — reported ~2s, slower than everything it was supposed to
            beat. Parse-time stamping reports what the user actually saw: around
            100ms for the shell, ~2100ms for an uncached slot.
          </p>
          <p>
            A ref callback still handles the second case: client-side
            re-renders, like switching country or navigating back. Scripts React
            creates on the client never execute, and by then hydration is done,
            so commit time is the correct reading there.{" "}
            <code className="font-mono">data-rendered-at</code> keeps whichever
            fires first from being overwritten.
          </p>
          <p className="text-ink-subtle">
            Caveat worth knowing: this measures when the markup arrived and was
            parsed, which is a hair before the browser paints it. It is a
            comparison between panels, not a substitute for a Core Web Vitals
            measurement.
          </p>
        </div>

        <p className="mt-4 mb-2 font-mono text-[11px] text-ink-subtle">
          {snippet.point}
        </p>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface-sunken">
          {/* Highlighted server-side by Shiki; the input is a constant in the
              repo, never user input. */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </Disclosure>
    </section>
  );
}

/**
 * Index. Fully static: no runtime reads, so it prerenders whole and the
 * <Link> below prefetches /ppr's App Shell before the click. That is what
 * makes the navigation into the demo instant.
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

      {/* Preamble: applies to every demo below, so it sits above the list —
          which grows downward as demos are added. */}
      <TimingExplainer />

      <section aria-labelledby="demos-heading">
        <h2
          id="demos-heading"
          className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle"
        >
          Demos
        </h2>

        <ul className="mt-3 space-y-3">
          <li>
            <Link
              href="/ppr"
              data-testid="ppr-link"
              className="block rounded-xl border-2 border-dashed border-emerald-500/60 bg-surface-raised p-5 transition-colors hover:border-emerald-500"
            >
              <span className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                /ppr
              </span>
              <h3 className="mt-1 text-xl font-semibold text-ink">
                Partial Prerendering &amp;{" "}
                <code className="font-mono">use cache</code>
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                Seven slots: what lands in the static shell, what streams in at
                request time, and the difference between caching the data,
                caching the whole component, and caching it in the browser.
              </p>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="tools-heading">
        <h2
          id="tools-heading"
          className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle"
        >
          Tools
        </h2>
        <ul className="mt-3 space-y-3">
          <li>
            <Link
              href="/invalidate"
              data-testid="invalidate-link"
              className="block rounded-xl border border-line bg-surface-raised p-5 transition-colors hover:border-ink-subtle"
            >
              <span className="font-mono text-[11px] font-bold text-ink-subtle">
                /invalidate
              </span>
              <h3 className="mt-1 text-xl font-semibold text-ink">
                Invalidate caches
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                Expire a single entry with{" "}
                <code className="font-mono">updateTag</code>, or the whole route
                with <code className="font-mono">revalidatePath</code>, then
                watch which panels pay for their work again.
              </p>
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
