# Feature flags & experiments — build plan

One step at a time. Each step builds **one thing**, configures GrowthBook **only
if that step needs it**, and ends with a test you can actually run.

Do not skip ahead. If a test fails, we fix it before starting the next step.

**Background reading (optional):** `RESEARCH-FLAGS.md` explains why the plan is
shaped this way. You don't need it to follow along.

---

## The 12 steps

**All twelve done.** Step 4 landed as a button *and*, eventually, a webhook —
the free plan has no **SDK** webhook slot to spare, but Event Webhooks are a
separate system with a separate limit. Findings are in `RESEARCH-FLAGS.md`
§13.1; five of them were build-breaking surprises worth reading first.

| # | Step | GrowthBook needed? | |
| --- | --- | --- | --- |
| 1 | Anonymous visitor ID | no | ✅ |
| 2 | Targeting attributes + persona switcher | no | ✅ |
| 3 | Connect GrowthBook, one simple flag | **yes** — first setup | ✅ |
| 4 | Invalidate the ruleset on demand | **yes** — event webhook | ✅ |
| 5 | Targeting: a flag that varies by country | **yes** — small | ✅ |
| 6 | First experiment: 3 variants | **yes** — small | ✅ |
| 7 | Move every flag onto the Flags SDK | no | ✅ |
| 8 | Cache the variant | no | ✅ |
| 9 | The exposure counter | no | ✅ |
| 10 | Deploy and measure on Vercel | no | ✅ |
| 11 | Per-user entitlement flag | **yes** — small | ✅ |
| 12 | Precompute (build-time variants) | no | ✅ |

Steps 1–2 need no GrowthBook at all, so we can start immediately.

Everything below is measured against a local production build unless it says
otherwise. Steps 8–11 were re-measured on Vercel (§13.1 M12, M13); **step 12 has
not been**, and this project's own §5.3 says that is not the same thing as
working.

---

## Step 1 — Anonymous visitor ID

**Goal.** Give every visitor a stable random ID stored in a cookie.

**Why first.** An experiment picks your variant by hashing an ID. No ID, no
experiment. And a page component *cannot* set a cookie while rendering — only
`proxy.ts` (Next.js 16's new name for middleware) can. So this has to exist
before anything else.

**GrowthBook:** nothing.

**Code:**

- `src/proxy.ts` — if the visitor has no `demo-anon-id` cookie, create one and
  set it. Scoped to `/flags/*` only, so `/ppr` is untouched.

**Test:**

- [ ] Open `/flags` → a `demo-anon-id` cookie exists in DevTools → Application
- [ ] Reload → the ID is the **same**
- [ ] Open an incognito window → a **different** ID

**Done when:** the ID survives a reload and differs between browsers.

---

## Step 2 — Targeting attributes + persona switcher

**Goal.** Work out the four things we'll target on, and add a dropdown to fake
them.

The four attributes:

| Attribute | Values | Where it comes from |
| --- | --- | --- |
| `audience` | ad-anxiety, ad-belonging, organic, corporate, returning | `?utm_campaign=`, saved to a cookie |
| `device` | mobile, low-end-mobile, tablet, desktop | User-Agent header |
| `country` | IN, US, UK | geo header, or the existing country cookie |
| `daypart` | day, evening, night | the server clock |

**Why a persona dropdown.** You can't test five audiences from one browser
otherwise. Six presets, matching your original list with country instead of city.

**GrowthBook:** nothing yet. We're only collecting the values.

**Code:**

- `src/lib/personas.ts` — the four attribute lists and six personas
- `src/proxy.ts` — add User-Agent → device, and the daypart clock
- `src/lib/flags/attributes.ts` — read everything into one object
- `src/app/flags/page.tsx` — a new page showing the resolved attributes
- `src/app/_components/persona-switcher.tsx` — the dropdown

**Test:**

- [ ] `/flags` shows all five values (ID + the four attributes)
- [ ] Pick "Corporate network · Desktop · US" → audience becomes `corporate`
- [ ] Pick "— derive from this request —" → it goes back to reading your real
      browser and location
- [ ] Visit `/flags?utm_campaign=ad-anxiety` → audience becomes `ad-anxiety` and
      **stays** after you navigate away and back

**Done when:** the dropdown changes all four values and the UTM one sticks.

---

## Step 3 — Connect GrowthBook, one simple flag

**Goal.** Read one on/off flag from GrowthBook and show it on the page.

This is the biggest configuration step. Everything after it is small.

### 3a. GrowthBook setup

**Environments**

- [ ] Open **SDK Configuration → Environments**
- [ ] Confirm `production` exists (it ships built in)

Point your Vercel preview deployments at `production` too. Using a different
ruleset for previews means the numbers you measure there don't mean anything.

**One attribute**

- [ ] Open **SDK Connections → Attributes**
- [ ] Create `id` — Data Type **String**, and tick **Identifier**
- [ ] Leave Projects empty (empty = all projects)

The Identifier tick is what makes an attribute usable for experiment assignment.
Without it, step 6 won't let you pick `id` as the hash attribute. We'll add the
other four attributes in step 5 — they aren't needed yet.

**One feature**

- [ ] Go to the **Features** section, create a feature
- [ ] Key: `catalog-kill-switch` — **keys cannot be renamed later**, so paste it
- [ ] Feature Type: **Boolean**
- [ ] Default Value: `true`
- [ ] Add **no rules at all**
- [ ] Enable it in `production`

No rules is deliberate. With no targeting the answer is the same for everyone,
which means it can be computed at build time and cost nothing at request time.
If you later want to target it, make a different flag instead.

**SDK connection**

- [ ] Open **SDK Configuration → SDK Connections**
- [ ] A connection for `production` probably already exists from the Vercel
      integration — if not, create one, SDK language **JavaScript**
- [ ] Copy the **Client Key** (starts with `sdk-`)
- [ ] Note the API host — GrowthBook Cloud is `https://cdn.growthbook.io`
- [ ] Leave **Encryption** off and **Remote Evaluation** off

Encryption only protects the ruleset from people reading your browser's network
tab; we fetch it server-side so it buys nothing here. Remote Evaluation turns
every flag check into a network call, which is the exact opposite of what this
project is testing.

**Environment variables**

The code will read these names:

```
GROWTHBOOK_CLIENT_KEY      required
GROWTHBOOK_API_HOST        optional, defaults to https://cdn.growthbook.io
```

**Resolved:** the Vercel integration provisions `GROWTHBOOK_CLIENT_KEY` under
exactly that name, so nothing needed aliasing. It also provisions
`EXPERIMENTATION_CONFIG`, which is the **Vercel Edge Config** connection string —
GrowthBook syncs the ruleset into Edge Config, and the code now prefers it, with
the CDN as fallback. Both paths are verified.

Two things that cost time, worth knowing:

- The name is `EXPERIMENTATION_CONFIG`, not the
  `GROWTHBOOK_EDGE_CONNECTION_STRING` the adapter docs mention.
- The connection string ends in `?token=…`, but that query parameter is
  **rejected** by the REST endpoint — it wants `Authorization: Bearer`. The
  `@vercel/edge-config` client handles this; raw `curl` against the string as
  provisioned returns 401.

### 3b. Check it before writing any code

```bash
curl -s "https://cdn.growthbook.io/api/features/YOUR_CLIENT_KEY" | jq '.features | keys'
```

You should see `["catalog-kill-switch"]`.

**If it's missing:** the feature is disabled for that environment. A disabled
feature is left out of the response entirely — it doesn't come back as `false`.
Check the environment toggle before you check anything else.

### 3c. Code

- `src/lib/flags/ruleset.ts` — fetch the payload, wrapped in `use cache`
- `src/lib/flags/evaluate.ts` — ruleset + attributes → a value
- `src/app/flags/page.tsx` — show whether the flag is on

**Test:**

- [ ] `/flags` shows `catalog-kill-switch: ON`
- [ ] Turn it off in GrowthBook, press `growthbook-payload` on `/invalidate`,
      reload → shows `OFF`
- [ ] The flag value appears in the page's HTML source (View Source, not
      DevTools) — proving it was baked in, not fetched by the browser

The ruleset is cached for hours, so the change does **not** appear on its own —
that is step 4. Don't shorten the cache to compensate: anything under five
minutes makes the value ineligible for the static shell and fails the build with
an error that names something else entirely.

**Done when:** flipping the toggle and invalidating changes the page.

---

## Step 4 — Faster flag changes ✅

**Goal.** Cut the wait between flipping a flag and seeing it.

**Outcome: a button on `/invalidate`, and an Event Webhook that presses it for
you.** The webhook took two attempts to find, because the obvious slot really is
blocked and the working one is a different feature entirely.

### What blocked the obvious route

GrowthBook's free plan allows **one SDK webhook per organisation**. Not per
connection — creating a second SDK Connection gets you a second slot in the UI
and the same `your webhook limit has been reached` error when you use it. The one
slot is already taken by **Vercel's Edge Config sync**, which is itself an SDK
webhook (`Managed by Vercel`), and giving it up would leave Edge Config stale
forever.

- **Global SDK Webhooks** — self-hosted GrowthBook only, not Cloud. No help.

### What actually worked: Event Webhooks

**SDK Configuration → Event Webhooks** is a separate system with its own limit,
and that slot was free. It is enough here for a reason worth stating: an SDK
webhook pushes the *ruleset payload*, an event webhook sends only a
*notification*, and this handler never reads the payload. It needs to be told
that something changed; Edge Config keeps doing the payload sync it was always
doing.

Pointed at the route as-is it returned `400 missing signature headers`, because
the two systems do not sign the same way:

| | SDK Webhook | Event Webhook |
| --- | --- | --- |
| headers | `webhook-id`, `webhook-timestamp`, `webhook-signature` | `X-GrowthBook-Signature` |
| signed | `id.timestamp.body` | the raw body alone |
| digest | base64 | hex |
| secret | yours | GrowthBook\'s, `ewhk_`-prefixed |

Both paths are now in the route, chosen by which header arrived rather than by
configuration. The event secret has its own variable,
`GROWTHBOOK_EVENT_WEBHOOK_SECRET`, so the two schemes cannot be handed each
other\'s secret and fail with a signature error that looks like tampering.

**Set the events filter to `feature.*` *and* `experiment.*`.** `feature.*` alone
misses experiment edits, and the ruleset payload contains experiments — so a
change to `hero-copy`\'s experiment rule would notify nobody.

**`webhook.test` is acknowledged without invalidating.** The point of the test
button is to confirm the URL and the signature; a test that quietly expired
production\'s cache would be a surprising thing for it to do.

**⚠️ There is a race with Edge Config, and it is unmeasured.** A flag change
fires both webhooks at once: the SDK one tells Vercel to update Edge Config
(seconds), the event one tells us to invalidate (immediate). If our refetch
beats the Edge Config write we re-read the **old** payload and cache it for
another hour — the invalidation making things worse rather than better.
`revalidateTag(tag, "max")` softens it, since nobody waits on the refetch, but
the window is real. Symptom: "changed a flag, webhook went green, page still
shows the old value." The `/invalidate` button remains the reliable override.

### What we did instead

The ruleset keeps a normal `cacheLife("hours")` and gets a
`growthbook-payload` button on `/invalidate`, alongside the existing /ppr tags.

Shortening the cache to poll instead was the obvious alternative and is the
wrong trade here: it means polling a service that changes a few times a week,
and it blurs exactly the thing this project measures. An explicit button is also
a better demo — the moment the value changes is a moment you chose.

`/flags` carries a note pointing at it, because "I changed the flag and nothing
happened" is otherwise indistinguishable from a bug.

### The handler

`src/app/api/growthbook-webhook/route.ts`. Point an **Event Webhook** at
`/api/growthbook-webhook` and put its `ewhk_…` secret in
`GROWTHBOOK_EVENT_WEBHOOK_SECRET`. It expires the same tag the button does.

For an **SDK** webhook, should a slot ever free up: format **Standard (no SDK
payload)**, secret in `GROWTHBOOK_WEBHOOK_SECRET`. That path follows Standard
Webhooks — HMAC-SHA256 over `{id}.{timestamp}.{body}`,
base64, against the `v1,`-prefixed header — with two deliberate departures from
GrowthBook's documented sample:

- `timingSafeEqual` **throws** on a length mismatch, so their example turns a
  forged signature into a 500 rather than a 401. Length is checked first.
- The header can carry several space-separated signatures, which is how the spec
  supports rotating a secret without dropping deliveries. Any match passes.

Plus a five-minute timestamp tolerance, without which a captured request stays
replayable forever.

Event Webhooks sign the body alone, so there is **no timestamp in the signed
material** and a captured delivery stays valid indefinitely. Nothing in the
route can detect that replay. It is tolerable only because of what a replay can
do here: mark one cache tag stale — idempotent, one ruleset read, reveals
nothing. An endpoint that did anything else would need a better scheme.

**Verified locally** by computing signatures by hand. SDK path: valid 200,
forged 401, wrong-length 401, tampered body 401, ten-minute replay 400, missing
headers 400, rotation pair 200 — and behaviourally, four requests before the
webhook produced zero ruleset re-reads, three after produced two. Event path:
valid signature 200 (`webhook.test` acknowledged with `revalidated: null`,
`feature.updated` with `revalidated: growthbook-payload`), forged 401, absent
headers 400 — the last reproducing the original failure exactly.

**Test:**

- [ ] Flip `catalog-kill-switch` in GrowthBook
- [ ] Reload `/flags` → still the old value (the cache is working)
- [ ] Press `growthbook-payload` on `/invalidate`
- [ ] Reload `/flags` → the new value

**Done when:** a flag flip appears without a deploy.

---

## Step 5 — Targeting: a flag that varies by country

**Goal.** Prove attributes actually reach GrowthBook and change the answer.

**GrowthBook:**

- [ ] **SDK Connections → Attributes**, add the remaining four:

| Attribute | Data Type | Identifier? | Values |
| --- | --- | --- | --- |
| `audience` | Enum | No | ad-anxiety, ad-belonging, organic, corporate, returning |
| `device` | Enum | No | mobile, low-end-mobile, tablet, desktop |
| `country` | Enum | No | IN, US, UK |
| `daypart` | Enum | No | day, evening, night |

Use **Enum**, not String — it turns the targeting UI into a dropdown, and a typo
in a targeting condition fails silently rather than erroring.

Only three countries, because `src/lib/countries.ts` defines exactly IN, US, UK.
Match the code, not the plan.

Attribute *values* never leave your server. GrowthBook stores only the list of
attribute names and types.

- [ ] Create a feature, key `pricing-badge`
- [ ] Type: **Boolean**, Default Value: `false`
- [ ] Add a rule: **Forced Value**, condition `country` is in `IN`, `UK` →
      force `true`
- [ ] Enable in `production`

**Code:**

- `src/lib/flags/attributes.ts` — read the four attributes off the request
- `src/lib/flags/sdk.ts` — `pricingBadge`, with `identify`
- `src/app/_components/targeted-flag-panel.tsx` — show the value

**Test:**

- [ ] Persona "Ad: Anxiety · Mobile · India" → `pricing-badge: ON`
- [ ] Persona "Corporate network · Desktop · US" → `pricing-badge: OFF`
- [ ] Persona "Ad: Belonging · Desktop · UK" → `pricing-badge: ON`

**Done when:** switching persona flips the badge, with no code change.

---

## Step 6 — First experiment: 3 variants

**Goal.** Bucket visitors into three hero variants by hashing their ID.

**GrowthBook:**

- [ ] Create a feature, key `hero-copy`
- [ ] Type: **String**, Default Value: `control`
- [ ] Add **rule 1** — Forced Value:
  - Condition: `audience` is equal to `corporate`
  - Value to force: `control`
- [ ] Add **rule 2** — Experiment:
  - Assign variation by attribute: `id`
  - Tracking key: `hero-copy`
  - Traffic included: 100%
  - Three variations:

| Value to Force | Variation Name | Split |
| --- | --- | --- |
| `control` | Control | 33 |
| `urgency` | Urgency | 33 |
| `reassurance` | Reassurance | 34 |

- [ ] Enable in `production`

**Three things that will bite you here.**

*Value to Force ≠ Variation Name.* Only **Value to Force** reaches the code.
Variation Name is a label for GrowthBook's own reports. Adding a variation
pre-fills the value from the row above, so it's easy to end up with two rows
both forcing `control` — the experiment then runs normally while two-thirds of
people see identical copy, and reports no difference. Nothing errors.

*Type values bare.* `control`, not `"control"`. Quotes become part of the value.

*Rule order matters.* The forced rule must sit **above** the experiment rule.
Rules run top-down, first match wins. That's what makes corporate visitors skip
bucketing entirely — and it's the point of this flag: **targeting decides who is
eligible, hashing decides what eligible people get.** Two different mechanisms.

**Check it:**

```bash
curl -s "https://cdn.growthbook.io/api/features/YOUR_CLIENT_KEY" \
  | jq '.features["hero-copy"].rules[].variations'
```

Expect `["control","urgency","reassurance"]`. If `control` appears twice, fix the
duplicate row.

**Code:**

- `src/lib/flags/sdk.ts` — `heroCopy`, with `identify`
- `src/app/_components/hero-experiment-panel.tsx` — render the variant's headline

**Test:**

- [ ] Page shows one of the three headlines
- [ ] Clear the `demo-anon-id` cookie and reload a few times → you land in
      different variants
- [ ] Persona "Corporate network" → **always** control, whatever the id would
      have hashed to

The last one is how the two mechanisms show up now. The panel prints a value,
not an explanation, so eligibility-vs-bucketing is something you demonstrate by
switching persona rather than something the page tells you. If you want the
explanation back, `decide` can record GrowthBook's reason into a `cache()`-scoped
map — see `RESEARCH-FLAGS.md` §11.1.

**Done when:** different IDs get different variants, and corporate never does.

---

## Step 7 — Move every flag onto the Flags SDK ✅

**Goal.** One way to declare a flag, and it is the standard one.

**Why.** Steps 3–6 used the GrowthBook SDK directly, deliberately — the stock
adapter fetches and caches the payload itself, which is the exact variable those
steps measure. But precompute (step 12) is a Flags SDK feature and cannot be
hand-rolled sanely, and running two flag systems side by side is worse than
either. So everything moves.

**One objection looked fatal and was not.** `flag()` reads `headers()` on every
call, so nothing declared through it can sit in the static shell — dropping
`identify` does not help, because the read happens before `identify` is ever
consulted. But `flag()` dispatches on its arguments, and `flag(request)` takes a
branch that never touches `next/headers`. An untargeted flag read with a
stand-in request prerenders, measured as `○` with the live value baked in.

**One cost was accepted rather than worked around.** `flag()` resolves to a
value, discarding GrowthBook's rule id, reason code and experiment result. The
pages now render values only; the "decided by" and "mechanism" readouts are
gone. They could be recovered by having `decide` record into a `cache()`-scoped
map, but that is a side-channel around the abstraction and the pages read better
without it.

**Why not `@flags-sdk/growthbook`.** It is not a preference. The stock adapter
fetches the ruleset inside `decide`, which means (a) one Edge Config read per
request against zero for `use cache`, and (b) — the decisive one — **step 3 is
not expressible at all**, because that uncached fetch fails the prerender even
with the stand-in request. `decide` is ours to write, so each flag calls
`getRuleset()` directly. No adapter either: one is worth introducing when
several flags share non-trivial resolution logic, and ours is a single call.
See `RESEARCH-FLAGS.md` M6–M9.

**One trap worth knowing.** The stand-in `Request` must be constructed per call.
The SDK memoises evaluations in a `WeakMap` keyed by the request's headers
object, so hoisting it to a module constant freezes the flag for the lifetime of
the server process — surviving `/invalidate` and every ruleset change. It looks
like an optimisation. Measured as M8.

**GrowthBook:** nothing.

**Code:**

- `src/lib/flags/sdk.ts` — every flag, its `decide`, and `readStatic`
- `src/lib/flags/evaluate.ts` — now purely the evaluation engine, not a public API
- `src/app/.well-known/vercel/flags/route.ts` — discovery endpoint
- The three panels now read flags through the SDK

**Configure — ✅ done.** `FLAGS_SECRET` is set. Generate one with —

```bash
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

— and add it as `FLAGS_SECRET` in Vercel → Settings → Environment Variables, and
to `.env`. It is optional for step 7 — without it the Toolbar just shows no
flags — but **step 12 requires it**: `generatePermutations` throws at build
time when it is missing.

**Test:**

- [x] `/flags` is still `◐` in the build output, and the kill switch value is
      still in the HTML the server sent
- [x] The discovery endpoint lists all three flags
- [x] Switching persona still changes the targeted flag and the hero variant

A plain `curl` against the discovery endpoint returns **401 even when correctly
configured**, and that is not a failure. It expects an encrypted proof token
that the Vercel Toolbar mints — not the secret itself — so passing
`FLAGS_SECRET` as a bearer token is still rejected. To check it by hand, mint a
real one:

```bash
node -e "require('flags').createAccessProof().then(console.log)" > /tmp/proof
curl -s -H "Authorization: Bearer $(cat /tmp/proof)" \
  localhost:3000/.well-known/vercel/flags | jq '.definitions | keys'
```

→ `["catalog-kill-switch", "hero-copy", "pricing-badge"]`

**Done when:** every flag is declared in `sdk.ts` and the page still builds `◐`
with the kill switch in the shell.

---

## Step 8 — Cache the variant ✅

**Goal.** Render each variant once and share it, instead of re-rendering per
visitor.

**Why.** This is the whole point of the project. 50,000 visitors across 3
variants should cost 3 renders, not 50,000. The trick is to cache using the
**variant** as the key — not the visitor.

**GrowthBook:** nothing.

**Code:**

- `src/lib/flags/hero-copy.ts` — the three variants and the render cost, shared
  with step 6 so the two panels cannot drift
- `src/app/_components/cached-hero-panel.tsx` — `use cache: remote` keyed by
  variant, plus the uncached wrapper that decides
- `src/lib/cache-tags.ts` — one tag per variant, so `/invalidate` can expire a
  single variant's markup

`remote`, not plain `use cache`, for the reason measured in `RESEARCH.md` §5.3:
plain `use cache` is per-process memory, which is a real cache locally and no
cache at all on Vercel. Locally the two are indistinguishable — that is exactly
what made it expensive to find the first time.

**The shape that matters** is the split, not the directive:

```tsx
export async function CachedHeroPanel() {
  const variant = await heroCopy();          // per visitor, outside the cache
  return <CachedHero variant={variant} />;   // per variant, inside it
}
```

Deciding is cheap — a hash and a walk over rules already in memory. Rendering is
expensive. Put the decision *inside* the cached scope and the first visitor's
variant is served to everyone.

**Test:**

- [x] Build and run: `pnpm build && pnpm start`
- [x] Load `/flags` a few times → the render timestamp is **frozen**
- [x] Different visitors in the same variant → the **same** frozen timestamp
- [x] A visitor in another variant → a different frozen timestamp
- [x] Expire one variant on `/invalidate` → only that variant re-renders

Measured: 12 requests from 10 distinct visitor ids produced **3 renders**, one
per variant (`RESEARCH-FLAGS.md` M10).

**The trap, and it is a quiet one.** Nothing stops a visitor-specific value from
entering the cached component as a prop. `cookies()` and `headers()` are
rejected outright, but an id passed in is accepted silently, joins the cache key,
and turns one entry per variant back into one per visitor. Cache hit rates stay
plausible and the page looks perfect. Pass decisions in, never identities.

**Done when:** the timestamp stops moving within a variant.

---

## Step 9 — The exposure counter ✅

**Goal.** Show what happens when the experiment's tracking call ends up inside
the cache.

**Why this gets its own step.** An A/B test is an exposure event paired with a
conversion. If the tracking call sits inside a cached render, it fires once per
*cache entry* instead of once per *visitor*. The page looks perfect, the cache
works perfectly, and the experiment results are quietly worthless. This is the
single most dangerous mistake in the whole project, and nothing catches it —
not the build, not TypeScript, not tests.

**GrowthBook:** nothing.

**Code:**

- `src/lib/flags/exposure.ts` — the two paths and the counters
- `src/app/flags/actions.ts` — Server Actions to run and reset the probe
- `src/app/_components/exposure-probe.tsx` — the button and the two counters

**Test:**

- [x] Click "run 50 visitors"
- [x] Left panel (tracking inside the cache) shows roughly **3 / 50**
- [x] Right panel (tracking outside) shows exactly **50 / 50**
- [x] Variant split is roughly even

Measured:

```
run 1    inside:   3 / 50 visitors      outside:  50 / 50 visitors
run 2    inside:   3 / 100 visitors     outside: 100 / 100 visitors
```

**Run it twice — that is the real lesson.** Without a reset the entries are
warm, so the broken path does not merely under-report, it records **nothing at
all**. Traffic doubles, the exposure count does not move, and the page renders
correctly throughout. A week of that gives you one exposure per variant and a
week of conversions to attach to them.

**The rule is one line.** The boundary between "runs every request" and "runs
once per variant" is exactly the boundary between what must be tracked and what
may be cached. Evaluate and track in the uncached wrapper; render inside the
cache. With the Flags SDK that is `setTrackingCallback` with `after()`.

**Two honest limits of this demo.** The counters are module-level, so they are
exact on one `next start` and instance-local on serverless — the ratio survives,
the absolute numbers do not. And the visitors are fired sequentially: in
parallel, several reach the same cold entry before the first fills it and the
broken path records a few extra, which flatters it.

**Done when:** you can see 3 against 50 side by side.

---

## Step 10 — Deploy and measure on Vercel ✅

**Goal.** Re-run everything on real infrastructure.

**Why.** `RESEARCH.md` §5.3 is the whole reason for this step: the last time we
trusted local numbers, the entire caching benefit vanished on deploy and nothing
warned us. Local results don't count.

**GrowthBook:** nothing.

**What to check:**

- [x] Step 8's frozen timestamp is still frozen on Vercel
- [x] Step 9's counter still shows a gap (3-ish vs 50)
- [x] Deploy again, then re-check: which caches survived the deploy?
- [x] Step 4's webhook fires — via an **Event** webhook, not the blocked SDK one (M18)
- [ ] The ruleset isn't refetched on every request — **not measurable remotely**

**The measurement that mattered.** Correlating Vercel's invocation id with the
render timestamp, eight requests gave **eight distinct invocation ids and three
distinct timestamps** — one per variant. Plain `use cache` would have given
eight. That is §5.3 settled for this app rather than assumed.

Two of those entries were also served four minutes earlier, so they outlive both
the invocation and the gap between them.

Step 9's numbers came back identical to local: 3 / 50, then 3 / 100. 24 of the
25 `/flags` e2e tests pass unmodified against the deployment.

### What the deploy itself measured

The redeploy that added `FLAGS_SECRET` doubled as the survive-a-deploy check:

| Variant | Before | After |
| --- | --- | --- |
| `control` | `17:50:09.955Z` | `17:57:49.450Z` |
| `reassurance` | `17:46:34.661Z` | `17:56:55.563Z` |
| `urgency` | `17:46:26.449Z` | `17:56:55.548Z` |

**Every render was discarded** — `use cache: remote` does not survive a deploy —
and re-warmed to three entries again. A deploy costs one render per variant.

**No visitor was reshuffled**, though: all eight test ids kept their variant
across it. An assignment is *derived* by hashing the id, not stored, so it
survives anything the cache does. In-flight experiments are safe across a
deploy; only the render cost is repaid.

### `FLAGS_SECRET` · fixed

Previously missing on Vercel, which made the discovery endpoint return **500**
for any request carrying an `Authorization` header — `verifyAccessProof` throws
rather than returning false. It answered 401 unauthenticated, so it looked
healthy until something actually called it.

Now deployed, and the endpoint returns 401 rather than 500. A proof minted
locally still gets 401 because the deployed secret is a different value from
`.env` — expected, and the ordinary per-environment trade-off. Verifying the
200 path remotely needs a proof minted with the deployed secret, which is the
Toolbar's job.

Step 12 is unblocked: `generatePermutations` throws at build time without the
secret, so the precompute route would have failed the deploy.

### What could not be measured from here

Whether the ruleset is re-read per request. Isolating it needs the
`instrumentation.ts` fetch counter used locally, and round-trip noise from
outside the region — 0.54s to 1.45s across six identical requests — is an order
of magnitude larger than an in-region Edge Config read.

**Done when:** the numbers from steps 8 and 9 hold up on the deployment. They
do.

---

## Step 11 — Per-user entitlement flag ✅

**Goal.** Handle the flag type that genuinely can't be shared between users.

**Why it is different.** Every other flag here is safe in a shared cache because
many visitors give the same answer — the kill switch is the same for everyone,
the experiment has three outcomes thousands of people share. An entitlement is a
fact about *one person*, and a shared entry holding it would hand their access
to whoever landed on that entry next.

**GrowthBook:**

- [ ] **Features → Add Feature**, key `beta-entitlement` — paste it, keys cannot
      be renamed
- [ ] Value Type: **Boolean**, Default Value: **`false`**
- [ ] **Add Rule → Forced Value**: condition attribute `id`, operator
      **`is in the list`**, value = your own anon id; Value to Force **`true`**
- [ ] Enable in `production`

No new attributes needed — `id` was created in step 3 and is already ticked as
**Identifier**.

**Getting your id:** load `/flags` and read it off the step 11 card, under
"Decided by your id alone". The `demo-anon-id` cookie is `httpOnly`, so the page
is the easier place to find it.

**Then invalidate.** The ruleset is cached for hours, so press
`growthbook-payload` on `/invalidate` or nothing changes.

**Code:**

- `src/lib/flags/sdk.ts` — `betaEntitlement`, the one flag with no `options`
- `src/app/_components/entitlement-panel.tsx` — the `use cache: private` scope

### ⚠️ The mistake this step made, and the shape that fixes it

The obvious version puts the whole job in one private scope — it is the only
one allowed to read `cookies()`, so it can:

```tsx
export async function EntitlementPanel() {
  "use cache: private";
  const { attributes } = await readAttributes();
  const entitled = await betaEntitlement();   // → getRuleset(), a "use cache" scope
}
```

**It builds, runs, and passes every local test.** It is still wrong.
`betaEntitlement()` reaches a `use cache` scope, so awaiting it inside a private
one is genuine nesting — the thing `RESEARCH.md` §5.3a says will fail — and it
does not survive deployment.

The rule from §5.3a: a cached scope may be **returned** from a private one, not
**awaited** inside it. So evaluate outside, where nothing is nested, and let the
private scope hold only what is per-person:

```tsx
export async function EntitlementPanel() {
  const { attributes } = await readAttributes();
  const entitled = await betaEntitlement();          // uncached, per request
  return <EntitlementBody entitled={entitled} visitorId={attributes.id} />;
}

async function EntitlementBody({ entitled, visitorId }) {
  "use cache: private";                              // renders only
}
```

Both props are facts about one person and they form the cache key — safe **only**
because the cache is private. The same key in a shared scope would serve one
visitor's entitlement to whoever hit that entry next.

Recorded as M14 and risk F13. The green local suite is the point: it endorsed a
shape a companion document had already flagged as prohibited.

**No `options` on this flag, deliberately.** A flag keyed on individual identity
has no decision space to precompute, and declaring options would drag it into
step 12's permutation set as though it did.

**Test:**

- [x] Add your ID to the list → you see the beta feature
- [x] Incognito window (different ID) → doesn't see it
- [x] Nothing user-specific appears in a shared server cache — the panel streams
      and never reaches the static shell, asserted in e2e

Verified with two ids in the list: both `GRANTED`, any other id `NOT GRANTED`.

**One thing that will cost you ten minutes.** GrowthBook saves the feature
immediately but holds **rule** edits as an unpublished draft. A flag can be
live, present in the payload and completely inert — `{"defaultValue": false}`
with no `rules` array. Look for the "Review and Publish" banner. Check what the
SDK actually sees rather than what the editor shows:

```bash
curl -s "https://cdn.growthbook.io/api/features/$GROWTHBOOK_CLIENT_KEY" \
  | jq '.features["beta-entitlement"]'
```

**Done when:** two browsers get different answers and neither leaks to the other.

---

## Step 12 — Precompute (build-time variants) ✅

**Goal.** Make the hero variant fully static — decided before the page renders,
with no streaming and no flash.

**Outcome.** `/precomputed`, served from one of **12** prerendered pages.
`/flags` is untouched and still streams the same flags, so the two URLs are the
comparison rather than a before-and-after in the git history.

### What it does

`proxy.ts` resolves the three shared flags, encodes them into a signed segment,
and rewrites `/precomputed` → `/precomputed/<code>`. The browser URL never
changes — a rewrite, not a redirect, so there is no extra round trip and the
variant never ends up bookmarked or pasted into a bug report.

**Twelve pages, not 180.** We prerender per *decision*, not per visitor. The
attributes have 5 × 4 × 3 × 3 = 180 combinations; the flags have 2 × 2 × 3 = 12
outcomes. Adding a country or an audience adds **zero** pages. Adding a flag
with n options multiplies by n — that is the number to watch.
`beta-entitlement` declares no `options` and correctly drops out: a per-person
flag has no decision space, and including it would try to prerender one page per
human being.

### Measured, on a local production build

| | `/flags` | `/precomputed` |
| --- | --- | --- |
| hero markup | byte 73950 — **streamed** | byte 3021 — **in the shell** |
| hero skeleton | present | none at all |
| entitlement | streamed | streamed |
| variant, same visitor | `urgency` | `urgency` |

`x-nextjs-prerender: 1`, and `</main>` at 12047 — so the hero is inside the
static shell by document order, not merely present in the body.

### Route shape · deviation from this plan

This plan said `src/app/[code]/` as a second root layout with the existing
routes moved into a route group. That is what the Vercel example does **because
it precomputes the home page**; a root-level `[code]` would otherwise swallow
every other route. We only precompute one route, so `app/precomputed/[code]/`
needs no second root layout and no route group, and moves no existing file.

### Three things this plan did not anticipate

All three come from the same root: proxy runs *before* any render exists.

1. **`precompute(flags)` takes no request**, and proxy has no `next/headers`. So
   `readAttributes` and `resolveCountry` were split into pure functions over
   `(headers, cookies)` with thin async wrappers, and proxy calls `evaluate`\'s
   other half — `serialize` — with values it computed itself. One
   implementation, because a proxy that derived attributes differently from the
   render would route a visitor to a variant the page then disagreed with.
2. **`getRuleset()` is a `use cache` scope** and cannot run in proxy at all.
   `readRulesetForProxy()` is the uncached read, same Edge-Config-then-CDN
   policy. This is the one place flag I/O sits on every request\'s critical path.
3. **`params` counts as runtime data** under Cache Components and fails the
   prerender when read in the page body — even for paths from
   `generateStaticParams`. §13.1 M15.

**The cost of the choice:** Vercel Toolbar overrides do not move the precomputed
page, because proxy never routes through `flag()`. They still work on `/flags`,
which is one more reason that route was kept rather than replaced.

**Test — all passing:**

- [x] Response header shows `x-nextjs-prerender: 1`
- [x] The hero is in the initial HTML, before `</main>` — no streaming, no flash
- [x] The same hero streams on `/flags` (the control; without it the first check
      only proves the page is static, not that precompute made it so)
- [x] Proxy and the render agree on the variant
- [x] The browser URL never shows the code
- [x] A code that does not verify falls back to defaults instead of erroring
- [x] Two visitors get different entitlements — nothing per-person is baked into
      a shared page

**Not reachable:** "a variant we didn\'t pre-build still loads fast". All 12
permutations *are* prebuilt, so no valid-but-unbuilt code exists to test with.
It becomes testable the moment a filter is added to `generatePermutations`.

**Done when:** the hero arrives fully formed in the first HTML response. It
does — locally. **Not yet deployed**, and §5.3 is explicit that this is where
this project has been wrong before.

---

## If something breaks

| Symptom | Most likely cause |
| --- | --- |
| Flag always returns the default | Wrong env var name, or the feature is disabled for that environment |
| Feature missing from the curl output | Disabled for that environment — it's omitted, not returned as false |
| Experiment rule won't let you pick `id` | `id` isn't ticked as **Identifier** |
| Targeting condition never matches | Typo in an attribute value, or the attribute isn't registered |
| Two variants look identical | Duplicate **Value to Force** (step 6) |
| Rule added in the UI but the flag still returns its default | The rule is an unpublished draft. Features save immediately, rules do not — look for "Review and Publish" |
| Everything works locally, nothing works deployed | The `RESEARCH.md` §5.3 problem — plain `use cache` instead of `use cache: remote` |
| A flag's value never changes, even after `/invalidate` | The `Request` passed to `flag(request)` was hoisted to a module constant. The SDK keys its evaluation cache on that object, so it is memoised for the life of the process (M8) |
| Build fails with "uncached or runtime data" naming a flag | A flag read normally cannot be prerendered. Either wrap it in `<Suspense>` or, if it has no targeting, read it with `readStatic` (M6) |
| Discovery endpoint returns 401 with the right secret | It wants an encrypted proof token from the Toolbar, not `FLAGS_SECRET` itself. Mint one with `createAccessProof()` (step 7) |

---

## Reference: GrowthBook docs

- [Targeting attributes](https://docs.growthbook.io/features/targeting)
- [Feature basics](https://docs.growthbook.io/features/basics)
- [Feature rules](https://docs.growthbook.io/features/rules)
- [Environments](https://docs.growthbook.io/features/environments)
- [SDK Webhooks](https://docs.growthbook.io/app/webhooks/sdk-webhooks)
- [Sticky bucketing](https://docs.growthbook.io/app/sticky-bucketing)
- [JavaScript SDK](https://docs.growthbook.io/lib/js)

A note on menu paths: GrowthBook renames menus between releases. Most paths above
come from current docs, but a few I couldn't confirm — creating a feature, and
the exact wording of list conditions ("is in" vs "is in the list"). If a path is
wrong, search the UI for the noun rather than following it literally.
