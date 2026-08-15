import Link from "next/link";
import { Suspense } from "react";

import {
  AttributesPanel,
  AttributesSkeleton,
} from "@/app/_components/attributes-panel";
import { PersonaSwitcher } from "@/app/_components/persona-switcher";
import {
  TargetedFlagPanel,
  TargetedFlagSkeleton,
} from "@/app/_components/targeted-flag-panel";
import { getFlag } from "@/lib/flags/evaluate";
import { AUDIENCES } from "@/lib/personas";

/**
 * A flag with no targeting rules, read at build time.
 *
 * No <Suspense> around this, and none needed: `getRuleset()` takes no
 * request-time input, so the fetch resolves during the prerender and the answer
 * is baked into the HTML document. View source and the value is already there.
 *
 * That is the whole claim of step 3 — a flag does not have to cost anything at
 * request time. This one costs nothing at all.
 */
async function KillSwitch() {
  const flag = await getFlag("catalog-kill-switch");

  return (
    <div
      data-testid="kill-switch"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <code className="font-mono text-[14px] text-ink">catalog-kill-switch</code>
      <span
        data-testid="kill-switch-value"
        className={`px-1.5 py-0.5 font-mono text-[12px] font-bold ${
          flag.value
            ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950"
            : "bg-red-600 text-white dark:bg-red-500 dark:text-red-950"
        }`}
      >
        {flag.value ? "ON" : "OFF"}
      </span>
      <span
        data-testid="kill-switch-source"
        className="font-mono text-[12px] text-ink-subtle"
      >
        {flag.source === "fallback"
          ? `code default — ${flag.error ?? "ruleset unreachable"}`
          : `${flag.source} · read once at build in ${flag.fetchMs}ms`}
      </span>
    </div>
  );
}

export const metadata = {
  title: "Feature flags",
  description: "Feature flags and experiments under Cache Components.",
};

export default function FlagsPage() {
  return (
    <main className="w-full flex-1 px-4 py-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Feature flags &amp; experiments
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-muted">
          A flag decision is a pure function of a ruleset — the same bytes for
          every visitor on Earth — and a handful of request-time attributes. The
          attributes are dynamic. The decision is not the visitor, and many
          visitors share one. That distinction is what keeps a page with
          experiments on it cacheable.
        </p>
        <p className="mt-2 font-mono text-[13px] text-ink-subtle">
          built one step at a time · see FLAGS-PLAN.md
        </p>
      </header>

      <section
        className="mt-7 max-w-4xl"
        aria-labelledby="attributes-heading"
        data-testid="attributes-section"
      >
        <div className="max-w-3xl">
          <p
            id="attributes-heading"
            className="font-mono text-[12px] font-medium uppercase tracking-wider text-ink-subtle"
          >
            Steps 1–2 · attributes
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink">
            Everything a flag is allowed to depend on
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
            All four are request-time and none can be known at build. The
            bucketing id is minted in{" "}
            <code className="font-mono">proxy.ts</code>, because a Server
            Component cannot set a cookie during render.
          </p>
        </div>

        {/* In the static shell: a control should exist before the thing it
            controls, not after it. */}
        <div className="mt-4">
          <PersonaSwitcher />
        </div>

        <div className="mt-4 border border-line bg-surface-raised p-4">
          <Suspense fallback={<AttributesSkeleton />}>
            <AttributesPanel />
          </Suspense>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          The persona pins all four at once. Clear it and they come back from the
          request itself — your real User-Agent, your geo header, the server
          clock. To see a campaign captured, load{" "}
          <code className="font-mono">/flags?utm_campaign={AUDIENCES[0]}</code>{" "}
          and then navigate away and back: the audience persists, because a UTM
          parameter exists only on the landing request and an experiment that
          outlives it would silently reclassify the visitor.
        </p>
      </section>

      <section className="mt-9 max-w-4xl" aria-labelledby="killswitch-heading">
        <div className="max-w-3xl">
          <p
            id="killswitch-heading"
            className="font-mono text-[12px] font-medium uppercase tracking-wider text-ink-subtle"
          >
            Step 3 · a flag with no targeting
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink">
            The cheapest kind of flag costs nothing
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
            This one has no rules, so the answer is the same for every visitor.
            That makes it ordinary cacheable content: the ruleset is fetched
            inside <code className="font-mono">use cache</code>, resolves during
            the prerender, and the value is baked into the HTML document. There
            is no <code className="font-mono">&lt;Suspense&gt;</code> boundary
            here because nothing has to wait.
          </p>
        </div>

        <div className="mt-4 border border-line bg-surface-raised p-4">
          <KillSwitch />
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          View source rather than the element inspector: the value is in the
          HTML the server sent, not something the browser fetched.
        </p>

        <p className="mt-3 border-l-[3px] border-amber-500 bg-surface-raised py-2 pr-3 pl-3 text-[14px] leading-relaxed text-ink-muted">
          <strong className="text-ink">
            Changed this flag in GrowthBook and the page still shows the old
            value?
          </strong>{" "}
          That is the cache doing its job, not a bug. The ruleset is cached for
          hours like any other content. Expire it on{" "}
          <Link
            href="/invalidate"
            className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            /invalidate
          </Link>{" "}
          — the <code className="font-mono">growthbook-payload</code> button —
          and the next request re-reads it.
        </p>

        <p className="mt-2 text-[14px] leading-relaxed text-ink-subtle">
          In production a webhook would press that button for you, and{" "}
          <code className="font-mono">/api/growthbook-webhook</code> is built and
          tested for it. GrowthBook&apos;s free plan allows one SDK webhook per
          organisation and Vercel&apos;s Edge Config sync already holds it, so
          here the button is the mechanism.
        </p>
      </section>

      <section
        className="mt-9 max-w-4xl"
        aria-labelledby="targeting-heading"
        data-testid="targeting-section"
      >
        <div className="max-w-3xl">
          <p
            id="targeting-heading"
            className="font-mono text-[12px] font-medium uppercase tracking-wider text-ink-subtle"
          >
            Step 5 · targeting
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink">
            The first flag that asks who you are
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
            <code className="font-mono">pricing-badge</code> is forced on for
            India and the UK and off everywhere else. Because it reads{" "}
            <code className="font-mono">country</code>, it cannot be
            prerendered — so unlike the kill switch above, this one streams.
          </p>
        </div>

        <div className="mt-4 border border-line bg-surface-raised p-4">
          <Suspense fallback={<TargetedFlagSkeleton />}>
            <TargetedFlagPanel />
          </Suspense>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          The important part is what did <em>not</em> become request-time. The
          ruleset behind this evaluation is the same cached entry the kill switch
          used — read once at build. Only the attributes are per-request, and
          matching them against the rules is a walk over some JSON. Personalising
          a flag costs a rule walk, not a round trip, which is why a page full of
          targeted flags can still be mostly static.
        </p>
      </section>
    </main>
  );
}
