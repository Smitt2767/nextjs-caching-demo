import { ArrivalTimer } from "@/app/_components/arrival-timer";
import { readAttributes } from "@/lib/flags/attributes";
import { getTargetedFlag } from "@/lib/flags/evaluate";

/**
 * A flag whose answer depends on the visitor.
 *
 * Streams, and has to. The kill switch above it is in the static shell because
 * it asks nothing about you; this one reads `country`, which comes from a
 * cookie or a geo header, so it cannot be prerendered.
 *
 * What it does *not* do is fetch anything. The ruleset behind this evaluation
 * is the same cached, build-time entry the kill switch used — only the
 * attributes are per-request, and matching them against the rules is a walk
 * over some JSON. Personalisation costs a rule walk here, not a round trip.
 */
export async function TargetedFlagPanel() {
  const { attributes } = await readAttributes();
  const badge = await getTargetedFlag("pricing-badge", attributes);

  return (
    <div data-testid="targeted-flag">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[12px]">
        <span className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised">
          <ArrivalTimer id="targeted-flag" />
        </span>
        <span className="text-ink-subtle">
          evaluated at request time · ruleset still cached
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="font-mono text-[14px] text-ink">pricing-badge</code>
        <span
          data-testid="pricing-badge-value"
          className={`px-1.5 py-0.5 font-mono text-[12px] font-bold ${
            badge.value
              ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950"
              : "bg-red-600 text-white dark:bg-red-500 dark:text-red-950"
          }`}
        >
          {badge.value ? "ON" : "OFF"}
        </span>
        <span
          data-testid="pricing-badge-reason"
          className="font-mono text-[12px] text-ink-subtle"
        >
          {badge.source === "fallback"
            ? `code default — ${badge.error ?? "ruleset unreachable"}`
            : `country=${attributes.country} · ${badge.reason}`}
        </span>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
        {badge.value
          ? `A rule matched ${attributes.country}, so the flag is on for this visitor. Switch the persona above to a US one and it turns off.`
          : `No rule matched ${attributes.country}, so the flag falls through to its default. Switch to an India or UK persona above and it turns on.`}
      </p>
    </div>
  );
}

/** Matches the panel's shape so the card does not jump when it lands. */
export function TargetedFlagSkeleton() {
  return (
    <div data-testid="targeted-flag-skeleton">
      <div className="mb-3 font-mono text-[12px]">
        <span className="bg-ink/10 px-1.5 py-0.5 text-ink-subtle dark:bg-white/10">
          resolving country…
        </span>
      </div>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-4 w-64 max-w-full bg-ink/10 dark:bg-white/10" />
        <div className="h-3 w-80 max-w-full bg-ink/10 dark:bg-white/10" />
      </div>
      <span className="sr-only">Evaluating the targeted flag…</span>
    </div>
  );
}
