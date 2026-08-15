import { ArrivalTimer } from "@/app/_components/arrival-timer";
import { readAttributes } from "@/lib/flags/attributes";
import { getTargetedFlag } from "@/lib/flags/evaluate";

/**
 * The three hero variants.
 *
 * Keyed by the string GrowthBook returns, so an unrecognised value falls back
 * rather than rendering nothing — someone can add a fourth variation in the UI
 * before the code knows about it, and a blank hero is a worse outcome than a
 * stale one.
 */
const COPY: Record<string, { headline: string; body: string }> = {
  control: {
    headline: "Ship your side project this weekend",
    body: "Everything you need, nothing you don't.",
  },
  urgency: {
    headline: "Your competitors shipped last week",
    body: "Stop planning. Start deploying. Today.",
  },
  reassurance: {
    headline: "Take your time. We'll be here.",
    body: "No credit card, no deadline, no pressure.",
  },
};

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
 * served 38%. The panel prints which one applied, so the difference is visible
 * rather than asserted.
 *
 * **No exposure is recorded here, deliberately.** Firing one is step 8, and
 * where it may be fired is the entire subject of that step.
 */
export async function HeroExperimentPanel() {
  const { attributes } = await readAttributes();
  const hero = await getTargetedFlag("hero-copy", attributes);

  const copy = COPY[hero.value] ?? COPY.control;
  const bucketed = hero.experiment?.inExperiment === true;

  /**
   * Three cases, and getting them apart took two attempts.
   *
   * A forced rule returns **no** experiment result at all — GrowthBook stops at
   * the first matching rule, so nothing was ever hashed. Branching on "is there
   * an experiment result" therefore lumped the forced case in with "no rule
   * reached you", which is precisely the distinction this section exists to
   * draw. Branch on the reason code instead.
   */
  const mechanism = bucketed
    ? `hashing — id ${(hero.experiment?.hashValue ?? "").slice(0, 8)}… landed in variation ${hero.experiment?.variationId}`
    : hero.ruleSource === "force"
      ? `targeting — audience=${attributes.audience} matched a rule first, so nothing was hashed`
      : `neither — no experiment rule was reached (${hero.reason ?? "no reason given"})`;

  return (
    <div data-testid="hero-experiment">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[12px]">
        <span className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised">
          <ArrivalTimer id="hero-experiment" />
        </span>
        <span className="text-ink-subtle">
          {bucketed
            ? "bucketed — this visitor counts towards the result"
            : "not bucketed — excluded, and must not be counted"}
        </span>
      </div>

      {/* The variant itself. Everything else on this card is instrumentation. */}
      <div className="border-l-[3px] border-line pl-3">
        <h3
          data-testid="hero-headline"
          className="text-lg font-semibold leading-tight text-ink"
        >
          {copy.headline}
        </h3>
        <p className="mt-1 text-[14px] text-ink-muted">{copy.body}</p>
      </div>

      <dl className="mt-4 space-y-1.5 text-[13px]">
        {(
          [
            [
              "variant",
              <span
                key="v"
                data-testid="hero-variant"
                className="bg-ink px-1.5 py-0.5 font-mono text-[12px] font-bold text-surface-raised"
              >
                {hero.value}
              </span>,
            ],
            [
              "decided by",
              <span key="r" data-testid="hero-reason" className="font-mono">
                {hero.source === "fallback"
                  ? `code default — ${hero.error ?? "ruleset unreachable"}`
                  : hero.reason}
              </span>,
            ],
            [
              "mechanism",
              <span key="m" data-testid="hero-mechanism">
                {mechanism}
              </span>,
            ],
          ] as const
        ).map(([term, detail]) => (
          <div key={term} className="flex flex-col gap-x-3 sm:flex-row">
            <dt className="w-24 shrink-0 font-mono text-[12px] uppercase tracking-wider text-ink-subtle">
              {term}
            </dt>
            <dd className="text-ink-muted">{detail}</dd>
          </div>
        ))}
      </dl>
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
      <div className="mt-4 space-y-1.5" aria-hidden="true">
        <div className="h-3 w-64 max-w-full bg-ink/10 dark:bg-white/10" />
        <div className="h-3 w-72 max-w-full bg-ink/10 dark:bg-white/10" />
      </div>
      <span className="sr-only">Assigning a hero variant…</span>
    </div>
  );
}
