import { Disclosure } from "@/app/_components/disclosure";
import { highlight } from "@/lib/highlight";
import { SNIPPETS, type SnippetId } from "@/lib/snippets";

export type SlotVariant =
  "static" | "uncached" | "data-cached" | "component" | "private";

/**
 * Colour encodes the caching strategy — but it is never the only cue: every
 * card also carries the strategy as a text label, so the meaning survives
 * greyscale and colour-blindness.
 */
const VARIANTS = {
  static: {
    label: "STATIC",
    edge: "border-emerald-500/35",
    chip: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
    rail: "bg-emerald-500",
  },
  uncached: {
    label: "UNCACHED",
    edge: "border-red-500/35",
    chip: "bg-red-600 text-white dark:bg-red-500 dark:text-red-950",
    rail: "bg-red-500",
  },
  "data-cached": {
    label: "DATA CACHED",
    edge: "border-amber-500/35",
    chip: "bg-amber-600 text-white dark:bg-amber-500 dark:text-amber-950",
    rail: "bg-amber-500",
  },
  component: {
    label: "COMPONENT CACHED",
    edge: "border-violet-500/35",
    chip: "bg-violet-600 text-white dark:bg-violet-500 dark:text-violet-950",
    rail: "bg-violet-500",
  },
  private: {
    label: "PRIVATE · BROWSER",
    edge: "border-sky-500/35",
    chip: "bg-sky-600 text-white dark:bg-sky-500 dark:text-sky-950",
    rail: "bg-sky-500",
  },
} satisfies Record<
  SlotVariant,
  { label: string; edge: string; chip: string; rail: string }
>;

/**
 * The static wrapper around every slot.
 *
 * Everything this renders — frame, chip, title, summary, both disclosures and
 * all their contents — is free of request-time data, so it prerenders into the
 * document. Only `children` streams, and only when the caller passes a
 * `<Suspense>` boundary.
 *
 * That separation is the point: open the network tab, read the HTML response
 * for /ppr, and every wrapper is already there in full. The wrapper is never
 * inside the boundary it describes.
 */
export async function SlotCard({
  variant,
  title,
  summary,
  description,
  snippetId,
  children,
}: {
  variant: SlotVariant;
  title: string;
  /** One line, always visible — the claim the card is making. */
  summary: string;
  /** The longer explanation, behind a toggle. */
  description: React.ReactNode;
  snippetId: SnippetId;
  children: React.ReactNode;
}) {
  const styles = VARIANTS[variant];
  const snippet = SNIPPETS[snippetId];
  const html = await highlight(snippet.code);

  return (
    <section
      data-testid={`card-${snippetId}`}
      data-variant={variant}
      aria-label={title}
      className={`relative flex flex-col overflow-hidden border bg-surface-raised ${styles.edge}`}
    >
      {/* Solid bar down the left edge instead of a dashed frame: the strategy
          stays scannable without decorating every side of the card. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${styles.rail}`}
      />

      <header className="p-4 pl-5">
        <div className="min-w-0 flex-1">
          <span
            className={`inline-block px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider ${styles.chip}`}
          >
            {styles.label}
          </span>
          <h3 className="mt-2 text-[16px] font-semibold leading-tight text-ink">
            {title}
          </h3>
          <p className="mt-1 text-[14px] leading-snug text-ink-muted">
            {summary}
          </p>
        </div>
      </header>

      {/* The only dynamic region. Everything above and below is prerendered. */}
      <div className="flex-1 px-4 pb-4 pl-5">{children}</div>

      <div>
        <Disclosure
          testId={`about-toggle-${snippetId}`}
          label="what this shows"
        >
          <div className="space-y-2 text-[14px] leading-relaxed text-ink-muted">
            {description}
          </div>
        </Disclosure>
        <Disclosure
          testId={`code-toggle-${snippetId}`}
          label="show code"
          hint={snippet.file}
        >
          <p className="mb-2 font-mono text-[12px] text-ink-subtle">
            {snippet.point}
          </p>
          <div className="overflow-x-auto border border-line bg-surface-sunken">
            {/* Highlighted server-side by Shiki; the input is a constant in
                the repo, never user input. */}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </Disclosure>
      </div>
    </section>
  );
}
