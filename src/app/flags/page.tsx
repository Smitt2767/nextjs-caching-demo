import { Suspense } from "react";

import {
  AttributesPanel,
  AttributesSkeleton,
} from "@/app/_components/attributes-panel";
import { PersonaSwitcher } from "@/app/_components/persona-switcher";
import { AUDIENCES } from "@/lib/personas";

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

      <section className="mt-7 max-w-4xl" aria-labelledby="attributes-heading">
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
    </main>
  );
}
