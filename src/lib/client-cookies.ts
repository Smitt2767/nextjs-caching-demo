/**
 * Reading and writing cookies from the browser.
 *
 * Named `ClientCookies`, not `Cookies`, because this codebase already imports
 * `cookies()` from `next/headers` — a different thing, on the other side of the
 * request. This one only ever touches `document.cookie`.
 *
 * **It cannot see `httpOnly` cookies.** That is the whole point of the flag,
 * and it is the first thing that trips people up: `demo-anon-id` is httpOnly,
 * so `ClientCookies.get("demo-anon-id")` returns `null` even though the cookie
 * is plainly there in DevTools. If the browser needs a value, the server has to
 * set it without `httpOnly` or hand it over as a prop.
 *
 * When to reach for it: state the browser owns and the server only needs on the
 * *next* request — a UI preference, a dismissed banner. When not to: anything
 * that should re-render the current page. Setting a cookie here does not tell
 * React anything happened, so a Server Action is usually the better tool.
 */

export type CookieOptions = {
  /** Defaults to `/`. Must match on `remove`, or the delete silently misses. */
  path?: string;
  domain?: string;
  /** Seconds. Takes precedence over `expires` where both are set. */
  maxAge?: number;
  expires?: Date;
  /** Defaults to `lax`. `none` is only honoured on a secure connection. */
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
};

export class ClientCookies {
  /** Static-only: there is one `document.cookie` and it is not an instance. */
  private constructor() {}

  /**
   * The decoded value, or `null` if absent — or if the cookie is `httpOnly`,
   * which is indistinguishable from absent here.
   */
  static get(name: string): string | null {
    // Guard rather than throw: a client component still renders on the server
    // during SSR, and a utility that explodes there is worse than one that
    // reports "no cookies yet".
    if (typeof document === "undefined") return null;

    const target = encodeURIComponent(name);

    for (const pair of document.cookie.split(";")) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;

      // Split on the first `=` only: a value may legitimately contain more.
      if (pair.slice(0, eq).trim() !== target) continue;

      try {
        return decodeURIComponent(pair.slice(eq + 1).trim());
      } catch {
        // A value written by something that did not encode it. Better to hand
        // back the raw bytes than to throw on a malformed cookie we did not
        // write.
        return pair.slice(eq + 1).trim();
      }
    }

    return null;
  }

  static set(name: string, value: string, options: CookieOptions = {}): void {
    if (typeof document === "undefined") return;

    const {
      path = "/",
      domain,
      maxAge,
      expires,
      sameSite = "lax",
      secure = sameSite === "none",
    } = options;

    // Encoded on the way out and decoded on the way in, so a value containing
    // `;` or `=` survives the round trip.
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

    parts.push(`path=${path}`);
    if (domain) parts.push(`domain=${domain}`);
    if (maxAge !== undefined) parts.push(`max-age=${Math.floor(maxAge)}`);
    if (expires) parts.push(`expires=${expires.toUTCString()}`);
    parts.push(`samesite=${sameSite}`);
    // `SameSite=None` is rejected outright without it.
    if (secure) parts.push("secure");

    document.cookie = parts.join("; ");
  }

  /**
   * Delete a cookie.
   *
   * `path` and `domain` must match the ones it was written with. There is no
   * way to ask the browser which those were, so a mismatch fails silently and
   * leaves the cookie in place — the single most common reason a "deleted"
   * cookie keeps coming back.
   */
  static remove(
    name: string,
    options: Pick<CookieOptions, "path" | "domain"> = {},
  ): void {
    ClientCookies.set(name, "", {
      ...options,
      // Both, deliberately: max-age is what modern browsers act on, and the
      // epoch date covers anything that ignores it.
      maxAge: 0,
      expires: new Date(0),
    });
  }
}
