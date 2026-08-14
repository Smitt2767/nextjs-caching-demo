import Link from "next/link";
import { Suspense } from "react";

import { ArrivalTimer } from "@/app/_components/arrival-timer";
import {
  CatalogList,
  ComponentCachedCatalog,
  ComponentCachedCountrySlot,
} from "@/app/_components/component-cached";
import { CountrySwitcher } from "@/app/_components/country-switcher";
import { CachedCountrySlot, CountrySlot } from "@/app/_components/country-slot";
import { PrivateComponentCountrySlot } from "@/app/_components/private-cached";
import { SlotCard } from "@/app/_components/slot-card";
import { SlotSkeleton, StatusLine } from "@/app/_components/slot-body";
import { getCatalog } from "@/lib/catalog";
import { trace } from "@/lib/trace";

// Cached with `use cache` and free of request-time input, so it is prerendered
// straight into the static shell — no <Suspense> needed.
async function CachedCatalog() {
  // The component is not cached, only its data — so this prints every request
  // while `getCatalog RAN` stays quiet on a hit.
  trace("G1", "component", "CachedCatalog", "requested", "data cached");

  const catalog = await getCatalog();
  return (
    <>
      <StatusLine
        timerId="catalog"
        status={`data cached · computed once at ${catalog.cachedAt}`}
      />
      <CatalogList entries={catalog.entries} testId="cached-catalog" />
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
        {children}
      </p>
    </div>
  );
}

export const instant = false;

export default function PprDemo() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
      <header data-testid="ppr-shell" className="max-w-2xl">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-mono text-[11px] text-ink-subtle transition-colors hover:text-ink"
        >
          ← all demos
        </Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          What&apos;s in the shell, what streams in
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          Seven slots on one page. Each card&apos;s frame, title and notes are
          prerendered — only the region inside it can stream. Every slot reports{" "}
          <span className="font-mono text-ink">rendered @Nms</span>: when that
          content actually reached the screen.
        </p>

        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {(
            [
              ["bg-emerald-500", "Static", "in the prerendered shell"],
              ["bg-red-500", "Uncached", "pays full cost every request"],
              ["bg-amber-500", "Data cached", "fetch cached, render is not"],
              ["bg-violet-500", "Component cached", "fetch and render cached"],
              [
                "bg-sky-500",
                "Private",
                "cached in your browser, not the server",
              ],
            ] as const
          ).map(([dot, term, desc]) => (
            <div key={term} className="flex items-baseline gap-2">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 translate-y-px rounded-full ${dot}`}
              />
              <dt className="font-mono text-[11px] font-bold text-ink">
                {term}
              </dt>
              <dd className="text-[13px] text-ink-muted">{desc}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="mt-12" aria-labelledby="shell-heading">
        <div id="shell-heading">
          <SectionHeading eyebrow="Group 1" title="Prerendered into the shell">
            None of these read request-time data, so all three are in the HTML
            document before any JavaScript runs.
          </SectionHeading>
        </div>

        <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          <SlotCard
            variant="static"
            title="Pure markup"
            summary="No await anywhere, so nothing can defer it."
            snippetId="shell"
            description={
              <>
                <p>
                  This card has no data dependency at all. It is plain JSX, so
                  Next prerenders it at build time and serves it as part of the
                  document.
                </p>
                <p>
                  The country switcher below is a Client Component — it ships
                  JavaScript for its click handler, but its markup is still
                  prerendered, which is why it paints before it is interactive.
                </p>
              </>
            }
          >
            <StatusLine timerId="shell" status="no server work this request" />
            <CountrySwitcher />
          </SlotCard>

          <SlotCard
            variant="static"
            title="Cached data"
            summary="600ms of work, paid once and frozen into the cache."
            snippetId="catalog"
            description={
              <>
                <p>
                  <code className="font-mono">getCatalog()</code> is marked{" "}
                  <code className="font-mono">&quot;use cache&quot;</code>. It
                  takes no request-time input, so its result is computed once
                  and prerendered.
                </p>
                <p>
                  The timestamp is baked into the cache entry — reload and it
                  will not move. That is the tell for a cache hit.
                </p>
              </>
            }
          >
            <CachedCatalog />
          </SlotCard>

          <SlotCard
            variant="component"
            title="Cached component"
            summary="The rendered markup is the cache entry, not just the data."
            snippetId="catalog-component"
            description={
              <>
                <p>
                  Here <code className="font-mono">&quot;use cache&quot;</code>{" "}
                  sits on the component itself, so a hit skips the render as
                  well as the fetch.
                </p>
                <p>
                  With no request-time input both this and the card to its left
                  land in the shell, so they look identical here. The difference
                  only becomes visible in the country slots below.
                </p>
              </>
            }
          >
            <ComponentCachedCatalog />
          </SlotCard>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="country-heading">
        <div id="country-heading">
          <SectionHeading
            eyebrow="Group 2"
            title="Three strategies, one country lookup"
          >
            All three read your country from a cookie at request time, then do
            the same 2000ms lookup and 400ms render. Only where the cache sits
            differs. Switch country above and watch them diverge.
          </SectionHeading>
        </div>

        <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          <SlotCard
            variant="uncached"
            title="No cache"
            summary="Every request waits the full 2000ms."
            snippetId="country"
            description={
              <>
                <p>
                  Reading <code className="font-mono">cookies()</code> makes
                  this request-bound, and nothing is cached, so the lookup runs
                  again on every single request.
                </p>
                <p>
                  Its <code className="font-mono">&lt;Suspense&gt;</code>{" "}
                  fallback is what keeps the rest of the page instant — without
                  it, this 2s wait would block the whole document.
                </p>
              </>
            }
          >
            <Suspense
              fallback={<SlotSkeleton testId="country-skeleton" tint="red" />}
            >
              <CountrySlot />
            </Suspense>
          </SlotCard>

          <SlotCard
            variant="data-cached"
            title="Cache the data"
            summary="Lookup is free on a hit — the render still is not."
            snippetId="country-cached"
            description={
              <>
                <p>
                  The country code is passed as an <em>argument</em> into a{" "}
                  <code className="font-mono">&quot;use cache&quot;</code>{" "}
                  function, so it becomes part of the cache key: one entry per
                  country. The cookie is read outside that scope, because cached
                  scopes cannot read cookies.
                </p>
                <p>
                  On a hit the lookup reports 0ms — but the 400ms render is
                  still paid, because the component itself re-runs.
                </p>
              </>
            }
          >
            <Suspense
              fallback={
                <SlotSkeleton testId="cached-country-skeleton" tint="amber" />
              }
            >
              <CachedCountrySlot />
            </Suspense>
          </SlotCard>

          <SlotCard
            variant="component"
            title="Cache the component"
            summary="Lookup and render both skipped — and it can arrive with the shell."
            snippetId="country-component"
            description={
              <>
                <p>
                  A hit replays cached markup, so neither the lookup nor the
                  render happens again. The &quot;rendered once at&quot;
                  timestamp is frozen, which proves it.
                </p>
                <p>
                  Best of all: on a <strong>client navigation</strong> this
                  resolves during prefetch and commits{" "}
                  <em>together with the shell</em> — it never streams at all.
                  Arrive here by clicking the link from the index and it is
                  already present.
                </p>
              </>
            }
          >
            <Suspense
              fallback={
                <SlotSkeleton
                  testId="component-country-skeleton"
                  tint="violet"
                />
              }
            >
              <ComponentCachedCountrySlot />
            </Suspense>
          </SlotCard>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="private-heading">
        <div id="private-heading">
          <SectionHeading
            eyebrow="Group 3"
            title="Cached in your browser — no loading on navigation"
          >
            The red slot from group 2, unchanged except for one directive. Click{" "}
            <span className="font-mono">← all demos</span> and come back: this
            one is already there, while the red slot above shows its skeleton
            again. A full reload clears browser memory, so it is slow again.
          </SectionHeading>
        </div>

        <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          <SlotCard
            variant="private"
            title="use cache: private, on the component"
            summary="Navigate away and back — this one does not reload."
            snippetId="private-component"
            description={
              <>
                <p>
                  The result is held in your browser, so a client navigation
                  reuses it with no server round trip and{" "}
                  <strong>no loading state</strong>. The red slot in group 2 is
                  the identical component without this directive, and it shows a
                  skeleton every time.
                </p>
                <p>
                  It also reads <code className="font-mono">cookies()</code>{" "}
                  from inside the cached scope, which plain{" "}
                  <code className="font-mono">use cache</code> forbids — so
                  unlike the violet slot above it needs no uncached wrapper and
                  no <code className="font-mono">code</code> prop.
                </p>
                <p>
                  Nothing is stored on the server, so a full page{" "}
                  <em>reload</em> always pays again.{" "}
                  <code className="font-mono">stale</code> is 300s: 30s is the
                  minimum for runtime prefetching, 5 minutes to be eligible for
                  the App Shell.
                </p>
              </>
            }
          >
            <Suspense
              fallback={
                <SlotSkeleton testId="private-component-skeleton" tint="sky" />
              }
            >
              <PrivateComponentCountrySlot />
            </Suspense>
          </SlotCard>
        </div>
      </section>

      <p className="mt-12 max-w-2xl border-t border-line pt-5 font-mono text-[11px] leading-relaxed text-ink-subtle">
        Every wrapper on this page is in the initial HTML response — open
        DevTools → Network → the <span className="text-ink">/ppr</span> document
        and read it. Only the slot bodies arrive later.{" "}
        <ArrivalTimer id="footer" />
      </p>
    </main>
  );
}
