import { cookies, headers } from "next/headers";

import {
  ANON_ID_COOKIE,
  AUDIENCE_COOKIE,
  DAYPART_HEADER,
  DEVICE_HEADER,
  PERSONA_COOKIE,
} from "@/lib/flags/keys";
import type { RequestReaders } from "@/lib/flags/request-readers";
import {
  findPersona,
  isAudience,
  isDaypart,
  isDevice,
  type Attributes,
} from "@/lib/personas";
import { resolveCountryFrom } from "@/lib/geo";

/** Where a value came from, so the page can show its provenance. */
export type AttributeSource =
  | "persona"
  | "proxy"
  | "cookie"
  | "geo"
  | "fallback";

export type ResolvedAttributes = {
  attributes: Attributes;
  sources: Record<keyof Attributes, AttributeSource>;
};

/**
 * Derive the targeting attributes from stores the caller already holds.
 *
 * Synchronous and free of `next/headers`, and that is what step 12 turns on.
 * `proxy.ts` has to reach the *same* attributes the render would, because it
 * decides the variant the render will be served — and it cannot call
 * `cookies()` or `headers()`. The Flags SDK's `identify` is in the same
 * position: it is handed sealed stores rather than being able to fetch its own
 * (`getEntities` in `flags/next`).
 *
 * So this is the single implementation and both paths go through it. Two
 * implementations would drift, and the symptom of the drift would be a visitor
 * routed to one variant by proxy and rendered another by the page — which looks
 * exactly like a caching bug and is not one.
 *
 * A persona cookie overrides everything. That is a demo affordance — the only
 * way to inspect five audiences from one browser — standing in for whatever a
 * real application derives from its own session.
 */
export function resolveAttributesFrom(
  readers: RequestReaders,
): ResolvedAttributes {
  const { headers: headerStore, cookies: cookieStore } = readers;

  const id = cookieStore.get(ANON_ID_COOKIE)?.value ?? "no-id";

  const persona = findPersona(cookieStore.get(PERSONA_COOKIE)?.value);
  if (persona) {
    return {
      attributes: { id, ...persona.attributes },
      sources: {
        id: "proxy",
        audience: "persona",
        device: "persona",
        country: "persona",
        daypart: "persona",
      },
    };
  }

  const storedAudience = cookieStore.get(AUDIENCE_COOKIE)?.value;
  const rawDevice = headerStore.get(DEVICE_HEADER) ?? undefined;
  const rawDaypart = headerStore.get(DAYPART_HEADER) ?? undefined;

  // Reuses /ppr's resolver rather than re-deriving country. It already handles
  // the preference-then-geo-header order, and two implementations would drift.
  const { code, source: countrySource } = resolveCountryFrom(readers);

  return {
    attributes: {
      id,
      audience: isAudience(storedAudience) ? storedAudience : "organic",
      device: isDevice(rawDevice) ? rawDevice : "desktop",
      country: code,
      daypart: isDaypart(rawDaypart) ? rawDaypart : "day",
    },
    sources: {
      id: "proxy",
      audience: isAudience(storedAudience) ? "cookie" : "fallback",
      device: isDevice(rawDevice) ? "proxy" : "fallback",
      daypart: isDaypart(rawDaypart) ? "proxy" : "fallback",
      country:
        countrySource === "preference"
          ? "cookie"
          : countrySource === "geo-header"
            ? "geo"
            : "fallback",
    },
  };
}

/**
 * Read this request's targeting attributes from `next/headers`.
 *
 * **Never call this inside a `use cache` or `use cache: remote` scope.** Both
 * forbid `cookies()` and `headers()`. Only `use cache: private` permits them,
 * and nothing here belongs in a per-visitor cache anyway.
 *
 * The shape that works is the one RND-NEXT-CACHE-001 §5.5 arrived at: read the
 * request data out here, evaluate, then pass the *decision* into the cached
 * scope as an argument. The cache then splits by variant rather than by person.
 */
export async function readAttributes(): Promise<ResolvedAttributes> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  return resolveAttributesFrom({ headers: headerStore, cookies: cookieStore });
}
