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
 *
 * ## `decidedInProxy`, and why one page needs it
 *
 * On `/flags` the Server Action is enough: it writes the cookie, and returning
 * from an action re-renders the route, so the panels re-stream and read the new
 * value. Nothing else is required.
 *
 * On `/precomputed` that is not enough, and the reason is the whole point of
 * step 12. The variant there is decided in `proxy.ts`, **before** the render —
 * and proxy already ran on this request, with the *old* cookie, before the
 * action wrote the new one. Re-rendering would faithfully re-render the page
 * proxy picked a moment ago. The switcher would appear to do nothing, once.
 *
 * So that page asks for a fresh request afterwards, through proxy, with the
 * cookie now set. It is a second round trip and it is not free, which is why it
 * is opt-in rather than the default — on `/flags` it would be a wasted fetch
 * that also muddied the arrival timings the page exists to show.
 *
 * **A full document load, not `router.refresh()`, and that was measured.**
 * `refresh()` re-fetches the current URL, proxy rewrites it to a *different*
 * underlying route than the one already mounted, and the router mounts the new
 * tree beside the old one instead of replacing it: two `<main>` elements, two
 * heroes, two of this switcher. Verified in a browser — one of each before the
 * switch, two of each three seconds after.
 *
 * A rewritten route is the one case where "refresh this page" and "request this
 * URL again" are not the same operation, because what the URL resolves to can
 * change between them. Only a real navigation re-enters the routing decision.
 *
 * The cost is honest here rather than hidden: the page being loaded is
 * prerendered, so a full load is close to the cheapest thing this app can do.
 */
export function PersonaSwitcher({
  decidedInProxy = false,
}: {
  /** Re-request the page after switching, so proxy can decide again. */
  decidedInProxy?: boolean;
}) {
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
    startTransition(async () => {
      await (value ? setPersona(value) : clearPersona());
      // Inside the transition, so the control stays disabled until the new page
      // is on its way rather than flicking back to enabled first.
      if (decidedInProxy) window.location.reload();
    });
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
          {decidedInProxy ? "re-deciding…" : "re-streaming…"}
        </span>
      ) : null}
    </div>
  );
}
