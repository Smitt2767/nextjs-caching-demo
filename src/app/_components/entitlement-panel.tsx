import { cacheLife } from "next/cache";

import { ArrivalTimer } from "@/app/_components/arrival-timer";
import { readAttributes } from "@/lib/flags/attributes";
import { betaEntitlement } from "@/lib/flags/sdk";

/**
 * The one flag on this page whose answer cannot be shared with anybody.
 *
 * Every other flag here is safe in a shared cache because many visitors give
 * the same answer: the kill switch is the same for everyone, and the experiment
 * has three outcomes that thousands of people share. An entitlement is not like
 * that. It is forced on for a list of individual ids, so the answer is a fact
 * about *you* — and a shared cache entry holding it would hand your access to
 * whoever landed on that entry next.
 *
 * `use cache: private` is the only correct home for it: it is stored in **your
 * browser** rather than on the server, so there is no shared entry for it to
 * leak into.
 *
 * ## Why the evaluation is out here and not in the private scope
 *
 * The obvious shape is to put everything inside one `use cache: private` — it
 * is the only scope allowed to read `cookies()`, so it can do the whole job.
 * That shape builds, runs, and passes every local test. It is still wrong.
 *
 * `betaEntitlement()` reaches `getRuleset()`, which is a `use cache` scope, so
 * awaiting it inside a private one is **genuine nesting** — the thing
 * RESEARCH.md §5.3a predicts will fail. It survives locally and does not
 * survive deployment, which is the §5.3 trap in its purest form: local success
 * proving nothing at all.
 *
 * So the split follows §5.3a's rule. Read and evaluate out here, where nothing
 * is nested inside anything; hand the finished answer to a private scope that
 * only renders. Both halves are cheap — the evaluation is a hash and a walk
 * over rules already in memory — and neither touches a shared cache.
 */
export async function EntitlementPanel() {
  const { attributes } = await readAttributes();
  const entitled = await betaEntitlement();

  // Returned, not awaited into a cached scope above it.
  return <EntitlementBody entitled={entitled} visitorId={attributes.id} />;
}

/**
 * The per-person answer, cached in the visitor's own browser.
 *
 * Both props are facts about one person, and they form the cache key — which is
 * safe **only** because this cache is private. The same key in a `use cache` or
 * `use cache: remote` scope would be a leak: one visitor's entitlement served
 * to whoever landed on that entry next.
 *
 * Nothing in a private scope is ever shared, so everything it holds is paid for
 * by every visitor. Keeping it to a boolean and an id is the point.
 */
async function EntitlementBody({
  entitled,
  visitorId,
}: {
  entitled: boolean;
  visitorId: string;
}) {
  "use cache: private";
  cacheLife({ stale: 300 });

  return (
    <div data-testid="entitlement">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[12px]">
        <span className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised">
          <ArrivalTimer id="entitlement" />
        </span>
        <span className="text-ink-subtle">
          cached in your browser · never on the server
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="font-mono text-[14px] text-ink">beta-entitlement</code>
        <span
          data-testid="entitlement-value"
          className={`px-1.5 py-0.5 font-mono text-[12px] font-bold ${
            entitled
              ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950"
              : "bg-red-600 text-white dark:bg-red-500 dark:text-red-950"
          }`}
        >
          {entitled ? "GRANTED" : "NOT GRANTED"}
        </span>
      </div>

      {/* The id is the whole input. Shown so it can be pasted into GrowthBook's
          forced-value list, which is how this flag is turned on for a person. */}
      <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
        Decided by your id alone:{" "}
        <code
          data-testid="entitlement-id"
          className="font-mono text-[12px] text-ink"
        >
          {visitorId}
        </code>
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        {entitled
          ? "Your id is on the list in GrowthBook. Open an incognito window and this turns off — a different id, a different answer, and no shared entry between them."
          : "Paste that id into the forced-value list on beta-entitlement in GrowthBook, invalidate the ruleset, and this turns on for you and nobody else."}
      </p>
    </div>
  );
}

/** Matches the panel's shape so the card does not jump when it lands. */
export function EntitlementSkeleton() {
  return (
    <div data-testid="entitlement-skeleton">
      <div className="mb-3 font-mono text-[12px]">
        <span className="bg-ink/10 px-1.5 py-0.5 text-ink-subtle dark:bg-white/10">
          checking entitlement…
        </span>
      </div>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-4 w-56 max-w-full bg-ink/10 dark:bg-white/10" />
        <div className="h-3 w-72 max-w-full bg-ink/10 dark:bg-white/10" />
      </div>
      <span className="sr-only">Checking your beta entitlement…</span>
    </div>
  );
}
