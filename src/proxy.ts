import { NextResponse, userAgent, type NextRequest } from "next/server";

import {
  ACCEPT_CH,
  ANON_ID_COOKIE,
  ANON_ID_MAX_AGE_DAYS,
  AUDIENCE_COOKIE,
  AUDIENCE_MAX_AGE_DAYS,
  DAYPART_HEADER,
  DEVICE_HEADER,
  classifyDevice,
  currentDaypart,
  readCapabilityHints,
} from "@/lib/flags/keys";
import { isAudience } from "@/lib/personas";

/**
 * Proxy — what Next.js 16 renamed Middleware to.
 *
 * Steps 1 and 2 of FLAGS-PLAN.md. Three jobs, and all three are here for the
 * same reason: they have to happen before the render, and a Server Component
 * cannot do them.
 *
 *   1. Mint the bucketing id. Only a Server Action, a Route Handler or this
 *      file may set a cookie; a component cannot, so a first-time visitor would
 *      otherwise reach the render with no id to hash.
 *   2. Derive device and daypart, and forward them as request headers. Same
 *      answer for the whole request, so computing them once at the edge of it
 *      beats doing it in whichever component happens to need them.
 *   3. Capture the campaign that brought them, before the URL loses it.
 *
 * The matcher is deliberately narrow. Proxy runs on every matched request,
 * including the prefetches Next fires for links in the viewport, so /ppr and
 * the index are left out entirely — their timings are the subject of the other
 * demo and should not pick up a new variable.
 */
export const config = {
  matcher: ["/flags", "/flags/:path*"],
};

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // `userAgent()` is ua-parser-js, bundled into Next — nothing to install.
  // It gives the device *type*; the Client Hints give its capability.
  const { device } = userAgent(request);
  const hints = readCapabilityHints((name) => request.headers.get(name));
  requestHeaders.set(DEVICE_HEADER, classifyDevice(device.type, hints));
  requestHeaders.set(DAYPART_HEADER, currentDaypart());

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Ask the browser to start sending capability hints. They are absent on this
  // first response by definition, so a brand-new visitor is classified from the
  // User-Agent alone and refined from the second request onwards.
  response.headers.set("Accept-CH", ACCEPT_CH);

  // Measured, because it is not obvious: a cookie set here is readable by
  // `cookies()` during *this same* request's render — Next merges it into the
  // request's cookie store before the component runs. So neither of the two
  // cookies below needs to be forwarded as a header as well, and a visitor
  // arriving on a campaign link sees the effect on that first page view rather
  // than the second. Verified against `next start`; re-check on the deployment
  // at step 10.

  if (!request.cookies.get(ANON_ID_COOKIE)?.value) {
    response.cookies.set(ANON_ID_COOKIE, crypto.randomUUID(), {
      path: "/",
      maxAge: 60 * 60 * 24 * ANON_ID_MAX_AGE_DAYS,
      sameSite: "lax",
      // No client code reads this, and an id JavaScript cannot touch is one
      // fewer thing an injected script can rewrite to move someone between
      // experiment variants.
      httpOnly: true,
    });
  }

  const incoming = request.nextUrl.searchParams.get("utm_campaign") ?? undefined;
  if (
    isAudience(incoming) &&
    incoming !== request.cookies.get(AUDIENCE_COOKIE)?.value
  ) {
    response.cookies.set(AUDIENCE_COOKIE, incoming, {
      path: "/",
      maxAge: 60 * 60 * 24 * AUDIENCE_MAX_AGE_DAYS,
      sameSite: "lax",
      httpOnly: true,
    });
  }

  return response;
}
