import { Disclosure } from "@/app/_components/disclosure";
import { highlight } from "@/lib/highlight";
import { SNIPPETS } from "@/lib/snippets";

/**
 * How the `rendered @Nms` badges are measured.
 *
 * Lives on /ppr, next to the badges it describes, rather than on the index.
 *
 * Deliberately compact: this is a caveat about an instrument, not the subject
 * of the page, and it used to occupy three labelled rows above the fold before
 * a single slot had been seen. One line stays visible; everything that is only
 * needed once is behind the toggle.
 *
 * Still fully static — `highlight()` is behind `use cache` and takes a
 * constant, so this prerenders with the rest of the shell.
 */
export async function TimingExplainer() {
  const snippet = SNIPPETS.timing;
  const html = await highlight(snippet.code);

  return (
    <section data-testid="timing-explainer" className="border-y border-line">
      <p className="px-1 py-2 text-[14px] leading-relaxed text-ink-muted">
        <span className="bg-ink px-1.5 py-0.5 font-mono text-[12px] font-bold text-surface-raised">
          ~164ms
        </span>{" "}
        badges measure roughly when a panel&apos;s markup arrived, timed in the
        browser from the start of the page load — so panels can be compared
        against each other. <strong className="text-ink">Read them on a
        fresh page load</strong>, not a client navigation.
      </p>

      <Disclosure
        testId="timing-toggle"
        label="how it works, and what it is not"
        hint={snippet.file}
      >
        <dl className="max-w-4xl space-y-1.5 text-[14px] leading-relaxed">
          {(
            [
              [
                "Is not",
                <>
                  server response time, time-to-first-byte, or what a user
                  perceives as load time. Use the Performance panel for figures
                  that mean anything outside this demo.
                </>,
              ],
              [
                "Why not an effect",
                <>
                  Effects all run in the same commit once React has hydrated, so
                  every panel already on screen reports the <em>same</em> number
                  and the cached slots become indistinguishable from the static
                  ones — exactly the difference this page exists to show. An
                  inline script runs while the browser is still parsing that
                  chunk, so each panel is stamped as its own markup lands.
                </>,
              ],
              [
                "On a client nav",
                <>
                  no new document is parsed, so the script never runs again and
                  the badges fall back to the clock from when you first opened
                  the site. Reload to read them properly.
                </>,
              ],
            ] as const
          ).map(([term, detail]) => (
            <div key={term} className="flex flex-col gap-x-3 sm:flex-row">
              <dt className="w-32 shrink-0 font-mono text-[12px] uppercase tracking-wider text-ink-subtle">
                {term}
              </dt>
              <dd className="text-ink-muted">{detail}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 mb-2 font-mono text-[12px] text-ink-subtle">
          {snippet.point}
        </p>
        <div className="max-w-4xl overflow-x-auto border border-line bg-surface-sunken">
          {/* Highlighted server-side by Shiki; the input is a constant in the
              repo, never user input. */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </Disclosure>
    </section>
  );
}
