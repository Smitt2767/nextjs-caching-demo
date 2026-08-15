import { cookies, headers } from "next/headers";

import {
  ANON_ID_COOKIE,
  AUDIENCE_COOKIE,
  DAYPART_HEADER,
  DEVICE_HEADER,
  PERSONA_COOKIE,
} from "@/lib/flags/keys";
import {
  findPersona,
  isAudience,
  isDaypart,
  isDevice,
  type Attributes,
} from "@/lib/personas";
import { resolveCountry } from "@/lib/geo";

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
 * Read this request's targeting attributes.
 *
 * **Never call this inside a `use cache` or `use cache: remote` scope.** Both
 * forbid `cookies()` and `headers()`. Only `use cache: private` permits them,
 * and nothing here belongs in a per-visitor cache anyway.
 *
 * The shape that works is the one RND-NEXT-CACHE-001 §5.5 arrived at: read the
 * request data out here, evaluate, then pass the *decision* into the cached
 * scope as an argument. The cache then splits by variant rather than by person.
 *
 * A persona cookie overrides everything. That is a demo affordance — the only
 * way to inspect five audiences from one browser — standing in for whatever a
 * real application derives from its own session.
 */
export async function readAttributes(): Promise<ResolvedAttributes> {
  const cookieStore = await cookies();
  const headerStore = await headers();

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
  const { code, source: countrySource } = await resolveCountry();

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
