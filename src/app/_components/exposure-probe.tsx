"use client";

import { useState, useTransition } from "react";

import { resetExposureProbe, runExposureProbe } from "@/app/flags/actions";
import type { ExposureCounts } from "@/lib/flags/exposure";

const VISITORS = 50;

const EMPTY: ExposureCounts = {
  visitors: 0,
  inside: 0,
  outside: 0,
  byVariant: {},
};

/**
 * One side of the comparison.
 *
 * The ratio is the point, so it is the largest thing on the card. `expected`
 * says what the number *should* be, because "3" is only alarming next to the
 * 50 it was supposed to be.
 */
function Panel({
  testId,
  label,
  detail,
  count,
  visitors,
  broken,
}: {
  testId: string;
  label: string;
  detail: string;
  count: number;
  visitors: number;
  broken: boolean;
}) {
  const tone = broken
    ? "border-red-500/40 text-red-600 dark:text-red-400"
    : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400";

  return (
    <div className={`border bg-surface p-4 ${tone.split(" ")[0]}`}>
      <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        {label}
      </p>
      <p
        data-testid={testId}
        className={`mt-1 font-mono text-2xl font-bold tabular-nums ${tone
          .split(" ")
          .slice(1)
          .join(" ")}`}
      >
        {count}
        <span className="text-[15px] font-normal text-ink-subtle">
          {" / "}
          {visitors} visitors
        </span>
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
        {detail}
      </p>
    </div>
  );
}

/**
 * Fires N simulated visitors at both exposure paths and shows what each
 * recorded.
 *
 * A client component because it needs a button; the work itself is a Server
 * Action, so nothing about the measurement happens in the browser.
 */
export function ExposureProbe() {
  const [counts, setCounts] = useState<ExposureCounts>(EMPTY);
  const [pending, startTransition] = useTransition();
  const [ran, setRan] = useState(false);

  const run = () =>
    startTransition(async () => {
      setCounts(await runExposureProbe(VISITORS));
      setRan(true);
    });

  const reset = () =>
    startTransition(async () => {
      setCounts(await resetExposureProbe());
      setRan(false);
    });

  const variants = Object.entries(counts.byVariant);

  return (
    <div data-testid="exposure-probe">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          data-testid="exposure-run"
          className="min-h-11 cursor-pointer border border-line bg-surface px-3 font-mono text-[13px] text-ink hover:bg-black/[.04] disabled:cursor-wait disabled:opacity-60 dark:hover:bg-white/[.05]"
        >
          {pending ? "running…" : `run ${VISITORS} visitors`}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          data-testid="exposure-reset"
          className="min-h-11 cursor-pointer border border-line px-3 font-mono text-[13px] text-ink-subtle hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[.05]"
        >
          reset
        </button>
        {ran ? (
          <span className="font-mono text-[12px] text-ink-subtle">
            {variants.length > 0
              ? variants
                  .map(([variant, n]) => `${variant} ${n}`)
                  .sort()
                  .join(" · ")
              : null}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Panel
          testId="exposure-inside"
          label="tracked inside the cache"
          detail="Fires on the miss. Every hit skips the function body, tracking included — so this counts cache entries, not people."
          count={counts.inside}
          visitors={counts.visitors}
          broken
        />
        <Panel
          testId="exposure-outside"
          label="tracked in the wrapper"
          detail="Runs once per request, whatever the cache does. Same render, same cost, same markup."
          count={counts.outside}
          visitors={counts.visitors}
          broken={false}
        />
      </div>

      {ran ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
          Run it again without resetting and the left number stops moving
          entirely: the entries are warm, so nothing on that path executes at
          all. The right number keeps pace with the visitors, because it never
          depended on the cache.
        </p>
      ) : null}
    </div>
  );
}
