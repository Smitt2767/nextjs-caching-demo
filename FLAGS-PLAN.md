# Feature flags & experiments — build plan

One step at a time. Each step builds **one thing**, configures GrowthBook **only
if that step needs it**, and ends with a test you can actually run.

Do not skip ahead. If a test fails, we fix it before starting the next step.

**Background reading (optional):** `RESEARCH-FLAGS.md` explains why the plan is
shaped this way. You don't need it to follow along.

---

## The 11 steps

**Done so far: 1, 2, 3.** Findings from them are in `RESEARCH-FLAGS.md` §13.1 —
two of the three were build-breaking surprises worth reading before step 4.

| # | Step | GrowthBook needed? | |
| --- | --- | --- | --- |
| 1 | Anonymous visitor ID | no | ✅ |
| 2 | Targeting attributes + persona switcher | no | ✅ |
| 3 | Connect GrowthBook, one simple flag | **yes** — first setup | ✅ |
| 4 | Webhook, so flag changes appear instantly | **yes** — small |  |
| 5 | Targeting: a flag that varies by country | **yes** — small |  |
| 6 | First experiment: 3 variants | **yes** — small |  |
| 7 | Cache the variant | no |  |
| 8 | The exposure counter | no |  |
| 9 | Deploy and measure on Vercel | no |  |
| 10 | Per-user entitlement flag | **yes** — small |  |
| 11 | Precompute (build-time variants) | no |  |

Steps 1–2 need no GrowthBook at all, so we can start immediately.

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
- `src/app/flags/page.tsx` — show whether the flag is on

**Test:**

- [ ] `/flags` shows `catalog-kill-switch: ON`
- [ ] Turn it off in GrowthBook, wait a minute, reload → shows `OFF`
- [ ] The flag value appears in the page's HTML source (View Source, not
      DevTools) — proving it was baked in, not fetched by the browser

**Done when:** flipping the toggle in GrowthBook changes the page.

---

## Step 4 — Webhook, so flag changes appear instantly

**Goal.** Cut the "wait a minute" from step 3 down to a couple of seconds.

**Why.** Right now we re-fetch the ruleset on a timer. A webhook lets GrowthBook
tell us the moment something changed.

**GrowthBook:**

- [ ] Open your production **SDK Connection**, find the **SDK Webhooks** section
- [ ] Add a webhook:
  - Endpoint URL: `https://<your-vercel-domain>/api/growthbook-webhook`
  - Method: `POST`
  - Payload format: **Standard (no SDK payload)**
- [ ] Copy the **shared secret** shown on the connection page
- [ ] Add it in Vercel as `GROWTHBOOK_WEBHOOK_SECRET`

"No SDK payload" because our handler doesn't need the ruleset — it only needs to
know something changed, then it clears the cache and the next request refetches.

**Code:**

- `src/app/api/growthbook-webhook/route.ts` — verify the signature, then call
  `revalidateTag('growthbook-payload', 'max')`

GrowthBook signs with three headers: `webhook-id`, `webhook-timestamp`, and
`webhook-signature`. The signature value starts with `v1,` — that prefix is part
of the value and has to be stripped before comparing.

**Test:**

- [ ] Flip `catalog-kill-switch` in GrowthBook
- [ ] Reload the page within ~5 seconds → it already shows the new value
- [ ] Send a fake POST with a wrong signature → returns 401

**Note:** webhooks only reach a deployed URL, not `localhost`. Test this one on
Vercel.

**Done when:** a flag flip shows up on the next reload, not the next minute.

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

- `src/lib/flags/attributes.ts` — pass the attributes into the SDK
- `src/app/flags/page.tsx` — show the badge flag's value

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

- `src/lib/flags/hero.ts` — evaluate the flag, return the variant
- `src/app/flags/page.tsx` — render the variant's headline

**Test:**

- [ ] Page shows one of the three headlines
- [ ] Clear the `demo-anon-id` cookie and reload a few times → you land in
      different variants
- [ ] Persona "Corporate network" → **always** control, and the page says it was
      excluded by targeting, not bucketed

**Done when:** different IDs get different variants, and corporate never does.

---

## Step 7 — Cache the variant

**Goal.** Render each variant once and share it, instead of re-rendering per
visitor.

**Why.** This is the whole point of the project. 50,000 visitors across 3
variants should cost 3 renders, not 50,000. The trick is to cache using the
**variant** as the key — not the visitor.

**GrowthBook:** nothing.

**Code:**

- `src/lib/flags/hero-render.ts` — `use cache: remote`, keyed by variant

`remote`, not plain `use cache`, for the reason we already measured in
`RESEARCH.md` §5.3: plain `use cache` is per-process memory, which is a real
cache locally and no cache at all on Vercel.

**Test:**

- [ ] Build and run: `pnpm build && pnpm start`
- [ ] Load `/flags` a few times in the same variant → the render timestamp is
      **frozen**
- [ ] Switch to a different variant → a different frozen timestamp

**Done when:** the timestamp stops moving within a variant.

---

## Step 8 — The exposure counter

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

- `src/app/flags/probe/route.ts` — evaluates one simulated visitor
- `src/app/_components/exposure-probe.tsx` — a button that runs 50 of them and
  counts how many times each side actually executed

**Test:**

- [ ] Click "run 50 visitors"
- [ ] Left panel (tracking inside the cache) shows roughly **3 / 50**
- [ ] Right panel (tracking outside) shows exactly **50 / 50**
- [ ] Variant split is roughly even

**Done when:** you can see 3 against 50 side by side.

---

## Step 9 — Deploy and measure on Vercel

**Goal.** Re-run everything on real infrastructure.

**Why.** `RESEARCH.md` §5.3 is the whole reason for this step: the last time we
trusted local numbers, the entire caching benefit vanished on deploy and nothing
warned us. Local results don't count.

**GrowthBook:** nothing.

**What to check:**

- [ ] Step 7's frozen timestamp is still frozen on Vercel
- [ ] Step 8's counter still shows a gap (3-ish vs 50)
- [ ] Step 4's webhook fires — flip a flag, reload, see the change
- [ ] The ruleset isn't refetched on every request
- [ ] Deploy again, then re-check: which caches survived the deploy?

Findings go into `RESEARCH-FLAGS.md` §13, which is currently a list of
predictions with nothing measured against it.

**Done when:** the numbers from steps 7 and 8 hold up on the deployment.

---

## Step 10 — Per-user entitlement flag

**Goal.** Handle the flag type that genuinely can't be shared between users.

**GrowthBook:**

- [ ] Create a feature, key `beta-entitlement`
- [ ] Type: **Boolean**, Default Value: `false`
- [ ] Add a rule: **Forced Value**, condition `id` is in the list → force `true`
- [ ] Leave the list empty for now
- [ ] Enable in `production`

You won't have real IDs until the app has minted some. Load `/flags`, copy your
own `demo-anon-id` out of the cookie, and paste it into the list.

**Code:**

- Uses `use cache: private` — the browser-side cache, the only one allowed to
  read cookies, and the only safe place for a per-person answer

**Test:**

- [ ] Add your ID to the list → you see the beta feature
- [ ] Incognito window (different ID) → doesn't see it
- [ ] Nothing user-specific appears in a shared server cache

**Done when:** two browsers get different answers and neither leaks to the other.

---

## Step 11 — Precompute (build-time variants)

**Goal.** Make the hero variant fully static — decided before the page renders,
with no streaming and no flash.

**Why last.** It's the only step that restructures the app, and it's the only one
that can genuinely fail. Everything else should be working first.

**The idea.** `proxy.ts` works out the variant, encodes it into a hidden URL
segment, and rewrites the request to a pre-built page for that combination. The
browser URL never changes.

**The key insight:** we prerender one page per *decision*, not per *attribute
combination*. Our attributes have 180 combinations. Our flags produce
3 × 2 × 2 = **12 outcomes**. Twelve pages, not 180 — and adding more countries
or audiences adds zero pages.

**GrowthBook:** nothing new. Optionally look at **Experimentation → Namespaces**
if we add more experiments later — mutually exclusive experiments don't multiply
together, which keeps the page count down.

Sticky bucketing also becomes relevant here (**Settings → General → Experiment
Settings**) but it's Pro/Enterprise only, so check whether your plan has it.

**Code:**

- `src/proxy.ts` — evaluate and rewrite
- `src/app/[code]/` — becomes a second root layout
- Existing routes move into a route group

**Test:**

- [ ] Response header shows `x-nextjs-prerender: 1`
- [ ] The hero is in the initial HTML — no streaming, no flash
- [ ] A variant we didn't pre-build still loads fast (Next serves a shell and
      upgrades in the background)

**Done when:** the hero arrives fully formed in the first HTML response.

---

## If something breaks

| Symptom | Most likely cause |
| --- | --- |
| Flag always returns the default | Wrong env var name, or the feature is disabled for that environment |
| Feature missing from the curl output | Disabled for that environment — it's omitted, not returned as false |
| Experiment rule won't let you pick `id` | `id` isn't ticked as **Identifier** |
| Targeting condition never matches | Typo in an attribute value, or the attribute isn't registered |
| Two variants look identical | Duplicate **Value to Force** (step 6) |
| Everything works locally, nothing works deployed | The `RESEARCH.md` §5.3 problem — plain `use cache` instead of `use cache: remote` |

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
