"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";

import {
  exposureTags,
  readCounts,
  resetCounts,
  serveVisitor,
} from "@/lib/flags/exposure";
import { PERSONA_COOKIE } from "@/lib/flags/keys";
import { isPersonaId } from "@/lib/personas";

/**
 * Pin all four targeting attributes to a named persona.
 *
 * A demo affordance, not a pattern to copy — it is the only way to inspect five
 * audiences from one browser. Returning from a Server Action re-renders the
 * route, so the attributes panel re-streams with the new values.
 */
export async function setPersona(id: string) {
  if (!isPersonaId(id)) return;

  (await cookies()).set(PERSONA_COOKIE, id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    // Readable by the switcher, which reflects the current selection without
    // reading cookies() on the server — see the note in persona-switcher.tsx.
    httpOnly: false,
  });
}

/** Go back to deriving the attributes from the request itself. */
export async function clearPersona() {
  (await cookies()).delete(PERSONA_COOKIE);
}

/**
 * Run N simulated visitors through both exposure paths and report the counts.
 *
 * Sequential, deliberately. Fired in parallel, several visitors reach the same
 * cold cache entry before the first one fills it, so the broken path records a
 * handful of extra exposures — a real stampede, and a real thing to know about,
 * but it blurs the number this demo exists to show. One at a time gives the
 * floor: exactly one exposure per cache entry.
 */
export async function runExposureProbe(visitors: number) {
  const n = Math.min(Math.max(Math.trunc(visitors) || 0, 1), 200);

  for (let i = 0; i < n; i++) {
    await serveVisitor(`probe-${Date.now()}-${i}`);
  }

  return readCounts();
}

/**
 * Clear the counters *and* the cached renders.
 *
 * Both, or the second run is not a repeat of the first: with the entries still
 * warm the broken path records zero exposures rather than one per variant,
 * which overstates the bug instead of demonstrating it.
 */
export async function resetExposureProbe() {
  resetCounts();
  for (const tag of exposureTags()) updateTag(tag);
  return readCounts();
}
