"use client";

import { useActionState } from "react";

import {
  invalidateTagAction,
  revalidatePprAction,
  type InvalidateResult,
} from "@/app/invalidate/actions";
import type { TagDescriptor } from "@/lib/cache-tags";

function Receipt({
  state,
  pending,
}: {
  state: InvalidateResult;
  pending: boolean;
}) {
  if (pending) {
    return (
      <p className="mt-3 font-mono text-[12px] text-ink-subtle">working…</p>
    );
  }
  if (!state) return null;

  return (
    <p
      data-testid="invalidate-receipt"
      data-ok={state.ok}
      className={`mt-3 font-mono text-[12px] leading-relaxed ${
        state.ok ? "text-ink" : "text-red-600 dark:text-red-400"
      }`}
    >
      <span className="font-bold">{state.api}()</span> · {state.message}
    </p>
  );
}

/** One button per tag. Each posts its tag to the same Server Action. */
export function TagButtons({ tags }: { tags: TagDescriptor[] }) {
  const [state, formAction, pending] = useActionState(
    invalidateTagAction,
    null,
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <form key={t.tag} action={formAction}>
            <input type="hidden" name="tag" value={t.tag} />
            <button
              type="submit"
              disabled={pending}
              title={t.effect}
              data-testid={`invalidate-${t.tag}`}
              className="min-h-11 cursor-pointer border border-line bg-surface px-3 font-mono text-[12px] text-ink hover:border-ink-subtle disabled:opacity-50"
            >
              {t.label}
            </button>
          </form>
        ))}
      </div>
      <Receipt state={state} pending={pending} />
    </div>
  );
}

/** The blunt instrument: invalidate the entire route. */
export function RevalidatePathButton() {
  const [state, formAction, pending] = useActionState(
    revalidatePprAction,
    null,
  );

  return (
    <div>
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          data-testid="invalidate-ppr-path"
          className="min-h-11 cursor-pointer border border-red-500/50 bg-red-500/5 px-4 font-mono text-[12px] font-bold text-ink hover:border-red-500 disabled:opacity-50"
        >
          revalidatePath(&quot;/ppr&quot;)
        </button>
      </form>
      <Receipt state={state} pending={pending} />
    </div>
  );
}
