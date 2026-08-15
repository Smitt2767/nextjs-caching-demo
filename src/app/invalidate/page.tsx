import Link from "next/link";

import {
  RevalidatePathButton,
  TagButtons,
} from "@/app/_components/invalidate-controls";
import { COUNTRY_TAGS, SHARED_TAGS } from "@/lib/cache-tags";

export const metadata = {
  title: "Invalidate caches",
  description:
    "Expire individual cache tags with updateTag, or the whole /ppr route with revalidatePath.",
};

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full border border-line bg-surface-raised p-5">
      <h4 className="text-[15px] font-semibold text-ink">{title}</h4>
      <p className="mt-1 mb-4 text-[13px] leading-relaxed text-ink-muted">
        {hint}
      </p>
      {children}
    </div>
  );
}

/**
 * Cache invalidation controls, grouped by the page they affect.
 *
 * One section per demo route, so adding a demo means adding a section rather
 * than reworking this page.
 */
export default function InvalidatePage() {
  return (
    <main className="flex w-full flex-1 flex-col gap-6 px-4 py-5">
      <header data-testid="invalidate-shell">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-mono text-[11px] text-ink-subtle hover:text-ink"
        >
          ← all demos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Invalidate caches
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-muted">
          Expire a single cache entry by tag, or throw away everything on a
          route. Then open the demo and watch which panels pay for their work
          again — the ones you did not invalidate keep their frozen timestamps.
        </p>
      </header>

      <section aria-labelledby="ppr-heading" className="flex flex-col gap-3">
        <div>
          <h2
            id="ppr-heading"
            className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle"
          >
            /ppr
          </h2>
          <p className="mt-1 text-[14px] text-ink-muted">
            <Link
              href="/ppr"
              data-testid="invalidate-ppr-demo-link"
              className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
            >
              Partial Prerendering &amp; use cache
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Group
            title="Single entry"
            hint={
              <>
                <code className="font-mono">updateTag(tag)</code> expires one
                entry immediately, so the next request waits for fresh data
                rather than being served the stale copy. Everything else on the
                page stays cached. Hover a button to see what it recomputes.
              </>
            }
          >
            <TagButtons tags={SHARED_TAGS} />
          </Group>

          <Group
            title="Per country"
            hint={
              <>
                The country caches are keyed by code, so each country has its
                own entries. Expiring <code className="font-mono">IN</code>{" "}
                leaves <code className="font-mono">US</code> and{" "}
                <code className="font-mono">UK</code> untouched — switch country
                on the demo to see it.
              </>
            }
          >
            <div className="space-y-3">
              {COUNTRY_TAGS.map(({ code, tags }) => (
                <div key={code}>
                  <p className="mb-1.5 font-mono text-[11px] font-bold text-ink">
                    {code}
                  </p>
                  <TagButtons tags={tags} />
                </div>
              ))}
            </div>
          </Group>

          <Group
            title="The whole route"
            hint={
              <>
                <code className="font-mono">
                  revalidatePath(&quot;/ppr&quot;)
                </code>{" "}
                drops every cached entry the route can reach, including ones you
                did not name. Per the docs it currently also refreshes other
                previously visited pages when you navigate back to them.
              </>
            }
          >
            <RevalidatePathButton />
          </Group>
        </div>

        <p className="text-[13px] leading-relaxed text-ink-subtle">
          One thing none of these touch: the sky{" "}
          <code className="font-mono">use cache: private</code> slot. It is held
          in your browser, not on the server, so no server-side invalidation can
          reach it — reload the page to clear it.
        </p>
      </section>
    </main>
  );
}
