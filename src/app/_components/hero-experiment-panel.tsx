import { ArrivalTimer } from "@/app/_components/arrival-timer";
import { HERO_COPY } from "@/lib/flags/hero-copy";
import { heroCopy } from "@/lib/flags/sdk";

/**
 * An A/B/C experiment, and the two mechanisms behind it.
 *
 * The flag carries two rules and they do different jobs. A forced rule decides
 * **eligibility** — corporate visitors are excluded and always see control. The
 * experiment rule decides **which variant** an eligible visitor gets, by hashing
 * their id. Only the second is random, and only eligible visitors should ever
 * count towards a result.
 *
 * Teams conflate these constantly and then cannot explain why a "50% rollout"
 * served 38%. Switching persona is what shows the difference here: corporate
 * pins to control however the id hashes, every other persona rolls.
 *
 * **No exposure is recorded here, deliberately.** Firing one is step 9, and
 * where it may be fired is the entire subject of that step.
 */
export async function HeroExperimentPanel() {
  const variant = await heroCopy();
  const copy = HERO_COPY[variant] ?? HERO_COPY.control;

  return (
    <div data-testid="hero-experiment">
      <div className="mb-3 font-mono text-[12px]">
        <span className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised">
          <ArrivalTimer id="hero-experiment" />
        </span>
      </div>

      <div className="border-l-[3px] border-line pl-3">
        <h3
          data-testid="hero-headline"
          className="text-lg font-semibold leading-tight text-ink"
        >
          {copy.headline}
        </h3>
        <p className="mt-1 text-[14px] text-ink-muted">{copy.body}</p>
      </div>

      <p className="mt-4 flex items-baseline gap-x-2 text-[13px]">
        <span className="font-mono text-[12px] uppercase tracking-wider text-ink-subtle">
          variant
        </span>
        <span
          data-testid="hero-variant"
          className="bg-ink px-1.5 py-0.5 font-mono text-[12px] font-bold text-surface-raised"
        >
          {variant}
        </span>
      </p>
    </div>
  );
}

/** Matches the panel's shape so the card does not jump when it lands. */
export function HeroExperimentSkeleton() {
  return (
    <div data-testid="hero-experiment-skeleton">
      <div className="mb-3 font-mono text-[12px]">
        <span className="bg-ink/10 px-1.5 py-0.5 text-ink-subtle dark:bg-white/10">
          bucketing…
        </span>
      </div>
      <div className="space-y-2 border-l-[3px] border-line pl-3" aria-hidden="true">
        <div className="h-5 w-72 max-w-full bg-ink/10 dark:bg-white/10" />
        <div className="h-3 w-56 max-w-full bg-ink/10 dark:bg-white/10" />
      </div>
      <div className="mt-4" aria-hidden="true">
        <div className="h-4 w-40 max-w-full bg-ink/10 dark:bg-white/10" />
      </div>
      <span className="sr-only">Assigning a hero variant…</span>
    </div>
  );
}
