import { cookies } from "next/headers";
import { Suspense } from "react";

import { ANON_ID_COOKIE } from "@/lib/flags/keys";

export const metadata = {
  title: "Feature flags",
  description: "Feature flags and experiments under Cache Components.",
};

/**
 * Reads request data, so it can never be part of the static shell — hence the
 * <Suspense> boundary around it in the page below.
 */
async function VisitorId() {
  // Header first: on a visitor's first request the cookie exists only on the
  // response, so `cookies()` would come back empty exactly once per visitor.
  // Readable on the very first visit too, including the request that created
  // it — see the note at the end of `proxy.ts`.
  const id = (await cookies()).get(ANON_ID_COOKIE)?.value ?? null;

  if (!id) {
    return (
      <p className="font-mono text-[14px] text-red-500" data-testid="anon-id">
        no id — proxy did not run for this request
      </p>
    );
  }

  return (
    <p className="font-mono text-[14px] break-all text-ink" data-testid="anon-id">
      {id}
    </p>
  );
}

export default function FlagsPage() {
  return (
    <main className="w-full flex-1 px-4 py-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Feature flags &amp; experiments
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-muted">
          Building this one step at a time — see{" "}
          <code className="font-mono">FLAGS-PLAN.md</code>.
        </p>
      </header>

      <section className="mt-7 max-w-3xl border border-line bg-surface-raised p-5">
        <h2 className="font-mono text-[12px] font-medium uppercase tracking-wider text-ink-subtle">
          Step 1 · anonymous visitor id
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
          Minted in <code className="font-mono">proxy.ts</code> on your first
          visit and kept in a cookie. Everything an experiment does starts here:
          the variant you get is a hash of this string, so it has to be stable
          for you and different for everyone else.
        </p>

        <div className="mt-4 border-t border-line pt-3">
          <Suspense
            fallback={
              <p className="font-mono text-[14px] text-ink-subtle">reading…</p>
            }
          >
            <VisitorId />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
