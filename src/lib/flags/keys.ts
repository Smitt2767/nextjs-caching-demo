/**
 * Names shared between `proxy.ts` and the page.
 *
 * Their own module because proxy runs before the request reaches React and
 * cannot import `next/headers`, so anything both sides need has to live
 * somewhere neither of them owns.
 */

/** The anonymous visitor id. Minted in proxy — see the note in `src/proxy.ts`. */
export const ANON_ID_COOKIE = "demo-anon-id";

/** How long a visitor keeps their id, and so their experiment variant. */
export const ANON_ID_MAX_AGE_DAYS = 365;
