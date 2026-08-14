"use server";

import { revalidatePath, updateTag } from "next/cache";

import { ALL_PPR_TAGS } from "@/lib/cache-tags";

export type InvalidateResult = {
  ok: boolean;
  api: string;
  message: string;
  at: string;
} | null;

function result(ok: boolean, api: string, message: string): InvalidateResult {
  return { ok, api, message, at: new Date().toISOString() };
}

/**
 * Expire one cache tag.
 *
 * `updateTag` rather than `revalidateTag`: it expires the entry immediately, so
 * the next request *waits* for fresh data instead of being served the stale
 * copy while it recomputes. That is what you want when you have just pressed a
 * button and expect to see the effect. It is also Server-Action-only —
 * calling it from a Route Handler throws, which is why this lives here.
 *
 * `revalidateTag(tag, 'max')` would be the choice for stale-while-revalidate:
 * the old value keeps being served until the new one is ready.
 */
export async function invalidateTagAction(
  _prev: InvalidateResult,
  formData: FormData,
): Promise<InvalidateResult> {
  const tag = String(formData.get("tag") ?? "");

  // Validate against the known list rather than expiring whatever arrives:
  // a Server Action is a public endpoint, and this one would otherwise let a
  // caller expire any tag in the app.
  if (!ALL_PPR_TAGS.includes(tag)) {
    return result(false, "updateTag", `Unknown tag: ${tag || "(empty)"}`);
  }

  updateTag(tag);

  return result(
    true,
    "updateTag",
    `Expired "${tag}". The next request to /ppr recomputes just that entry.`,
  );
}

/**
 * Invalidate the whole route.
 *
 * Blunter than a tag: every cached entry reachable from /ppr goes, including
 * ones you did not name. Note the documented caveat — in a Server Function
 * this currently also causes previously visited pages to refresh when you
 * navigate back to them, not only /ppr.
 */
export async function revalidatePprAction(
  _prev: InvalidateResult,
  _formData: FormData,
): Promise<InvalidateResult> {
  revalidatePath("/ppr");

  return result(
    true,
    "revalidatePath",
    'Invalidated "/ppr". Every cached entry on the page recomputes on the next visit.',
  );
}
