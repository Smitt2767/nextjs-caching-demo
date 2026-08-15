"use client";

import { useTransition } from "react";

import { setCountryPreference } from "@/app/actions";
import { COUNTRY_CODES, type CountryCode } from "@/lib/countries";

const LABELS: Record<CountryCode, string> = {
  IN: "🇮🇳 IN",
  US: "🇺🇸 US",
  UK: "🇬🇧 UK",
};

/**
 * Sets the country preference and re-renders the route. This lives in the
 * static shell — it ships with the prerendered HTML and needs no server data,
 * which is exactly why it can paint before the country is known.
 */
export function CountrySwitcher() {
  const [isPending, startTransition] = useTransition();

  function choose(code: CountryCode) {
    startTransition(() => setCountryPreference(code));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        preference:
      </span>
      {COUNTRY_CODES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          disabled={isPending}
          data-testid={`country-${code}`}
          className="border border-zinc-300 px-3 py-1 font-mono text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {LABELS[code]}
        </button>
      ))}
      {isPending ? (
        <span className="font-mono text-xs text-red-500">re-streaming…</span>
      ) : null}
    </div>
  );
}
