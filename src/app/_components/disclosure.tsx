"use client";

import { useId, useState } from "react";

/** Inline SVG rather than a text glyph or emoji, so it inherits colour and
 *  scales with the type. No icon-set match was available, so this is a
 *  hand-written chevron in the Lucide idiom. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * Generic show/hide row, used for both the "what this shows" notes and the
 * code excerpts so they look and behave identically.
 *
 * The body is always in the DOM — `hidden` toggles it rather than mounting it —
 * so everything inside ships in the static HTML and opening a panel fetches
 * nothing. That is what makes the wrapper reviewable in the network tab.
 */
export function Disclosure({
  testId,
  label,
  hint,
  defaultOpen = false,
  children,
}: {
  testId: string;
  label: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={testId}
        // min-h-11 == 44px, the minimum comfortable touch target.
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-4 text-left font-mono text-[12px] text-ink-subtle hover:bg-black/[.04] hover:text-ink dark:hover:bg-white/[.05]"
      >
        <Chevron open={open} />
        {/* The label never wraps; the file path takes the truncation instead,
            so a long path can't break the control onto two lines. */}
        <span className="shrink-0 whitespace-nowrap font-medium">{label}</span>
        {hint ? (
          <span className="min-w-0 truncate opacity-70" title={hint}>
            {hint}
          </span>
        ) : null}
      </button>
      <div id={panelId} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </div>
  );
}
