import { ArrivalTimer } from "@/app/_components/arrival-timer";
import { COUNTRY_FETCH_DELAY_MS, type CountryOffer } from "@/lib/countries";

/**
 * The status line every slot body opens with: what happened on the server, and
 * when this body actually reached the screen.
 */
export function StatusLine({
  timerId,
  status,
}: {
  timerId: string;
  status: React.ReactNode;
}) {
  // Deliberately hueless.
  //
  // On this page colour means one thing — which caching strategy a card
  // demonstrates. Tinting the status line green for a hit or amber for a miss
  // put a second meaning on the same two hues, so an amber "data cached" card
  // reported its hit in emerald (the "static" colour) and a sky "private" card
  // reported its state in amber. The words already say hit or miss; emphasis
  // here is weight, not colour.
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
      <span className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised">
        <ArrivalTimer id={timerId} />
      </span>
      {/* suppressHydrationWarning: a status line may carry a cache timestamp,
          and those legitimately differ between the build-time prerender and
          the first runtime cache fill. A freshly started server has an empty
          in-memory cache, so the document it serves contains the build's
          timestamp in the static shell and a newly computed one in the
          streamed slots — two values for the same text, which React reports as
          a mismatch (#418). The divergence is real and expected; only the
          warning is noise. See the README. */}
      <span
        suppressHydrationWarning
        className="text-ink-subtle [&_[data-verdict]]:font-bold [&_[data-verdict]]:text-ink"
      >
        {status}
      </span>
    </div>
  );
}

/** The per-country content. Identical in all three slots — only the caching in
 *  front of it differs. */
export function OfferBody({
  offer,
  testId,
}: {
  offer: CountryOffer;
  testId: string;
}) {
  return (
    <div data-testid={testId} data-country={offer.code}>
      <p className="text-[13px] text-ink-subtle">
        {offer.greeting} — <span aria-hidden="true">{offer.flag}</span>{" "}
        {offer.label}
      </p>
      <h4 className="mt-0.5 text-base font-semibold leading-tight text-ink">
        {offer.headline}
      </h4>
      <dl className="mt-3 space-y-2 text-[13px]">
        {[
          ["price", offer.price, `${testId}-price`],
          ["shipping", offer.shipping, undefined],
          ["support", offer.support, undefined],
        ].map(([term, value, id]) => (
          <div key={term} className="flex justify-between gap-3">
            <dt className="font-mono text-[11px] text-ink-subtle">{term}</dt>
            <dd className="text-right font-medium text-ink" data-testid={id}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Placeholder shown while a slot body is still in flight. Matches the real
 *  body's shape so the card does not jump when content lands. */
export function SlotSkeleton({
  testId,
  tint,
}: {
  testId: string;
  tint: "red" | "amber" | "violet" | "sky";
}) {
  const bar = {
    red: "bg-red-500/20",
    amber: "bg-amber-500/20",
    violet: "bg-violet-500/20",
    sky: "bg-sky-500/20",
  }[tint];

  return (
    <div data-testid={testId}>
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px]">
        <span className="bg-ink/10 px-1.5 py-0.5 text-ink-subtle dark:bg-white/10">
          waiting ≤{COUNTRY_FETCH_DELAY_MS}ms
        </span>
      </div>
      <div className="space-y-2" aria-hidden="true">
        <div className={`h-3 w-32 ${bar}`} />
        <div className={`h-4 w-44 ${bar}`} />
        <div className="space-y-2 pt-2">
          <div className={`h-3 ${bar}`} />
          <div className={`h-3 ${bar}`} />
          <div className={`h-3 w-2/3 ${bar}`} />
        </div>
      </div>
      <span className="sr-only">Loading country content…</span>
    </div>
  );
}
