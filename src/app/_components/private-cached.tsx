import { cacheLife } from "next/cache";
import { cookies } from "next/headers";

import { CachedCountryPanel } from "@/app/_components/component-cached";
import { OfferBody, StatusLine } from "@/app/_components/slot-body";
import {
  DEFAULT_COUNTRY,
  fetchCountryOffer,
  isCountryCode,
} from "@/lib/countries";
import { COUNTRY_COOKIE, resolveCountry } from "@/lib/geo";

/**
 * Everything inside one private scope: the cookie read, the 2000ms lookup and
 * the 400ms render.
 *
 * It works, and a client navigation reuses the whole thing with no loading
 * state. But nothing here is ever stored on the server, so the expensive half
 * is recomputed on every server render and cached separately for every visitor
 * — no two users share any of it.
 *
 * Compare with the wrapper below, which keeps the expensive half in a shared
 * server cache and puts only the per-user step in the private one.
 */
export async function PrivateEverythingCountrySlot() {
  "use cache: private";
  cacheLife({ stale: 300 });

  const raw = (await cookies()).get(COUNTRY_COOKIE)?.value;
  const code = isCountryCode(raw) ? raw : DEFAULT_COUNTRY;

  const offer = await fetchCountryOffer(code);
  const renderedAt = new Date().toISOString();

  return (
    <>
      <StatusLine
        timerId="private-all"
        status={
          <>
            rendered at{" "}
            <span data-testid="private-all-rendered-at">{renderedAt}</span>
          </>
        }
      />
      <OfferBody offer={offer} testId="private-all-slot" />
    </>
  );
}

/**
 * `use cache: private` on the wrapper — the part that reads the cookie.
 *
 * This is the pattern the directive is actually for. Group 2's violet slot has
 * to leave its cookie read *uncached*, because plain `use cache` cannot touch
 * runtime APIs: every request re-runs `resolveCountry()` before it can even
 * look up the cache. A private scope may read `cookies()`, so that step gets
 * cached too — per browser, which is the only place it could safely live,
 * since the answer differs per user.
 *
 * The expensive half stays exactly where it was. `CachedCountryPanel` is the
 * same `use cache: remote` component group 2 renders, unchanged: the 2000ms
 * lookup and 400ms render are still cached on the server and shared across
 * every user. Only the cheap, per-user cookie read moved into the private
 * cache.
 *
 * On the nesting rule: the docs say a remote cache cannot be nested inside a
 * private one. Returning the element is not nesting — it is not awaited here,
 * so React renders it once this private scope has already returned. Verified
 * to build and run.
 *
 * So the split is: private for what is per-user, shared `use cache` for what
 * is not. Nothing user-specific ends up in a server cache, and nothing
 * expensive gets duplicated per user.
 */
export async function PrivateComponentCountrySlot() {
  "use cache: private";
  cacheLife({ stale: 300 });

  // Allowed here, and nowhere else: `use cache` and `use cache: remote` both
  // forbid reading cookies inside the cached scope.

  const { code } = await resolveCountry();

  // The same `use cache` component group 2 uses — server-side and shared.
  return <CachedCountryPanel code={code} slot="private-component" />;
}
