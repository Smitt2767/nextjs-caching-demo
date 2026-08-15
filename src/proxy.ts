import { NextResponse, type NextRequest } from "next/server";

import { ANON_ID_COOKIE, ANON_ID_MAX_AGE_DAYS } from "@/lib/flags/keys";

/**
 * Proxy — what Next.js 16 renamed Middleware to.
 *
 * Step 1 of FLAGS-PLAN.md: give every visitor a stable random id.
 *
 * This has to be proxy and cannot be a page. An experiment picks your variant
 * by hashing an id, so a first-time visitor needs one before anything renders —
 * and a Server Component cannot set a cookie during render. Only a Server
 * Action, a Route Handler, or this file can.
 *
 * The matcher is deliberately narrow. Proxy runs on every matched request,
 * including the prefetches Next fires for links in the viewport, so /ppr and
 * the index page are left out of it entirely — their timings are the subject of
 * the other demo and should not pick up a new variable.
 */
export const config = {
  matcher: ["/flags", "/flags/:path*"],
};

export function proxy(request: NextRequest) {
  const existingId = request.cookies.get(ANON_ID_COOKIE)?.value;

  // Already has one: nothing to do. Re-setting an unchanged cookie on every
  // request is wasted bytes and makes Set-Cookie useless as a debugging signal.
  if (existingId) return NextResponse.next();

  const response = NextResponse.next();

  response.cookies.set(ANON_ID_COOKIE, crypto.randomUUID(), {
    path: "/",
    // 365 days.
    maxAge: 60 * 60 * 24 * ANON_ID_MAX_AGE_DAYS,
    sameSite: "lax",
    // No client-side code needs to read this, and an id that JavaScript cannot
    // touch is one fewer thing an injected script can rewrite to move someone
    // between experiment variants.
    httpOnly: true,
  });

  // Measured, because it is not obvious: a cookie set here is readable by
  // `cookies()` during *this same* request's render. Next merges it into the
  // request's cookie store before the component runs, so there is no need to
  // also forward the value as a request header. Verified locally against
  // `next start`; re-check on the deployment at step 9.
  return response;
}
