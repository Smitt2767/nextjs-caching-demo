import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";

import { catalogKillSwitch, heroCopy, pricingBadge } from "@/lib/flags/sdk";

/**
 * Listed explicitly rather than as `import * as flags`.
 *
 * `getProviderData` accepts a record of flags, and a namespace import hands it
 * every export — including the helpers beside them, which are not flags and do
 * not typecheck as any. Naming them also means a new flag is listed here on
 * purpose rather than by accident.
 */
const flags = { catalogKillSwitch, pricingBadge, heroCopy };

/**
 * The Flags SDK discovery endpoint.
 *
 * Lists every flag declared in `sdk.ts` — key, description, type, declared
 * options and its GrowthBook deep link — so the Vercel Toolbar can render the
 * Flags Explorer. That panel is the point of this route: it lets you override
 * any flag on a deployed preview, for your browser only, without touching
 * GrowthBook and without a redeploy. Overriding a flag in GrowthBook changes it
 * for everybody; this changes it for you.
 *
 * Reads the flag *declarations*, never their values, so nothing here evaluates
 * anything or touches the ruleset.
 *
 * Requires `FLAGS_SECRET` — a 32-byte base64url string, generated with:
 *
 *     node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
 *
 * **A plain `curl` gets 401 even when this is configured correctly**, which
 * costs an afternoon if you do not know it. `verifyAccess` wants an encrypted
 * JWE carrying the purpose `proof`, minted by the Vercel Toolbar — not the
 * secret itself, so sending `FLAGS_SECRET` as a bearer token is still rejected.
 * `createAccessProof()` from `flags` mints a valid one for testing by hand.
 *
 * Either way 401 is the right answer to an unauthenticated request: the
 * response describes the app's entire flag surface.
 */
export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData(flags),
);
