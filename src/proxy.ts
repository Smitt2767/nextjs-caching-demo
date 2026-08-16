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
import { precomputeCode } from "@/lib/flags/precompute";
import { isAudience } from "@/lib/personas";

/** The route whose variants are prerendered. See `precompute.ts`. */
const PRECOMPUTED_PATH = "/precomputed";

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
 * Step 12 adds a fourth job, and it is the only one that changes what gets
 * served rather than what the render can see:
 *
 *   4. Decide the precomputed flags and rewrite `/precomputed` to the prebuilt
 *      page for that combination. See `precompute.ts` for why the decision has
 *      to happen here rather than in the page.
 *
 * The matcher is deliberately narrow. Proxy runs on every matched request,
 * including the prefetches Next fires for links in the viewport, so /ppr and
 * the index are left out entirely — their timings are the subject of the other
 * demo and should not pick up a new variable.
 */
export const config = {
  matcher: ["/flags", "/flags/:path*", "/precomputed", "/precomputed/:path*"],
};

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // `userAgent()` is ua-parser-js, bundled into Next — nothing to install.
  // It gives the device *type*; the Client Hints give its capability.
  const { device } = userAgent(request);
  const hints = readCapabilityHints((name) => request.headers.get(name));
  requestHeaders.set(DEVICE_HEADER, classifyDevice(device.type, hints));
  requestHeaders.set(DAYPART_HEADER, currentDaypart());

  // Measured, because it is not obvious: a cookie set here is readable by
  // `cookies()` during *this same* request's render — Next merges it into the
  // request's cookie store before the component runs. So neither of the two
  // cookies below needs to be forwarded as a header as well, and a visitor
  // arriving on a campaign link sees the effect on that first page view rather
  // than the second. Verified against `next start`; re-check on the deployment
  // at step 10.
  //
  // Both are written to `request.cookies` as well as to the response, and step
  // 12 is why. The render sees a proxy-set cookie for free, but `precomputeCode`
  // below runs *here* and reads the request directly — so without this a
  // first-time visitor would be bucketed on the `no-id` fallback and then
  // rendered under their real new id. One visitor, two variants, on the one
  // request where nobody would think to look.
  const newCookies: { name: string; value: string; maxAgeDays: number }[] = [];

  if (!request.cookies.get(ANON_ID_COOKIE)?.value) {
    newCookies.push({
      name: ANON_ID_COOKIE,
      value: crypto.randomUUID(),
      maxAgeDays: ANON_ID_MAX_AGE_DAYS,
    });
  }

  const incoming = request.nextUrl.searchParams.get("utm_campaign") ?? undefined;
  if (
    isAudience(incoming) &&
    incoming !== request.cookies.get(AUDIENCE_COOKIE)?.value
  ) {
    newCookies.push({
      name: AUDIENCE_COOKIE,
      value: incoming,
      maxAgeDays: AUDIENCE_MAX_AGE_DAYS,
    });
  }

  for (const { name, value } of newCookies) request.cookies.set(name, value);

  const response = await buildResponse(request, requestHeaders);

  // Ask the browser to start sending capability hints. They are absent on this
  // first response by definition, so a brand-new visitor is classified from the
  // User-Agent alone and refined from the second request onwards.
  response.headers.set("Accept-CH", ACCEPT_CH);

  for (const { name, value, maxAgeDays } of newCookies) {
    response.cookies.set(name, value, {
      path: "/",
      maxAge: 60 * 60 * 24 * maxAgeDays,
      sameSite: "lax",
      // No client code reads these, and an id JavaScript cannot touch is one
      // fewer thing an injected script can rewrite to move someone between
      // experiment variants.
      httpOnly: true,
    });
  }

  return response;
}

/**
 * Pass the request through, or rewrite it to a prebuilt variant.
 *
 * Only an exact `/precomputed` is rewritten. `/precomputed/<code>` is left
 * alone so the rewrite target stays directly reachable — useful for confirming
 * by hand that a given code renders the variant it claims to, and harmless
 * because an unsigned or unknown code is rejected by `getPrecomputed` rather
 * than trusted.
 *
 * The browser URL never changes: a rewrite is served from a different path
 * without the client being told, which is the entire reason this is a rewrite
 * and not a redirect. A redirect would cost a round trip and would put the
 * variant in the address bar, where it would be shared, bookmarked, and pasted
 * into bug reports by people who then could not reproduce anything.
 */
async function buildResponse(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse> {
  const isPrecomputedRoot =
    request.nextUrl.pathname === PRECOMPUTED_PATH ||
    request.nextUrl.pathname === `${PRECOMPUTED_PATH}/`;

  if (!isPrecomputedRoot) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // `requestHeaders`, not `request.headers`: device and daypart were derived a
  // few lines above and exist only on the copy. Reading the original here would
  // bucket on the fallbacks while the render used the real values.
  const code = await precomputeCode({
    headers: requestHeaders,
    cookies: request.cookies,
  });

  const target = new URL(`${PRECOMPUTED_PATH}/${code}`, request.nextUrl);
  target.search = request.nextUrl.search;

  return NextResponse.rewrite(target, { request: { headers: requestHeaders } });
}
