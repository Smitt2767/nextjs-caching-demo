import { Disclosure } from "@/app/_components/disclosure";

/**
 * The static wrapper around every panel on /flags.
 *
 * Same shape as `SlotCard` on /ppr and for the same reason: everything here —
 * frame, step chip, title, summary, the disclosure and all of its contents — is
 * free of request-time data, so it prerenders into the document. Only
 * `children` streams, and only where the caller wraps it in `<Suspense>`.
 *
 * The long explanation goes behind the toggle rather than under the panel. A
 * page that explains five caching strategies accumulates a great deal of prose,
 * and prose between two panels is prose nobody compares them through.
 */
export function FlagCard({
  step,
  title,
  summary,
  action,
  description,
  testId,
  className = "",
  children,
}: {
  /** e.g. "Step 3 · a flag with no targeting" — the chip above the title. */
  step: string;
  title: string;
  /** One line, always visible — the claim the card is making. */
  summary: React.ReactNode;
  /**
   * Optional control, placed to the right of the heading.
   *
   * For a card whose panel is driven by something — the persona switcher — so
   * the control sits in the space the heading leaves rather than on a line of
   * its own. Must be free of request-time data like the rest of the header.
   */
  action?: React.ReactNode;
  /** The longer explanation, behind a toggle. */
  description: React.ReactNode;
  testId: string;
  /** Grid placement, for cards whose content needs more than one column. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className={`flex flex-col overflow-hidden border border-line bg-surface-raised ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
            {step}
          </p>
          <h2 className="mt-1.5 text-[16px] font-semibold leading-tight text-ink">
            {title}
          </h2>
          <p className="mt-1 text-[14px] leading-snug text-ink-muted">
            {summary}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      {/* The only region that may stream. */}
      <div className="flex-1 px-4 pb-4">{children}</div>

      <Disclosure testId={`about-${testId}`} label="what this shows">
        <div className="space-y-2 text-[14px] leading-relaxed text-ink-muted">
          {description}
        </div>
      </Disclosure>
    </section>
  );
}
