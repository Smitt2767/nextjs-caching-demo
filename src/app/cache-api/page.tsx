import Link from "next/link";

import { highlight } from "@/lib/highlight";
import { SNIPPETS } from "@/lib/snippets";

export const metadata = {
  title: "The cache API",
  description:
    "Every directive and function Cache Components gives you, one card each.",
};

/**
 * A reference page rather than a demo: nothing here measures anything, it just
 * says what each API does and when to reach for it. The measurements live in
 * /ppr and /flags.
 *
 * Fully static — `highlight()` is behind `use cache` and takes a constant, so
 * the whole page prerenders.
 */

type Card = {
  name: string;
  /** One line under the name: the thing it actually controls. */
  subtitle: string;
  /** Optional accent, used only for the three directives. */
  rail?: string;
  accent?: string;
  /** Short scannable chip, where a card has a single defining property. */
  chip?: string;
  /** Lay the rows out in columns — for a card that sits alone on its row. */
  wide?: boolean;
  rows: { term: string; detail: React.ReactNode }[];
};

const DIRECTIVES: Card[] = [
  {
    name: '"use cache"',
    subtitle: "Kept in this server process's memory",
    rail: "bg-violet-500",
    accent: "text-violet-700 dark:text-violet-400",
    rows: [
      {
        term: "Use for",
        detail: (
          <>
            Work with{" "}
            <strong className="text-ink">no request-time input</strong> — plan
            tables, navigation, marketing copy. Computed at build time, baked
            into the page and served from the edge, which makes it the cheapest
            option here.
          </>
        ),
      },
      {
        term: "Watch out",
        detail: (
          <>
            At <em>request</em> time on serverless it caches nothing. Entries
            live in one instance&apos;s memory and the next request may land on
            another. Confirmed on Vercel: six consecutive requests, six fresh
            renders.
          </>
        ),
      },
    ],
  },
  {
    name: '"use cache: remote"',
    subtitle: "Kept in a shared store every instance can reach",
    rail: "bg-amber-500",
    accent: "text-amber-700 dark:text-amber-400",
    rows: [
      {
        term: "Use for",
        detail: (
          <>
            Anything cached <strong className="text-ink">at request time</strong>{" "}
            — in practice, everything behind a{" "}
            <code className="font-mono">&lt;Suspense&gt;</code> boundary that
            depends on a cookie, header or search param. Still shared by every
            visitor.
          </>
        ),
      },
      {
        term: "Watch out",
        detail: (
          <>
            Costs a network round trip per lookup, plus platform fees. Entries
            do not survive a deploy — the cache key includes the build ID, so
            the first request after each release pays full price.
          </>
        ),
      },
    ],
  },
  {
    name: '"use cache: private"',
    subtitle: "Kept in the visitor's browser. Never the server.",
    rail: "bg-sky-500",
    accent: "text-sky-700 dark:text-sky-400",
    rows: [
      {
        term: "Use for",
        detail: (
          <>
            The one step that is genuinely{" "}
            <strong className="text-ink">per visitor</strong>, which is usually
            just reading an identifier. It is the only directive permitted to
            call <code className="font-mono">cookies()</code> inside itself.
          </>
        ),
      },
      {
        term: "Watch out",
        detail: (
          <>
            It has no server-side cache at all. Wrap something expensive in it
            and every visitor pays for it in full, every time — measured at{" "}
            <strong className="text-ink">~2031ms</strong> against{" "}
            <strong className="text-ink">~105ms</strong> for the same work moved
            one level out.
          </>
        ),
      },
    ],
  },
];

const CLEARING: Card[] = [
  {
    name: "updateTag(tag)",
    subtitle: "Expire one tag now, and wait for the new value",
    chip: "BLOCKS",
    rows: [
      {
        term: "Call from",
        detail: (
          <>
            <strong className="text-ink">Server Actions only.</strong> Not Route
            Handlers, not Client Components, not Proxy.
          </>
        ),
      },
      {
        term: "Behaviour",
        detail: (
          <>
            Expires the entry immediately. The next request waits for fresh data
            rather than being handed the old value.
          </>
        ),
      },
      {
        term: "Reach for it",
        detail: (
          <>
            When <em>this</em> visitor just caused the change and has to see it —
            they submitted the form, so showing them stale data reads as a bug.
            Read-your-own-writes.
          </>
        ),
      },
    ],
  },
  {
    name: 'revalidateTag(tag, "max")',
    subtitle: "Mark one tag stale and refresh it behind the request",
    chip: "STALE-WHILE-REVALIDATE",
    rows: [
      {
        term: "Call from",
        detail: (
          <>
            Server Functions <em>and</em> Route Handlers — which is what makes it
            the one a webhook can use. Not Proxy.
          </>
        ),
      },
      {
        term: "Behaviour",
        detail: (
          <>
            Marks the entry stale. The next visitor is served the old value
            immediately while a fresh one is built behind them. Nothing
            recomputes until a page using that tag is actually visited, so it
            will not stampede.
          </>
        ),
      },
      {
        term: "Reach for it",
        detail: (
          <>
            When something changed globally and a few seconds of staleness costs
            nothing — a CMS publish, a price update, a feature flag flip. Pass{" "}
            <code className="font-mono">&quot;max&quot;</code>: the one-argument
            form is deprecated and blocks instead.
          </>
        ),
      },
    ],
  },
  {
    name: "revalidatePath(path)",
    subtitle: "Drop everything cached for a route",
    chip: "WHOLE ROUTE",
    rows: [
      {
        term: "Call from",
        detail: <>Server Functions and Route Handlers. Not Proxy.</>,
      },
      {
        term: "Behaviour",
        detail: (
          <>
            Invalidates the whole route rather than one entry. A second argument
            picks the type — <code className="font-mono">&quot;page&quot;</code>{" "}
            or <code className="font-mono">&quot;layout&quot;</code> — and is{" "}
            <strong className="text-ink">required</strong> when the path
            contains a dynamic segment like{" "}
            <code className="font-mono">/product/[slug]</code>.
          </>
        ),
      },
      {
        term: "Reach for it",
        detail: (
          <>
            Rarely. It is the blunt instrument: every cached thing on the route
            recomputes, including the parts that were still perfectly valid.
            Tags exist so you do not have to do this.
          </>
        ),
      },
    ],
  },
];

/** The three fields of `cacheLife`, which describe three different places. */
const LIFE_FIELDS = [
  {
    field: "stale",
    where: "In the browser",
    detail: (
      <>
        How long the client-side router reuses what it already has{" "}
        <em>without asking the server at all</em>. During this window a
        navigation paints instantly and makes no request. Nothing to do with the
        server cache. It also decides whether the content is eligible for the
        route&apos;s App Shell — which is why the private slot in /ppr sets{" "}
        <code className="font-mono">stale: 300</code> and not less.
      </>
    ),
  },
  {
    field: "revalidate",
    where: "On the server, in the background",
    detail: (
      <>
        How often the server rebuilds the entry. Past this age the next request
        is still served the cached copy <em>immediately</em>, and a fresh one is
        generated behind it for whoever comes next. Nobody waits.
      </>
    ),
  },
  {
    field: "expire",
    where: "On the server, blocking",
    detail: (
      <>
        The hard limit. After this long without traffic the entry is no longer
        servable, so the next request waits for a synchronous regeneration. Must
        be longer than <code className="font-mono">revalidate</code> — Next
        validates this and errors on the build if it is not.
      </>
    ),
  },
];

const PROFILES = [
  ["default", "Standard content — applied if you call nothing", "5 minutes", "15 minutes", "never"],
  ["seconds", "Real-time data", "30 seconds", "1 second", "1 minute"],
  ["minutes", "Frequently updated content", "5 minutes", "1 minute", "1 hour"],
  ["hours", "Updated multiple times per day", "5 minutes", "1 hour", "1 day"],
  ["days", "Updated daily", "5 minutes", "1 day", "1 week"],
  ["weeks", "Updated weekly", "5 minutes", "1 week", "30 days"],
  ["max", "Stable content that rarely changes", "5 minutes", "30 days", "1 year"],
] as const;

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
    <div className="max-w-3xl">
      <p className="font-mono text-[12px] font-medium uppercase tracking-wider text-ink-subtle">
        {eyebrow}
      </p>
      <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
        {children}
      </p>
    </div>
  );
}

function ApiCard({ card }: { card: Card }) {
  return (
    <article
      data-testid={`api-${card.name.replace(/\W+/g, "-").replace(/-+$/, "")}`}
      className="relative border border-line bg-surface-raised p-4 pl-5"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${card.rail ?? "bg-ink-subtle"}`}
      />
      <h3
        className={`font-mono text-[13px] font-bold tracking-tight ${card.accent ?? "text-ink"}`}
      >
        {card.name}
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">
        {card.subtitle}
      </p>
      {card.chip ? (
        <span className="mt-2 inline-block bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-surface-raised">
          {card.chip}
        </span>
      ) : null}

      <dl
        className={
          card.wide
            ? "mt-3 grid gap-x-8 gap-y-3 text-[14px] leading-relaxed sm:grid-cols-2 xl:grid-cols-4"
            : "mt-3 space-y-2.5 text-[14px] leading-relaxed"
        }
      >
        {card.rows.map((row) => (
          <div key={row.term}>
            <dt className="font-mono text-[12px] uppercase tracking-wider text-ink-subtle">
              {row.term}
            </dt>
            <dd className="mt-0.5 text-ink-muted">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default async function CacheApiReference() {
  const snippet = SNIPPETS.directives;
  const html = await highlight(snippet.code);

  return (
    <main className="w-full flex-1 px-4 py-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          The cache API, one card at a time
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-muted">
          Three directives that decide <em>where</em> an answer is kept, one
          function that decides <em>how long</em> it lives, one that{" "}
          <em>labels</em> it, and three ways to <em>throw it away</em>. This page
          is reference only — the measurements behind it are in{" "}
          <Link href="/ppr" className="underline hover:text-ink">
            /ppr
          </Link>
          .
        </p>

        <p className="mt-4 max-w-3xl border-l-[3px] border-line pl-3 text-[14px] leading-relaxed text-ink-muted">
          <strong className="text-ink">The rule.</strong> What is expensive
          should be shared; what is personal should be cheap. Both ways of
          getting this wrong fail silently — no error, no warning, and a local
          server reports cache hits for all three.
        </p>
      </header>

      <section className="mt-7" aria-labelledby="directives-heading">
        <div id="directives-heading">
          <SectionHeading eyebrow="Where it is kept" title="The three directives">
            The only thing separating them is where the answer is stored. Pick by
            asking what the work depends on, not by how slow it is.
          </SectionHeading>
        </div>
        <div className="mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DIRECTIVES.map((card) => (
            <ApiCard key={card.name} card={card} />
          ))}
        </div>
      </section>

      <section className="mt-9" aria-labelledby="evidence-heading">
        <div id="evidence-heading">
          <SectionHeading
            eyebrow="Measured on Vercel"
            title="Why the first card carries a warning"
          >
            We deployed this project unchanged and the caching stopped working.
            Every panel that caches at request time went back to its full ~2s, on
            every request. Nothing errored and the local suite still passed.
          </SectionHeading>
        </div>

        <div className="mt-3 grid max-w-3xl grid-cols-1 items-start gap-3 md:grid-cols-2">
          {(
            [
              {
                label: '"use cache"',
                verdict: "six requests, six fresh renders",
                ok: false,
                rows: [
                  "03:15:47.208Z",
                  "03:15:49.988Z",
                  "03:15:54.326Z",
                  "03:15:57.329Z",
                  "03:16:00.315Z",
                  "03:16:03.085Z",
                ],
              },
              {
                label: '"use cache: remote"',
                verdict: "computed once, reused by all six",
                ok: true,
                rows: [
                  "03:35:35.538Z",
                  "03:35:35.538Z",
                  "03:35:35.538Z",
                  "03:35:35.538Z",
                  "03:35:35.538Z",
                  "03:35:35.538Z",
                ],
              },
            ] as const
          ).map((col) => (
            <div
              key={col.label}
              className="border border-line bg-surface-sunken p-3"
            >
              <p
                className={`font-mono text-[12px] font-bold ${
                  col.ok
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {col.label}
              </p>
              <ol className="mt-2 space-y-0.5 font-mono text-[12px] text-ink-muted">
                {col.rows.map((ts, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-ink-subtle">req {i + 1}</span>
                    <span className={col.ok ? "text-ink" : undefined}>{ts}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 border-t border-line pt-2 font-mono text-[12px] text-ink-subtle">
                {col.verdict}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-muted">
          The cache timestamp of one panel, read six times in a row: a value that
          holds still is a hit, one that moves is a miss. The build-time panels
          were unaffected — only work deferred to request time landed in a cold
          instance. <strong className="text-ink">The lesson:</strong> a local
          server reports cache hits production will not give you.
        </p>
      </section>

      <section className="mt-9" aria-labelledby="life-heading">
        <div id="life-heading">
          <SectionHeading
            eyebrow="How long it lives"
            title="cacheLife — three numbers, three different places"
          >
            The most common misreading is treating these as three lengths of the
            same thing. They are not: one governs the browser, one governs a
            background refresh, and one governs a blocking one.
          </SectionHeading>
        </div>

        <div className="mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          {LIFE_FIELDS.map((f) => (
            <article
              key={f.field}
              data-testid={`life-${f.field}`}
              className="relative border border-line bg-surface-raised p-4 pl-5"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px] bg-ink-subtle"
              />
              <h3 className="font-mono text-[13px] font-bold text-ink">
                {f.field}
              </h3>
              <p className="mt-1 font-mono text-[12px] uppercase tracking-wider text-ink-subtle">
                {f.where}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                {f.detail}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-4 border border-line bg-surface-raised p-4">
          <h3 className="font-mono text-[12px] font-bold uppercase tracking-wider text-ink-subtle">
            The seven built-in profiles
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["profile", "for", "stale", "revalidate", "expire"].map(
                    (h) => (
                      <th
                        key={h}
                        scope="col"
                        className="py-1.5 pr-4 font-mono text-[12px] font-medium uppercase tracking-wider text-ink-subtle"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {PROFILES.map(([name, use, stale, revalidate, expire]) => (
                  <tr key={name} className="border-b border-line last:border-0">
                    <th
                      scope="row"
                      className="py-1.5 pr-4 text-left font-mono text-[13px] font-bold text-ink"
                    >
                      {name}
                    </th>
                    <td className="py-1.5 pr-4 text-[14px] text-ink-muted">
                      {use}
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-[12px] text-ink-muted">
                      {stale}
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-[12px] text-ink-muted">
                      {revalidate}
                    </td>
                    <td className="py-1.5 font-mono text-[12px] text-ink-muted">
                      {expire}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
            Every profile shares the same 5-minute{" "}
            <code className="font-mono">stale</code> except{" "}
            <code className="font-mono">seconds</code> — the names describe how
            often the <em>server</em> rebuilds, not how the browser behaves. Pass
            an object instead of a name to set the three directly, and note that{" "}
            <code className="font-mono">default</code> applies whenever a cached
            scope calls no <code className="font-mono">cacheLife</code> at all.
          </p>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="tag-heading">
        <div id="tag-heading">
          <SectionHeading
            eyebrow="How you address it"
            title="cacheTag — the label you invalidate by"
          >
            Without a tag the only way to clear one entry is to clear the whole
            route. A tag is how you say &ldquo;just this one&rdquo; later.
          </SectionHeading>
        </div>
        <div className="mt-3">
          <ApiCard
            card={{
              name: "cacheTag(...tags)",
              subtitle: "Attaches one or more labels to a cache entry",
              wide: true,
              rows: [
                {
                  term: "Call from",
                  detail: (
                    <>
                      Inside a cached scope only — it has to be within the{" "}
                      <code className="font-mono">use cache</code> body whose
                      entry it is labelling.
                    </>
                  ),
                },
                {
                  term: "Build the tag from the key",
                  detail: (
                    <>
                      A tag can be computed:{" "}
                      <code className="font-mono">
                        cacheTag(`country-offer-${"${code}"}`)
                      </code>{" "}
                      gives one tag per country, so a change in India expires
                      India and leaves the rest warm.
                    </>
                  ),
                },
                {
                  term: "Limits",
                  detail: (
                    <>
                      256 characters per tag, 128 tags per entry, case-sensitive.
                    </>
                  ),
                },
                {
                  term: "Worth doing",
                  detail: (
                    <>
                      Keep every tag in one module — this project uses{" "}
                      <code className="font-mono">src/lib/cache-tags.ts</code> —
                      so the code that creates a tag and the code that expires it
                      cannot drift apart. A typo&apos;d tag string fails silently:
                      it just never matches anything.
                    </>
                  ),
                },
              ],
            }}
          />
        </div>
      </section>

      <section className="mt-9" aria-labelledby="clear-heading">
        <div id="clear-heading">
          <SectionHeading
            eyebrow="How you throw it away"
            title="Three ways to clear, and they are not interchangeable"
          >
            They differ on two axes: where you are allowed to call them, and
            whether the next visitor waits. Pick by asking who is waiting for the
            change.
          </SectionHeading>
        </div>
        <div className="mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CLEARING.map((card) => (
            <ApiCard key={card.name} card={card} />
          ))}
        </div>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-muted">
          Try all three against live cache entries in{" "}
          <Link href="/invalidate" className="underline hover:text-ink">
            /invalidate
          </Link>
          .
        </p>
      </section>

      <section className="mt-9" aria-labelledby="code-heading">
        <div id="code-heading">
          <SectionHeading
            eyebrow="All together"
            title="The same page, split three ways"
          >
            {snippet.point}
          </SectionHeading>
        </div>
        <p className="mt-3 font-mono text-[12px] text-ink-subtle">
          {snippet.file}
        </p>
        <div className="mt-1 max-w-4xl overflow-x-auto border border-line bg-surface-sunken">
          {/* Highlighted server-side by Shiki; the input is a constant in the
              repo, never user input. */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </section>
    </main>
  );
}
