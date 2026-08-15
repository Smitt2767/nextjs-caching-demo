/**
 * The four things a flag here is allowed to target on, and six personas for
 * switching between them by hand.
 *
 * Every one of them is request-time. None can be known at build. That is the
 * constraint the whole flags demo is built around — and, per RESEARCH-FLAGS.md
 * §4.2, it constrains where the *decision* is made, not where the page renders.
 */

import { COUNTRY_CODES, type CountryCode } from "@/lib/countries";

export const AUDIENCES = [
  "ad-anxiety",
  "ad-belonging",
  "organic",
  "corporate",
  "returning",
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const DEVICES = [
  "mobile",
  "low-end-mobile",
  "tablet",
  "desktop",
] as const;
export type Device = (typeof DEVICES)[number];

export const DAYPARTS = ["day", "evening", "night"] as const;
export type Daypart = (typeof DAYPARTS)[number];

/**
 * `id` is not a targeting dimension — it is the bucketing attribute, the thing
 * that gets hashed to pick a variant. It exists so the same visitor keeps the
 * same variant; nothing targets on it directly.
 */
export type Attributes = {
  id: string;
  audience: Audience;
  device: Device;
  country: CountryCode;
  daypart: Daypart;
};

export type Persona = {
  id: string;
  label: string;
  attributes: Omit<Attributes, "id">;
};

/**
 * Six personas rather than four independent controls.
 *
 * The dimensions are not independent in practice — "corporate network, on a
 * low-end phone, in India, at 3am" is a cell in a matrix, not a visitor — and
 * offering the full product would imply all 180 combinations are worth
 * inspecting. These six are the ones that make a point.
 */
export const PERSONAS: Persona[] = [
  {
    id: "anxiety-mobile-in",
    label: "Ad: Anxiety · Mobile · India",
    attributes: {
      audience: "ad-anxiety",
      device: "mobile",
      country: "IN",
      daypart: "day",
    },
  },
  {
    id: "belonging-desktop-uk",
    label: "Ad: Belonging · Desktop · UK",
    attributes: {
      audience: "ad-belonging",
      device: "desktop",
      country: "UK",
      daypart: "day",
    },
  },
  {
    id: "organic-lowend-in",
    label: "Organic · Low-end mobile · India · Evening",
    attributes: {
      audience: "organic",
      device: "low-end-mobile",
      country: "IN",
      daypart: "evening",
    },
  },
  {
    id: "anxiety-mobile-uk",
    label: "Ad: Anxiety · Mobile · UK",
    attributes: {
      audience: "ad-anxiety",
      device: "mobile",
      country: "UK",
      daypart: "day",
    },
  },
  {
    id: "corporate-desktop-us",
    label: "Corporate network · Desktop · US",
    attributes: {
      audience: "corporate",
      device: "desktop",
      country: "US",
      daypart: "day",
    },
  },
  {
    id: "returning-tablet-us-night",
    label: "Returning · Tablet · US · Night",
    attributes: {
      audience: "returning",
      device: "tablet",
      country: "US",
      daypart: "night",
    },
  },
];

export function findPersona(value: string | undefined): Persona | undefined {
  return PERSONAS.find((persona) => persona.id === value);
}

export function isPersonaId(value: string | undefined): boolean {
  return findPersona(value) !== undefined;
}

export function isAudience(value: string | undefined): value is Audience {
  return !!value && (AUDIENCES as readonly string[]).includes(value);
}

export function isDevice(value: string | undefined): value is Device {
  return !!value && (DEVICES as readonly string[]).includes(value);
}

export function isDaypart(value: string | undefined): value is Daypart {
  return !!value && (DAYPARTS as readonly string[]).includes(value);
}

export function isCountry(value: string | undefined): value is CountryCode {
  return !!value && (COUNTRY_CODES as readonly string[]).includes(value);
}
