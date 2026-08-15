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
        <div className="mt-2 grid gap-x-8 gap-y-2 text-[13px] leading-relaxed text-ink-muted md:grid-cols-2 xl:grid-cols-3">
          <p>
            Each panel shows roughly when its markup arrived, measured in the
            browser from the start of the page load. They are here so the panels
            can be <strong>compared with each other</strong> — that is the whole
            job.
          </p>
          <p>
            They are <strong>not</strong> real performance numbers. Not your
            server&apos;s response time, not time-to-first-byte, and not what a
            user would perceive as load time. Treat them as an audit aid for
            this demo, and use the Performance panel or a Core Web Vitals tool
            if you need figures that mean something outside it.
          </p>
          <p className="text-ink-subtle">
            Read them on a <strong>fresh page load</strong>. After a client
            navigation no new document is parsed, so the badges fall back to a
            clock that started when you first opened the site — reload to get
            clean numbers.
          </p>
        </div>
      </div>

      <Disclosure
        testId="timing-toggle"
        label="how it works"
        hint={snippet.file}
      >
        <div className="grid gap-x-8 gap-y-3 text-[13px] leading-relaxed text-ink-muted md:grid-cols-2 xl:grid-cols-3">
          <p>
            An inline <code className="font-mono">&lt;script&gt;</code> sits
            immediately after each badge. It runs while the browser is still
            parsing that chunk of the document, so every panel is stamped as its
            own markup arrives — shell chunks at parse time, a streamed slot
            when its chunk lands.
          </p>
          <p>
            <strong className="text-ink">Why not a useEffect.</strong> Effects
            all run in the same commit once React has hydrated. Every panel
            already on screen then reports the <em>same</em> number, and the
            cached slots become indistinguishable from the static ones — which
            is exactly the difference this page exists to show. The parse-time
            reading separates them.
          </p>
          <p className="text-ink-subtle">
            It measures when markup arrived and was parsed, a hair before the
            browser paints it. Good for ranking these panels against each other;
            not an absolute figure.
          </p>
        </div>

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
