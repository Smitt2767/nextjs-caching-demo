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
      className="border border-line bg-surface-raised"
    >
      <div className="p-5">
        <h2 className="text-base font-semibold text-ink">
          About the{" "}
          <span className="bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold text-surface-raised">
            ~164ms
          </span>{" "}
          badges
        </h2>

        {/* Facts as labelled rows, not paragraphs. Each value runs the width
            of the page, so nothing is squeezed into a narrow measure and the
            whole block stays three lines tall. */}
        <dl className="mt-3 space-y-1.5 text-[13px] leading-relaxed">
          {(
            [
              [
                "Measures",
                <>
                  roughly when a panel&apos;s markup arrived, timed in the
                  browser from the start of the page load — so the panels can be
                  compared against each other.
                </>,
              ],
              [
                "Is not",
                <>
                  server response time, time-to-first-byte, or what a user
                  perceives as load time. Use the Performance panel for figures
                  that mean anything outside this demo.
                </>,
              ],
              [
                "Read on",
                <>
                  a fresh page load. A client navigation parses no new document,
                  so the badges fall back to the clock from when you first
                  opened the site.
                </>,
              ],
            ] as const
          ).map(([term, detail]) => (
            <div key={term} className="flex flex-col gap-x-3 sm:flex-row">
              <dt className="w-20 shrink-0 font-mono text-[11px] uppercase tracking-wider text-ink-subtle">
                {term}
              </dt>
              <dd className="text-ink-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Disclosure
        testId="timing-toggle"
        label="how it works"
        hint={snippet.file}
      >
        <p className="max-w-4xl text-[13px] leading-relaxed text-ink-muted">
          <strong className="text-ink">Why not a useEffect.</strong> Effects all
          run in the same commit once React has hydrated, so every panel already
          on screen reports the <em>same</em> number and the cached slots become
          indistinguishable from the static ones — exactly the difference this
          page exists to show. An inline script runs while the browser is still
          parsing that chunk, so each panel is stamped as its own markup lands.
        </p>

        <p className="mt-4 mb-2 font-mono text-[11px] text-ink-subtle">
          {snippet.point}
        </p>
        <div className="overflow-x-auto border border-line bg-surface-sunken">
          {/* Highlighted server-side by Shiki; the input is a constant in the
              repo, never user input. */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </Disclosure>
    </section>
  );
}

/**
 * The three cache directives, and which one a given piece of work wants.
 *
 * On the index rather than inside /ppr because it is the decision every demo
 * below is an instance of. Static for the same reason as the explainer above:
 * `highlight()` is cached and takes a constant.
 */
const DIRECTIVES = [
  {
    name: '"use cache"',
    rail: "bg-violet-500",
    accent: "text-violet-700 dark:text-violet-400",
    stored: "This server process's memory",
    useFor: (
      <>
        Work with <strong className="text-ink">no request-time input</strong> —
        plan tables, navigation, marketing copy. It is computed at build time,
        baked into the page and served from the edge, which makes it the
        cheapest option on this list.
      </>
    ),
    watch: (
      <>
        At <em>request</em> time on serverless it caches nothing. Entries live
        in one instance&apos;s memory and the next request may land on another.
        Confirmed on Vercel: six consecutive requests, six fresh renders.
      </>
    ),
  },
  {
    name: '"use cache: remote"',
    rail: "bg-amber-500",
    accent: "text-amber-700 dark:text-amber-400",
    stored: "A shared store every instance can reach",
    useFor: (
      <>
        Anything cached{" "}
        <strong className="text-ink">at request time</strong> — in practice,
        everything behind a <code className="font-mono">&lt;Suspense&gt;</code>{" "}
        boundary that depends on a cookie, header or search param. Still shared
        by every visitor.
      </>
    ),
    watch: (
      <>
        Costs a network round trip per lookup, plus platform fees. Entries do
        not survive a deploy — the cache key includes the build ID, so the first
        request after each release pays full price.
      </>
    ),
  },
  {
    name: '"use cache: private"',
    rail: "bg-sky-500",
    accent: "text-sky-700 dark:text-sky-400",
    stored: "The visitor's browser. Never the server.",
    useFor: (
      <>
        The one step that is genuinely{" "}
        <strong className="text-ink">per visitor</strong>, which is usually just
        reading an identifier. It is the only directive permitted to call{" "}
        <code className="font-mono">cookies()</code> inside itself.
      </>
    ),
    watch: (
      <>
        It has no server-side cache at all. Wrap something expensive in it and
        every visitor pays for it in full, every time — measured at{" "}
        <strong className="text-ink">~2031ms</strong> against{" "}
        <strong className="text-ink">~105ms</strong> for the same work moved
        one level out.
      </>
    ),
  },
] as const;

async function CacheDirectives() {
  const snippet = SNIPPETS.directives;
  const html = await highlight(snippet.code);

  return (
    <section
      data-testid="directives-explainer"
      className="border border-line bg-surface-raised"
    >
      <div className="p-5">
        <h2 className="text-base font-semibold text-ink">
          Which <code className="font-mono">use cache</code> to reach for
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Three directives, and the only thing separating them is{" "}
          <strong className="text-ink">where the answer is kept</strong>. Pick
          by asking what the work depends on, not by how slow it is.
        </p>

        <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DIRECTIVES.map((d) => (
            <article
              key={d.name}
              data-testid={`directive-${d.name.replace(/\W+/g, "-")}`}
              className="relative border border-line bg-surface p-4 pl-5"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-[3px] ${d.rail}`}
              />
              <h3
                className={`font-mono text-[12px] font-bold tracking-tight ${d.accent}`}
              >
                {d.name}
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-subtle">
                {d.stored}
              </p>

              <dl className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-subtle">
                    Use for
                  </dt>
                  <dd className="mt-0.5 text-ink-muted">{d.useFor}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-subtle">
                    Watch out
                  </dt>
                  <dd className="mt-0.5 text-ink-muted">{d.watch}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        {/* The takeaway, stated once. Both mistakes above are the intuitive
            choice, and neither produces an error. */}
        <p className="mt-4 border-l-[3px] border-line pl-3 text-[13px] leading-relaxed text-ink-muted">
          <strong className="text-ink">The rule.</strong> What is expensive
          should be shared; what is personal should be cheap. Both ways of
          getting this wrong fail silently — no error, no warning, and a local
          server reports cache hits for all three.
        </p>
      </div>

      <Disclosure
        testId="directives-toggle"
        label="all three, side by side"
        hint={snippet.file}
      >
        <p className="mt-1 mb-2 font-mono text-[11px] text-ink-subtle">
          {snippet.point}
        </p>
        <div className="overflow-x-auto border border-line bg-surface-sunken">
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
    <main className="flex w-full flex-1 flex-col gap-6 px-4 py-5">
      <header data-testid="home-shell">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Next.js caching demos
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-muted">
          Small, self-contained pages that show what Next.js prerenders and what
          it defers to request time.
        </p>
      </header>

      {/* Preamble: applies to every demo below, so it sits above the list —
          which grows downward as demos are added. */}
      <TimingExplainer />
      <CacheDirectives />

      <section aria-labelledby="demos-heading">
        <h2
          id="demos-heading"
          className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle"
        >
          Demos
        </h2>

        <ul className="mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          <li>
            <Link
              href="/ppr"
              data-testid="ppr-link"
              className="relative block border border-line bg-surface-raised p-5 pl-6 hover:border-ink-subtle"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px] bg-emerald-500"
              />
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
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
        <ul className="mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          <li>
            <Link
              href="/invalidate"
              data-testid="invalidate-link"
              className="relative block border border-line bg-surface-raised p-5 pl-6 hover:border-ink-subtle"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px] bg-ink-subtle"
              />
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
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
