# How GrowthBook actually works here

Plain English, with the real configuration from this project. No prior knowledge
assumed.

If you want the architecture and the measurements, those are in
[RESEARCH-FLAGS.md](./RESEARCH-FLAGS.md). This document is just: *what is a flag,
what kinds are there, and what happens when someone loads the page.*

---

## The one idea everything rests on

A feature flag looks like magic — the app asks "should I show this?" and
something somewhere answers. It isn't magic. It is two pieces of data and one
function.

**Piece one: the ruleset.** A single JSON file that GrowthBook publishes,
describing every flag and its rules. It is **the same bytes for every visitor on
Earth**. Yours, mine, a user in Tokyo — identical.

**Piece two: your attributes.** A handful of facts about the person asking.
In this project there are five:

| Attribute | Example | Where it comes from |
| --- | --- | --- |
| `id` | `09ac11c9-bc7c-…` | A random UUID in a cookie, made on your first visit |
| `country` | `IN` | A header the hosting platform adds |
| `device` | `mobile` | Your browser's User-Agent |
| `audience` | `corporate` | The `?utm_campaign=` you arrived with |
| `daypart` | `evening` | The server clock |

**The function** takes the ruleset and your attributes and returns a value. It's
a bit of arithmetic over data already in memory — no database, no network call,
microseconds.

```
   ruleset  (same for everyone)  ─┐
                                  ├──►  function  ──►  a value
   attributes  (about you)       ─┘
```

That's it. That's the whole system. Everything below is different *shapes of
rule* inside the ruleset.

**Why this matters:** because the ruleset is the same for everybody, it can be
downloaded once and reused. Only the attributes are personal, and matching them
against rules is basically free. So having feature flags does **not** mean your
pages must be rebuilt for every visitor — which is the thing this whole project
exists to demonstrate.

---

## The four kinds of flag

Sorted by one question: **who else gets the same answer as you?**

| Kind | Who shares your answer | Example here |
| --- | --- | --- |
| 1. Fixed | Everyone | `catalog-kill-switch` |
| 2. Targeted | Everyone in your group | `pricing-badge` |
| 3. Experiment | Everyone the dice sent the same way | `hero-copy` |
| 4. Identity | Nobody | `beta-entitlement` |

Each one is explained below with its real configuration.

---

## Kind 1 — Fixed value for everyone

**`catalog-kill-switch`** — an on/off switch. No conditions at all.

Here is its entire entry in the live ruleset:

```json
"catalog-kill-switch": {
  "defaultValue": true
}
```

That is genuinely all of it. No `rules` array, because there is nothing to
decide. Every visitor gets `true`.

### What happens on a request

Nothing. Literally nothing per-request — the answer was baked into the HTML when
the page was built, so the server does no work at all when you load it.

### Why you'd use this

A **kill switch**. Something breaks in production at 2am; you flip this in
GrowthBook and the feature disappears for everyone, with no deploy, no code
change, no build.

### The catch

Because the answer is baked in, changing it in GrowthBook does **not** update the
page instantly. The app is holding a cached copy of the ruleset. Three things can
refresh it:

1. **Nothing — just wait.** The cache is set to refresh five minutes after it
   goes stale. This happens on its own.
2. **The webhook.** GrowthBook tells the app the moment you publish.
3. **The `/invalidate` page.** A button that says "forget what you know".

If you flip a flag and the page looks unchanged, that is the cache doing its job,
not a bug.

### Try it

Go to `/flags`, look at the **Step 3** card. Then use **View Source** rather than
the element inspector — the value is in the HTML the server sent, not something
JavaScript filled in afterwards.

---

## Kind 2 — Targeted: a different answer per group

**`pricing-badge`** — on for visitors in India and the UK, off everywhere else.

```json
"pricing-badge": {
  "defaultValue": false,
  "rules": [
    {
      "condition": { "country": { "$in": ["IN", "UK"] } },
      "force": true
    }
  ]
}
```

Read it top to bottom, exactly as the code does:

1. Start with `defaultValue: false`.
2. Walk the rules in order. **First match wins.**
3. Rule one asks: is `country` one of `IN` or `UK`? If yes → **force** `true`,
   stop.
4. No rule matched → keep `false`.

### Worked example

| Visitor | `country` | Rule matches? | Answer |
| --- | --- | --- | --- |
| Priya, Mumbai | `IN` | yes | **on** |
| Tom, London | `UK` | yes | **on** |
| Alex, Chicago | `US` | no | off |

Nothing random here. Same country, same answer, every single time, for everyone.

### Why you'd use this

Regional pricing, language-specific banners, a feature you're only launching in
one market, a beta open to one customer tier.

### The one real difference from Kind 1

This flag has to **read something about you** (`country`), and your country isn't
known until you actually show up. So it can't be baked into the page ahead of
time — it arrives a moment after the rest of the page, streamed in.

That sounds expensive and isn't. The ruleset was already cached; the only new
work is checking `"IN" is in ["IN","UK"]`. **Personalising a flag costs a
comparison, not a network trip.** That's why a page full of targeted flags can
still be almost entirely pre-built.

### Try it

The persona switcher on `/flags` changes your country. Switch between the India
and US personas and watch the badge turn on and off.

---

## Kind 3 — An experiment: the dice roll

**`hero-copy`** — an A/B/C test of three headlines. This one has two rules doing
two completely different jobs, and telling them apart is the single most useful
thing in this document.

```json
"hero-copy": {
  "defaultValue": "control",
  "rules": [
    {
      "condition": { "audience": "corporate" },
      "force": "control"
    },
    {
      "hashAttribute": "id",
      "seed": "43f9eff5-091c-413c-8637-363d08c70224",
      "hashVersion": 2,
      "variations": ["control", "urgency", "reassurance"],
      "weights": [0.3334, 0.3333, 0.3333],
      "coverage": 1
    }
  ]
}
```

### Rule one decides *whether you're in the test at all*

```json
{ "condition": { "audience": "corporate" }, "force": "control" }
```

Corporate visitors are excluded and always see `control`. This is ordinary
targeting — the same shape as Kind 2. **Nothing random.**

This is called **eligibility**, and it comes first for a reason: you often want
to keep certain people out of an experiment entirely — internal staff, enterprise
accounts, anyone under a contract that promises a stable interface.

### Rule two decides *which variant eligible people get*

This is the actual experiment, and here is exactly what it does.

**Step 1 — turn your id into a number.** Your id is glued to the experiment's
`seed` and run through a hash function. The output is always between 0 and 1:

```
hash("43f9eff5-…" + "09ac11c9-bc7c-40e5-be7c-dd41e9f2b688")  =  0.3703
```

**Step 2 — see which slice that number lands in.** The `weights` carve the range
0–1 into three slices:

```
  0.0000        0.3334              0.6667        1.0000
    |─────────────|───────────────────|─────────────|
       control          urgency         reassurance

               ▲ 0.3703 lands here  →  urgency
```

That's the whole mechanism. A hash, and a look at which slice it fell in.

**This is real, not an illustration.** That visitor id was served by the live
deployment, and the deployment gave them `urgency` — the same answer this
calculation produces.

### The crucial part: nothing is stored

There is no table anywhere recording "this person is in urgency". The answer is
**recalculated from scratch on every single request** and comes out the same
because the same number always lands in the same slice.

Run it ten times for one id:

```
urgency urgency urgency urgency urgency urgency urgency urgency urgency urgency
```

Run it once each for different ids:

```
visitor-a  0.6403  urgency
visitor-b  0.2911  control
visitor-c  0.3842  urgency
visitor-d  0.1484  control
visitor-e  0.6343  urgency
```

Across 3,000 simulated visitors the split comes out **33.3% / 34.8% / 31.9%** —
close to even, which is what the equal weights ask for.

### Why "nothing is stored" is genuinely good news

Because there is nothing to lose:

- **Deploy the app** → assignments unchanged. Measured: eight of eight visitors
  kept their variant across a deploy.
- **Server restarts, caches emptied, traffic moves to a different machine** →
  assignments unchanged.
- **Two servers on opposite sides of the world** → same answer, no coordination
  needed, because they're both just doing arithmetic on the same two numbers.

### What *does* move someone to a different variant

- **They lose the cookie** — incognito, cleared cookies, a different browser.
  New id, new hash, new roll. (This is why the same person on phone and laptop
  can see different variants — to the system they're two people.)
- **You change the experiment** — new weights, a fourth variant, a different
  seed. All of those redraw the slices, and some people move.
- **A targeting rule catches them** — switch to the corporate persona and the
  variant pins to `control` no matter what the hash says, because rule one runs
  first.

That last point is worth repeating, because it's the thing people most often
conflate:

> **Targeting decides who is in the experiment. Hashing decides what those
> people get. Only the second one is random.**

### The trap that ruins experiments

An A/B test is not "showing someone a variant". It is **recording that they saw
it**, and later matching that against whether they converted.

If the recording happens in the wrong place — inside a piece of cached work — it
runs once when the cache is filled and is skipped every time after. This project
measures it: **3 recorded views out of 50 visitors.** Conversions still count all
50, so the results are nonsense, and every dashboard looks completely healthy.

Nothing catches this. Not a compiler, not a test, not a performance graph. The
page looks right, feels fast, and the data is quietly worthless.

`/flags` runs both versions side by side so you can watch the two counters
diverge.

### Try it

On `/flags`, switch to the corporate persona — the variant pins to `control`.
Switch to any other persona and it goes back to whatever your id hashes to. To
roll again, clear the `demo-anon-id` cookie and reload: you get a new id and a
fresh roll.

---

## Kind 4 — Identity: an answer nobody else shares

**`beta-entitlement`** — beta access, turned on for specific named people.

```json
"beta-entitlement": {
  "defaultValue": false,
  "rules": [
    {
      "condition": {
        "id": {
          "$in": [
            "55cc9438-ebf9-4073-b612-ad389cd3b4d3",
            "9db2312f-fd0f-4748-97fb-7c359ab92f7b"
          ]
        }
      },
      "force": true
    }
  ]
}
```

Structurally this is identical to Kind 2 — a condition and a `force`. The
difference is *what* it matches on: not a group you belong to, but **you
specifically**.

That changes everything about how it can be handled.

### Why this one is special

The other three flags produce answers that many people share. That makes them
safe to store once and reuse:

- the kill switch: one answer for the whole world
- the pricing badge: one answer per country
- the experiment: three answers for the entire population

An entitlement has **one answer per person**. Store it somewhere shared and reuse
it, and you hand one person's access to whoever asks next. That is not a slow
page — that is a security bug.

So in this project it is the one flag kept in a per-browser cache, never a shared
one. Your answer lives in *your* browser and nowhere else.

### Worked example

| Visitor | On the list? | Answer |
| --- | --- | --- |
| `55cc9438-…` | yes | **GRANTED** |
| `9db2312f-…` | yes | **GRANTED** |
| anyone else | no | NOT GRANTED |

Verified on the live deployment, which is the check that matters: the listed id
gets `GRANTED` and an unlisted one gets `NOT GRANTED`, **on a page that is
pre-built and shared by many visitors**. Nothing personal leaked into the shared
copy.

### Why you'd use this

Beta programs, per-customer features, admin tools, anything sold per-seat.

### The honest cost

This one cannot be pre-computed or shared, ever. It is decided fresh for every
visitor on every request. That's fine — the decision is a list lookup — but it
means "add feature flags and everything gets faster" is not the story.

Precomputing helps with decisions **many people share**. Decisions nobody shares
cost what they always cost.

---

## All four, side by side

| | Fixed | Targeted | Experiment | Identity |
| --- | --- | --- | --- | --- |
| Example | `catalog-kill-switch` | `pricing-badge` | `hero-copy` | `beta-entitlement` |
| Depends on | nothing | your group | your id (hashed) | your id (exactly) |
| Random? | no | no | **yes** | no |
| Distinct answers | 1 | one per country | 3 | one per person |
| Can be pre-built? | yes, fully | yes, per group | yes, per variant | **never** |
| Same answer on reload? | yes | yes | yes | yes |
| Same answer in incognito? | yes | yes | **no** — new id | **no** — new id |
| Safe in a shared cache? | yes | yes | yes | **no** |

---

## What happens when you load a page, start to finish

Say you open `/flags` for the first time.

1. **Before any HTML is generated**, a small piece of code runs. You have no id
   cookie, so it creates one — a random UUID — and works out your device and the
   time of day.
2. **The page starts rendering.** The kill switch was already decided when the
   site was built, so its value is simply *there* in the HTML.
3. **The ruleset is fetched** — once. It's then cached, so the next visitor
   doesn't pay for it. In practice this is one fetch every few hours, not one per
   visitor.
4. **Your attributes are read** from the cookie and the request headers.
5. **Each remaining flag is evaluated** against the ruleset: a couple of
   comparisons and one hash. Microseconds.
6. **The results stream into the page**, filling in the regions that were waiting.

Reload and steps 3–6 mostly vanish: the ruleset is cached, your id is in the
cookie, and every answer comes out the same.

---

## Where GrowthBook fits, and where it doesn't

**GrowthBook is a place to edit rules and a file to download.** That's the whole
of its runtime role here. It never sees your visitors, never decides anything at
request time, and if it went offline right now every flag would keep working —
they'd serve their cached values, and eventually fall back to safe defaults
written into the code.

**Your app does the deciding.** Which is exactly why this is fast: the decision
happens in memory, next to the code that needs it, rather than over a network to
someone else's server.

---

## Common questions

**Why does incognito show a different variant?**
No cookie means no id, so a new one is made. To the system that's a different
person. This is the correct behaviour — it's also how you roll again on purpose.

**I changed a flag and nothing happened.**
The ruleset is cached. Wait five minutes, press the button on `/invalidate`, or
let the webhook do it. Also check you clicked **Review and Publish** in
GrowthBook — it saves a *feature* immediately but holds **rule** changes as an
unpublished draft, so a flag can be live, readable, and completely inert.

**Can someone cheat their way into a variant?**
Not by editing cookies in the browser — the id cookie is `httpOnly`, so page
JavaScript cannot read or write it.

**Does everyone in one country get the same experiment variant?**
No. Country decides the *pricing badge*; the experiment is decided by your id
alone. Two people in India will usually see different headlines.

**Why is the split not exactly 33/33/33?**
Because it's a hash, not a shuffle. Over 3,000 visitors we measured 33.3 / 34.8 /
31.9. It converges as traffic grows, and this is normal and expected.

**What if I want someone to keep their variant even after I add a fourth one?**
That's called *sticky bucketing* and it needs assignments to be stored somewhere.
On GrowthBook it's a paid-plan feature, so this project doesn't have it. Without
it, changing an experiment reshuffles part of your audience.

---

## Where to look in the code

| What | File |
| --- | --- |
| Downloading and caching the ruleset | `src/lib/flags/ruleset.ts` |
| Doing the actual evaluation | `src/lib/flags/evaluate.ts` |
| The four flag declarations | `src/lib/flags/sdk.ts` |
| Reading your attributes | `src/lib/flags/attributes.ts` |
| Creating the id cookie | `src/proxy.ts` |
| Pre-building the variants | `src/lib/flags/precompute.ts` |
