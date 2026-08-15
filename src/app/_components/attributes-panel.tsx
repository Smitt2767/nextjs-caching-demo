import { ArrivalTimer } from "@/app/_components/arrival-timer";
import { readAttributes, type AttributeSource } from "@/lib/flags/attributes";
import type { Attributes } from "@/lib/personas";

/** Plain-language provenance, so the panel says where each value came from. */
const SOURCE_LABEL: Record<AttributeSource, string> = {
  persona: "persona cookie",
  proxy: "proxy",
  cookie: "cookie",
  geo: "geo header",
  fallback: "fallback",
};

const ROWS: { key: keyof Attributes; note: string }[] = [
  { key: "id", note: "minted in proxy · hashed to pick a variant" },
  { key: "audience", note: "captured from ?utm_campaign, then kept" },
  { key: "device", note: "ua-parser + Client Hints" },
  { key: "country", note: "geo header, or the /ppr country cookie" },
  { key: "daypart", note: "server clock, UTC" },
];

/**
 * What this request resolved to.
 *
 * Streams, and has to: every value here comes from `cookies()` or `headers()`,
 * so none of it can be in the static shell. That is the honest demonstration of
 * the constraint — the attributes are request-time and no arrangement of
 * caching changes that.
 *
 * What *is* cacheable is whatever comes next. Once a flag is evaluated from
 * these, only the resulting variant crosses into a cached scope — one short
 * string, shared by everyone who lands on it.
 */
export async function AttributesPanel() {
  const { attributes, sources } = await readAttributes();

  return (
    <div data-testid="attributes-panel">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[12px]">
        <span className="bg-ink px-1.5 py-0.5 font-bold text-surface-raised">
          <ArrivalTimer id="attributes" />
        </span>
        <span className="text-ink-subtle">
          resolved at request time — never in the static shell
        </span>
      </div>

      <dl className="divide-y divide-line border-y border-line">
        {ROWS.map(({ key, note }) => (
          <div
            key={key}
            className="grid grid-cols-1 gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-baseline"
          >
            <dt className="font-mono text-[13px] text-ink-subtle">{key}</dt>
            <dd className="min-w-0">
              <span
                data-testid={`attr-${key}`}
                className="font-mono text-[14px] font-bold break-all text-ink"
              >
                {attributes[key]}
              </span>
              <span className="ml-2 font-mono text-[12px] text-ink-subtle">
                {note}
              </span>
            </dd>
            <dd className="font-mono text-[12px] text-ink-subtle sm:text-right">
              {SOURCE_LABEL[sources[key]]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Matches the panel's shape so the card does not jump when it lands. */
export function AttributesSkeleton() {
  return (
    <div data-testid="attributes-skeleton">
      <div className="mb-3 font-mono text-[12px]">
        <span className="bg-ink/10 px-1.5 py-0.5 text-ink-subtle dark:bg-white/10">
          reading cookies and headers…
        </span>
      </div>
      <div
        className="divide-y divide-line border-y border-line"
        aria-hidden="true"
      >
        {ROWS.map(({ key }) => (
          <div key={key} className="py-2">
            <div className="h-4 w-64 max-w-full bg-ink/10 dark:bg-white/10" />
          </div>
        ))}
      </div>
      <span className="sr-only">Resolving targeting attributes…</span>
    </div>
  );
}
