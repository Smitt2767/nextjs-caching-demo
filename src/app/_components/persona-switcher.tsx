"use client";

import { useState, useSyncExternalStore, useTransition } from "react";

import { clearPersona, setPersona } from "@/app/flags/actions";
import { ClientCookies } from "@/lib/client-cookies";
import { PERSONA_COOKIE } from "@/lib/flags/keys";
import { PERSONAS } from "@/lib/personas";

function readPersonaCookie(): string {
  return ClientCookies.get(PERSONA_COOKIE) ?? "";
}

/** The cookie emits no events, so there is nothing to subscribe to. */
const noSubscription = () => () => {};

/**
 * One control for all four targeting attributes.
 *
 * The current value is read from `document.cookie` after hydration rather than
 * passed in as a prop, and that is the point: taking it as a prop would mean
 * reading `cookies()` on the server, which drags this control out of the static
 * shell and behind a <Suspense> boundary. The switcher would then not exist
 * until after the thing it switches. A control should be there first.
 *
 * `useSyncExternalStore` rather than an effect — the server snapshot is the
 * empty string, so the prerendered HTML and the first client render agree, and
 * the real value is read once on hydration without a cascading re-render.
 */
export function PersonaSwitcher() {
  const stored = useSyncExternalStore(
    noSubscription,
    readPersonaCookie,
    () => "",
  );
  // Optimistic: the select reflects the choice immediately, before the action
  // has round-tripped and the cookie exists to be read back.
  const [chosen, setChosen] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = chosen ?? stored;

  function choose(value: string) {
    setChosen(value);
    startTransition(() => (value ? setPersona(value) : clearPersona()));
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-ink-subtle">persona:</span>
        <select
          value={current}
          disabled={isPending}
          onChange={(event) => choose(event.target.value)}
          data-testid="persona-select"
          className="max-w-[22rem] border border-line bg-surface-raised px-2 py-1.5 font-mono text-[13px] text-ink disabled:opacity-50"
        >
          <option value="">— derive from this request —</option>
          {PERSONAS.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.label}
            </option>
          ))}
        </select>
      </label>
      {isPending ? (
        <span className="font-mono text-[13px] text-red-500">
          re-streaming…
        </span>
      ) : null}
    </div>
  );
}
