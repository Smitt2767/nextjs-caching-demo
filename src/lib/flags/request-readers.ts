/**
 * The two request accessors, described structurally rather than by import.
 *
 * Everything that reads a cookie or a header in this project now has to work in
 * three places that do not share a runtime API:
 *
 *   - a Server Component, where the stores come from `next/headers`
 *   - `proxy.ts`, where `next/headers` does not exist and the stores hang off
 *     `NextRequest`
 *   - a `decide`/`identify` callback, where the Flags SDK hands over its own
 *     sealed read-only stores (`getEntities` in `flags/next`)
 *
 * All three expose the same two methods with the same shapes, so a structural
 * type is enough and no adapter layer is needed. Typing these by their real
 * classes would force one of the three to be converted at every call site.
 *
 * Deliberately narrow: `get` and nothing else. Widening this to the full
 * `Headers` interface would let a caller reach for `entries()` or `set()`,
 * neither of which the sealed SDK stores support.
 */

/** `Headers`, `ReadonlyHeaders`, and `NextRequest['headers']` all satisfy this. */
export type HeaderReader = {
  get(name: string): string | null | undefined;
};

/** `cookies()`, `ReadonlyRequestCookies` and `NextRequest['cookies']` all satisfy this. */
export type CookieReader = {
  get(name: string): { value: string } | undefined;
};

/** The pair, since nothing here ever wants one without the other. */
export type RequestReaders = {
  headers: HeaderReader;
  cookies: CookieReader;
};
