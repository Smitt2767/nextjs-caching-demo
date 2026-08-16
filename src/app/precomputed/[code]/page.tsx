import { generatePermutations, getPrecomputed } from "flags/next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

import { FlagCard } from "@/app/_components/flag-card";
import {
  EntitlementPanel,
  EntitlementSkeleton,
} from "@/app/_components/entitlement-panel";
import { PersonaSwitcher } from "@/app/_components/persona-switcher";
import { PrecomputedHero } from "@/app/_components/precomputed-hero";
import { FLAG_DEFAULTS } from "@/lib/flags/evaluate";
import {
  catalogKillSwitch,
  heroCopy,
  precomputeFlags,
  pricingBadge,
} from "@/lib/flags/sdk";

/**
 * Step 12 — the decision made before the render, not during it.
 *
 * Every earlier step keeps the page static and lets the decision arrive at
 * request time, streaming each flag-dependent region in behind `<Suspense>`.
 * This route inverts that: `proxy.ts` decides first, encodes the decision into
 * the `[code]` segment, and rewrites to the page built for that combination.
 * The hero is in the first HTML response, so there is nothing to stream and
 * nothing to flash.
 *
 * `/flags` is deliberately still there, unchanged, rendering the same flags the
 * other way. The two URLs are the comparison.
 */

/**
 * One page per decision — twelve of them.
 *
 * `generatePermutations` walks the `options` declared on each flag in
 * `precomputeFlags`: 2 × 2 × 3. It does **not** walk the attributes, and that
 * distinction is the entire economics of this step. Five audiences × four
 * devices × three countries × three dayparts is 180 visitor combinations, and
 * prerendering per visitor would be absurd. Prerendering per *decision* costs
 * twelve pages, and adding a country or an audience adds none.
 *
 * What does cost pages is another flag: one with n options multiplies this by
 * n. That is the number to watch, and it is why `beta-entitlement` declares no
 * `options` — a per-person flag has no decision space to enumerate, and
 * including it would try to prerender one page per human being.
 */
export async function generateStaticParams() {
  const codes = await generatePermutations(precomputeFlags);
  return codes.map((code) => ({ code }));
}

/**
 * `dynamicParams` is left at its default of `true`, deliberately.
 *
 * A code outside the twelve — the flag set changed, a permutation was filtered
 * out, someone pasted an old URL — still renders, on demand, rather than 404ing.
 * `getPrecomputed` verifies the signature, so an unknown code is either a valid
 * combination we did not prebuild or it is rejected; neither case is worth
 * serving an error page for.
 */

export const metadata = {
  title: "Precomputed flags",
  description: "One prerendered page per flag decision.",
};

/**
 * Decode the segment into the three flag values.
 *
 * **`params` is taken as a promise and awaited in here, and that is not
 * stylistic.** Under Cache Components `params` counts as runtime data like
 * `cookies()` or `headers()`, so reading it in the page body fails the
 * prerender outright — *"Next.js encountered uncached or runtime data during
 * prerendering"*, measured, even though `generateStaticParams` means the value
 * is known at build. Handing the unresolved promise to a `use cache` scope and
 * resolving it inside is the documented shape (`generate-static-params.md`,
 * "Route Handlers with Cache Components"), and it is what makes the twelve
 * pages prerender.
 *
 * The work itself is pure crypto — verify a signature, unpack indices into
 * values. No ruleset, no network, no request data. By the time this returns,
 * every decision the page depends on is a constant.
 *
 * **A bad signature must be handled, or the page silently loses its body.**
 * `getPrecomputed` throws `ERR_JWS_INVALID` on a segment that does not verify,
 * and with nothing catching it the response was a 200 whose entire `<main>` was
 * missing — measured. Not a 500, not an error page: a shell with no content and
 * nothing in the response saying why.
 *
 * An ordinary `try`/`catch` right here is enough to contain it. That is worth
 * stating because `ruleset.ts` documents the opposite for *prerendering* — a
 * throw inside `use cache` fails the build even when the caller catches it —
 * and the two are easy to conflate. The distinction is when the throw happens:
 * at build time it kills the prerender before any handler exists, at request
 * time it is a normal rejection and normal handling works.
 *
 * A bad code therefore falls back to the declared defaults rather than 404ing.
 * The segment is not something a visitor typed — proxy writes it — so an
 * invalid one means tampering or a stale link, and in both cases the control
 * experience is a better answer than an error page. Same stance as the ruleset
 * fallback: fail open, and make the failure visible in the UI rather than in
 * the status code.
 */
async function decodeVariant(params: Promise<{ code: string }>) {
  "use cache";

  // A pure function of the segment, so it is only ever wrong after a deploy —
  // which rebuilds it anyway. Without this it inherits the `default` profile
  // and revalidates every 15 minutes, re-deriving a constant on a timer.
  cacheLife("max");

  const { code } = await params;

  try {
    // The array form rather than three separate calls: it verifies the
    // signature once and unpacks all three values from that one result.
    const [killSwitch, pricing, variant] = await getPrecomputed(
      [catalogKillSwitch, pricingBadge, heroCopy],
      precomputeFlags,
      code,
    );


    return { code, killSwitch, pricing, variant, valid: true };
  } catch (error) {
    console.error("[flags] precomputed code could not be verified", error);

    return {
      code,
      killSwitch: FLAG_DEFAULTS["catalog-kill-switch"] as boolean,
      pricing: FLAG_DEFAULTS["pricing-badge"] as boolean,
      variant: FLAG_DEFAULTS["hero-copy"] as string,
      valid: false,
    };
  }
}

export default async function PrecomputedPage({
  params,
}: PageProps<"/precomputed/[code]">) {
  const { code, killSwitch, pricing, variant, valid } =
    await decodeVariant(params);

  return (
    <main className="w-full flex-1 px-4 py-5">
      <header className="border-b border-line pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Precomputed variants
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-muted">
          The decision was made in <code className="font-mono">proxy.ts</code>{" "}
          before this page began rendering, encoded into a hidden URL segment,
          and used to pick one of twelve pages built at deploy time. Nothing on
          this page streams, because nothing was still undecided when it started.
        </p>
        <p className="mt-2 font-mono text-[13px] text-ink-subtle">
          <Link
            href="/flags"
            className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            /flags
          </Link>{" "}
          renders the same flags the streaming way · compare the two
        </p>
      </header>

      <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
        <FlagCard
          className="md:col-span-2"
          testId="precomputed-hero-section"
          step="Step 12 · precompute"
          title="The hero arrives fully formed"
          summary="No Suspense boundary, no skeleton, no flash — it was rendered at build time for exactly this decision."
          action={<PersonaSwitcher decidedInProxy />}
          description={
            <>
              <p>
                On <Link href="/flags">/flags</Link> this same hero costs a
                visible wait: the variant cannot be known until the request
                arrives, so the card ships a skeleton and the real markup
                streams in behind it. Here the variant was known before
                rendering started, so the hero is in the document the server
                sent. View source rather than the inspector — it is in the HTML,
                not something the browser filled in.
              </p>
              <p>
                <strong className="text-ink">
                  The trade is where the personalisation happens, not whether it
                  happens.
                </strong>{" "}
                Streaming keeps one page and defers the decision. Precompute
                keeps the decision early and pays for one page per outcome. Both
                serve the same visitor the same variant.
              </p>
              <p>
                What makes it affordable is that pages scale with{" "}
                <em>decisions</em>, not visitors. Our attributes have 180
                combinations; our flags have twelve outcomes. Adding a country
                or an audience adds zero pages — adding a three-option flag
                triples them.
              </p>
              <p>
                <strong className="text-ink">
                  Switch persona and watch the code above change.
                </strong>{" "}
                The corporate persona is excluded from the experiment by a
                forced rule and pins to <code className="font-mono">control</code>;
                the others differ by how their shared bucketing id hashes. Each
                one lands on a different prebuilt page, and the hero is already
                in it.
              </p>
              <p>
                That switch costs a <strong className="text-ink">full page
                load</strong> here and nothing at all on{" "}
                <Link href="/flags">/flags</Link>, which is the trade in
                miniature. Proxy decides <em>before</em> the render, so it had
                already run — with your old cookie — by the time the switcher
                wrote the new one. Only a real navigation re-enters the routing
                decision. Deciding early is cheaper to serve and more expensive
                to change your mind about.
              </p>
              <p className="border-l-[3px] border-amber-500 pl-3">
                <strong className="text-ink">The cost is paid in proxy.</strong>{" "}
                Deciding before the render means reading the ruleset on every
                request, at the edge, with no{" "}
                <code className="font-mono">use cache</code> available — that
                directive is render-time and proxy runs before any render
                exists. Vercel Edge Config keeps it to a local lookup. Without
                it the fallback is a CDN round trip in front of every request,
                which is worse than the streaming this replaced.
              </p>
            </>
          }
        >
          <div className="border border-line bg-surface p-4">
            <PrecomputedHero variant={variant} />
          </div>
        </FlagCard>

        <FlagCard
          testId="precomputed-code-section"
          step="Step 12 · the code"
          title="Three decisions, one signed segment"
          summary="The URL segment the browser never sees, and why it is signed."
          description={
            <>
              <p>
                The segment encodes each flag&rsquo;s value as an{" "}
                <em>index into its declared options</em>, which is why it stays
                short however many flags are added, and why a flag with no{" "}
                <code className="font-mono">options</code> cannot be precomputed
                at all.
              </p>
              <p>
                It is signed with{" "}
                <code className="font-mono">FLAGS_SECRET</code>. Without a
                signature the segment would be an invitation to enumerate the
                variant space by hand, or to request a combination the flags
                would never have produced.
              </p>
              <p>
                Your address bar still says{" "}
                <code className="font-mono">/precomputed</code>. This is a
                rewrite, not a redirect: no extra round trip, and the variant
                never ends up bookmarked, shared, or pasted into a bug report by
                someone who then cannot reproduce anything.
              </p>
            </>
          }
        >
          <div className="space-y-3 border border-line bg-surface p-4">
            {valid ? null : (
              <p
                data-testid="precomputed-invalid"
                className="border-l-[3px] border-red-500 pl-3 text-[13px] leading-relaxed text-ink-muted"
              >
                <strong className="text-ink">
                  This segment failed signature verification.
                </strong>{" "}
                The values below are the declared defaults, not a decision. A
                tampered or stale code falls back rather than erroring — the
                alternative, measured, was a 200 with an empty page.
              </p>
            )}
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                rewritten to
              </p>
              <code
                data-testid="precomputed-code"
                className="mt-1 block break-all font-mono text-[12px] text-ink"
              >
                /precomputed/{code}
              </code>
            </div>

            <dl className="grid gap-x-4 gap-y-1.5 font-mono text-[12px] sm:grid-cols-[auto_1fr]">
              <PrecomputedValue name="catalog-kill-switch" value={killSwitch} />
              <PrecomputedValue name="pricing-badge" value={pricing} />
              <PrecomputedValue name="hero-copy" value={variant} />
            </dl>
          </div>
        </FlagCard>

        <FlagCard
          testId="precomputed-entitlement-section"
          step="Step 12 · what stays dynamic"
          title="Precompute does not abolish request-time work"
          summary="A per-person flag has no decision space to enumerate, so it streams here exactly as it does on /flags."
          description={
            <>
              <p>
                <code className="font-mono">beta-entitlement</code> is forced on
                for a list of individual ids, so its &ldquo;decision
                space&rdquo; is one outcome per person. Prerendering that would
                mean one page per human being, which is why the flag declares no{" "}
                <code className="font-mono">options</code> and drops out of the
                permutation set.
              </p>
              <p>
                So it does here what it does everywhere: evaluated per request,
                rendered inside{" "}
                <code className="font-mono">use cache: private</code>, streamed
                in behind a boundary. A precomputed page is a page whose{" "}
                <em>shared</em> decisions were made early — the genuinely
                per-person ones still cost what they always cost.
              </p>
              <p>
                That is the honest shape of this technique. It moves the flags
                that many visitors agree on out of the request path, and leaves
                the ones that nobody shares exactly where they were.
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

/** One decoded flag, shown as the value it resolved to and nothing more. */
function PrecomputedValue({
  name,
  value,
}: {
  name: string;
  value: boolean | string;
}) {
  return (
    <>
      <dt className="text-ink">{name}</dt>
      <dd
        data-testid={`precomputed-${name}`}
        className="font-bold text-ink-muted"
      >
        {typeof value === "boolean" ? (value ? "ON" : "OFF") : value}
      </dd>
    </>
  );
}
