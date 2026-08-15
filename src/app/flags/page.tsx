import Link from "next/link";
import { Suspense } from "react";

import {
  AttributesPanel,
  AttributesSkeleton,
} from "@/app/_components/attributes-panel";
import {
  CachedHeroPanel,
  CachedHeroSkeleton,
} from "@/app/_components/cached-hero-panel";
import {
  HeroExperimentPanel,
  HeroExperimentSkeleton,
} from "@/app/_components/hero-experiment-panel";
import {
  EntitlementPanel,
  EntitlementSkeleton,
} from "@/app/_components/entitlement-panel";
import { ExposureProbe } from "@/app/_components/exposure-probe";
import { FlagCard } from "@/app/_components/flag-card";
import { PersonaSwitcher } from "@/app/_components/persona-switcher";
import {
  TargetedFlagPanel,
  TargetedFlagSkeleton,
} from "@/app/_components/targeted-flag-panel";
import { getCatalogKillSwitch } from "@/lib/flags/sdk";
import { AUDIENCES } from "@/lib/personas";

/**
 * A flag with no targeting rules, read at build time — through the Flags SDK.
 *
 * No <Suspense> around this, and none needed. Two things have to be true for
 * that to work, and both are in `sdk.ts`: `getRuleset()` takes no request-time
 * input so the fetch resolves during the prerender, and the flag is read with
 * `readStatic`, which hands `flag()` a request and so avoids the `headers()`
 * call every ordinary invocation makes.
 *
 * That is the whole claim of step 3 — a flag does not have to cost anything at
 * request time. This one costs nothing at all, and it is a real SDK flag:
 * declared once, listed by the discovery endpoint, precomputable at step 12.
 */
async function KillSwitch() {
  const value = await getCatalogKillSwitch();

  return (
    <div
      data-testid="kill-switch"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <code className="font-mono text-[14px] text-ink">catalog-kill-switch</code>
      <span
        data-testid="kill-switch-value"
        className={`px-1.5 py-0.5 font-mono text-[12px] font-bold ${
          value
            ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950"
            : "bg-red-600 text-white dark:bg-red-500 dark:text-red-950"
        }`}
      >
        {value ? "ON" : "OFF"}
      </span>
      <span className="font-mono text-[12px] text-ink-subtle">
        read once at build
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
      <header className="border-b border-line pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Feature flags &amp; experiments
        </h1>
        {/* The intro keeps a measure even though the cards below do not: a line
            of text 1800px wide is unreadable however much room there is. */}
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

      {/* Attributes spans the row; the four step cards sit two-by-two beneath.
          `items-start` so a short card does not stretch to match a tall one. */}
      <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
        {/* Full width: its rows are the widest content on the page, and in a
            single column every attribute wraps onto three lines — which is what
            made the first pass at this layout mostly empty space. It is also
            the control the other four cards respond to, so it reads as a
            header rather than as one panel among five. */}
        <FlagCard
          className="md:col-span-2"
          testId="attributes-section"
          step="Steps 1–2 · attributes"
          title="Everything a flag is allowed to depend on"
          summary="All four are request-time. None can be known at build."
          action={<PersonaSwitcher />}
          description={
            <>
              <p>
                The bucketing id is minted in{" "}
                <code className="font-mono">proxy.ts</code>, because a Server
                Component cannot set a cookie during render.
              </p>
              <p>
                The persona pins all four at once. Clear it and they come back
                from the request itself — your real User-Agent, your geo header,
                the server clock.
              </p>
              <p>
                To see a campaign captured, load{" "}
                <code className="font-mono">
                  /flags?utm_campaign={AUDIENCES[0]}
                </code>{" "}
                and then navigate away and back: the audience persists, because a
                UTM parameter exists only on the landing request and an
                experiment that outlived it would silently reclassify the
                visitor.
              </p>
            </>
          }
        >
          {/* The switcher is in this card's header, and both are in the static
              shell: a control should exist before the thing it controls. */}
          <div className="border border-line bg-surface p-4">
            <Suspense fallback={<AttributesSkeleton />}>
              <AttributesPanel />
            </Suspense>
          </div>
        </FlagCard>

        <FlagCard
          testId="killswitch-section"
          step="Step 3 · a flag with no targeting"
          title="The cheapest kind of flag costs nothing"
          summary="No rules, so the answer is the same for everyone — and it is in the HTML the server sent."
          description={
            <>
              <p>
                The ruleset is fetched inside{" "}
                <code className="font-mono">use cache</code>, resolves during the
                prerender, and the value is baked into the document. There is no{" "}
                <code className="font-mono">&lt;Suspense&gt;</code> boundary here
                because nothing has to wait. View source rather than the element
                inspector: the value is in the HTML the server sent, not
                something the browser fetched.
              </p>
              <p>
                It is a real Flags SDK flag, not a shortcut around one. Getting
                it into the shell took the{" "}
                <code className="font-mono">flag(request)</code> call form —
                every ordinary invocation reads{" "}
                <code className="font-mono">headers()</code> to check for a
                Toolbar override, and that alone makes a scope unprerenderable.
              </p>
              <p className="border-l-[3px] border-amber-500 pl-3">
                <strong className="text-ink">
                  Changed this flag in GrowthBook and the page still shows the
                  old value?
                </strong>{" "}
                That is the cache doing its job. The ruleset is cached for hours
                like any other content. Expire it on{" "}
                <Link
                  href="/invalidate"
                  className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
                >
                  /invalidate
                </Link>{" "}
                — the <code className="font-mono">growthbook-payload</code>{" "}
                button — and the next request re-reads it. In production a
                webhook would press that button for you.
              </p>
            </>
          }
        >
          <div className="border border-line bg-surface p-4">
            <KillSwitch />
          </div>
        </FlagCard>

        <FlagCard
          testId="targeting-section"
          step="Step 5 · targeting"
          title="The first flag that asks who you are"
          summary="Forced on for India and the UK, off everywhere else — so this one streams."
          description={
            <>
              <p>
                Because it reads <code className="font-mono">country</code>, it
                cannot be prerendered. Unlike the kill switch, this one arrives
                after the shell.
              </p>
              <p>
                The important part is what did <em>not</em> become request-time.
                The ruleset behind this evaluation is the same cached entry the
                kill switch used — read once at build. Only the attributes are
                per-request, and matching them against the rules is a walk over
                some JSON. Personalising a flag costs a rule walk, not a round
                trip, which is why a page full of targeted flags can still be
                mostly static.
              </p>
            </>
          }
        >
          <div className="border border-line bg-surface p-4">
            <Suspense fallback={<TargetedFlagSkeleton />}>
              <TargetedFlagPanel />
            </Suspense>
          </div>
        </FlagCard>

        <FlagCard
          testId="experiment-section"
          step="Step 6 · an experiment"
          title="Targeting and bucketing are not the same mechanism"
          summary="A forced rule decides who is eligible. Hashing decides what eligible people get."
          description={
            <>
              <p>
                <code className="font-mono">hero-copy</code> carries two rules
                doing two different jobs. A forced rule decides{" "}
                <strong className="text-ink">eligibility</strong> — corporate
                visitors are excluded and always see control. The experiment rule
                decides <strong className="text-ink">which variant</strong> an
                eligible visitor gets, by hashing their id. Only the second is
                random.
              </p>
              <p>
                Switch to the corporate persona and the variant pins to{" "}
                <code className="font-mono">control</code> no matter how the id
                hashes — that is the forced rule deciding eligibility, before any
                bucketing happens. Every other persona shares one bucketing id —
                yours — so they all land in the same variant. Clear the{" "}
                <code className="font-mono">demo-anon-id</code> cookie to be
                issued a new one and roll again.
              </p>
              <p>
                Nothing here records an exposure yet. An A/B test is an exposure
                event paired with a conversion, and <em>where</em> that event may
                be fired is the whole subject of step 9 — put it one level too
                deep and it fires once per cache entry instead of once per
                visitor, with no error and a page that looks perfect.
              </p>
            </>
          }
        >
          <div className="border border-line bg-surface p-4">
            <Suspense fallback={<HeroExperimentSkeleton />}>
              <HeroExperimentPanel />
            </Suspense>
          </div>
        </FlagCard>

        <FlagCard
          testId="cached-hero-section"
          step="Step 8 · cache the variant"
          title="Three variants cost three renders, not fifty thousand"
          summary="Cached with the variant as the key rather than the visitor. The timestamp is the evidence."
          description={
            <>
              <p>
                Deciding is per-person and nearly free — a hash and a walk over
                rules already in memory. Rendering is per-variant and expensive,
                so it is paid for once and shared by everyone in that variant.
              </p>
              <p>
                The timestamp is generated <em>inside</em> the cached component,
                so it is part of the entry rather than a description of it:
                reload and it does not move. Switch to a persona in a different
                variant and you get a different frozen timestamp. A render
                costing <code className="font-mono">600ms</code> is paid three
                times in total, not once per visitor.
              </p>
              <p>
                <code className="font-mono">use cache: remote</code>, not plain{" "}
                <code className="font-mono">use cache</code>, and that
                distinction is the most expensive thing this project has
                measured. Plain <code className="font-mono">use cache</code> is
                an in-memory store inside the server process — a real cache on a
                long-lived <code className="font-mono">next start</code>, and no
                cache at all on serverless, where the instance holding the entry
                is gone by the next request. It looks identical locally.
              </p>
              <p className="border-l-[3px] border-amber-500 pl-3">
                <strong className="text-ink">
                  Nothing about the visitor may go inside that component
                </strong>{" "}
                — and nothing stops you.{" "}
                <code className="font-mono">cookies()</code> and{" "}
                <code className="font-mono">headers()</code> are rejected
                outright, but an id passed in as a prop is accepted silently: it
                joins the cache key and quietly turns one entry per variant back
                into one entry per visitor. The cache still &ldquo;works&rdquo;,
                the page still looks right, and the saving is gone.
              </p>
            </>
          }
        >
          <div className="border border-line bg-surface p-4">
            <Suspense fallback={<CachedHeroSkeleton />}>
              <CachedHeroPanel />
            </Suspense>
          </div>
        </FlagCard>
        {/* Full width: two counters side by side is the entire argument, and
            at half width they stack and stop being a comparison. */}
        <FlagCard
          className="md:col-span-2"
          testId="exposure-section"
          step="Step 9 · the exposure counter"
          title="The bug that costs you the experiment, not the latency"
          summary="Two identical paths. The only difference is which side of the cache boundary the tracking call sits on."
          description={
            <>
              <p>
                An A/B test is not the variant rendering. It is an{" "}
                <strong className="text-ink">exposure event</strong> —
                &ldquo;visitor 123 saw variant B&rdquo; — paired with a later
                conversion. Put that call inside a cached scope and it runs on
                the miss; every hit skips the whole function body, tracking
                included.
              </p>
              <p>
                Fifty thousand visitors, three exposures — one per cache entry.
                Conversions still attach to all fifty thousand, so the measured
                lift is meaningless and every dashboard looks healthy. Nothing
                catches it: not the build, not TypeScript, not a test, and not
                any timing measurement, because the damage is to the data rather
                than the latency.
              </p>
              <p>
                <strong className="text-ink">The rule is one line.</strong> The
                boundary between &ldquo;runs every request&rdquo; and
                &ldquo;runs once per variant&rdquo; is exactly the boundary
                between what must be tracked and what may be cached. Evaluate
                and track in the uncached wrapper; render inside the cache. With
                the Flags SDK that means{" "}
                <code className="font-mono">setTrackingCallback</code> with{" "}
                <code className="font-mono">after()</code>, which defers the call
                until after the response is sent, per request.
              </p>
              <p>
                The counters are module-level, which counts exactly on one{" "}
                <code className="font-mono">next start</code> and undercounts on
                serverless, where each instance keeps its own tally. The ratio
                survives either way. A real system sends these to an analytics
                pipeline — which is precisely why the bug is invisible: the
                pipeline receives well-formed events, just far too few of them.
              </p>
            </>
          }
        >
          <div className="border border-line bg-surface p-4">
            <ExposureProbe />
          </div>
        </FlagCard>
        <FlagCard
          testId="entitlement-section"
          step="Step 11 · a per-person flag"
          title="The one answer that cannot be shared"
          summary="Forced on for individual ids, so it belongs in your browser rather than on the server."
          description={
            <>
              <p>
                Every other flag on this page is safe in a shared cache because
                many visitors give the same answer — the kill switch is the same
                for everyone, and the experiment has three outcomes that
                thousands of people share. An entitlement is not like that. It is
                a fact about <em>you</em>, and a shared entry holding it would
                hand your access to whoever landed on that entry next.
              </p>
              <p>
                <code className="font-mono">use cache: private</code> is the only
                correct home for it. It is stored in your browser rather than on
                the server, so there is no shared entry to leak into — and it is
                the only scope permitted to read{" "}
                <code className="font-mono">cookies()</code>, which is where the
                visitor id lives. The other two reject that outright, and the
                rejection is the runtime refusing to let a per-person input near
                a shared entry.
              </p>
              <p>
                The cost is that nothing in a private scope is ever shared, so
                every visitor pays for whatever it contains. That is the argument
                for keeping one small: the entitlement check belongs inside, the
                ruleset behind it does not.
              </p>
            </>
          }
        >
          <div className="border border-line bg-surface p-4">
            <Suspense fallback={<EntitlementSkeleton />}>
              <EntitlementPanel />
            </Suspense>
          </div>
        </FlagCard>
      </div>
    </main>
  );
}
