"use server";

import { cookies } from "next/headers";

import { isCountryCode } from "@/lib/countries";
import { COUNTRY_COOKIE } from "@/lib/geo";

/**
 * Store the country preference. Returning from a Server Action re-renders the
 * route, so the country slot re-streams — while the `use cache` catalog above
 * it stays a cache hit, which is the contrast the demo is making.
 */
export async function setCountryPreference(code: string) {
  if (!isCountryCode(code)) return;

  (await cookies()).set(COUNTRY_COOKIE, code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
