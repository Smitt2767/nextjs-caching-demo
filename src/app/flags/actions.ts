"use server";

import { cookies } from "next/headers";

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
