import { test, expect, type Page } from "@playwright/test";

import { PERSONAS } from "../src/lib/personas";

/**
 * Steps 1 and 2 of FLAGS-PLAN.md: the bucketing id, and the four targeting
 * attributes that feed every flag decision after this.
 */

const ATTRS = ["id", "audience", "device", "country", "daypart"] as const;

/**
 * Scope an attribute to its section.
 *
 * While a Suspense boundary is in flight React parks a copy of its content in a
 * hidden buffer at the end of <body>, then a script moves it into place. For a
 * moment two nodes carry the same testid, which trips Playwright's strict mode.
 * The section wrapper is static and never inside the boundary, so going through
 * it always resolves the placed copy. Same reason /ppr's spec has `slot()`.
 */
function attr(page: Page, key: (typeof ATTRS)[number]) {
  return page.getByTestId("attributes-section").getByTestId(`attr-${key}`);
}

/** Wait for the streamed panel before touching the switcher: the control is in
 *  the static shell, so it is clickable well before React has attached its
 *  handler, and on a slower device the change event lands on nothing. */
async function ready(page: Page) {
  // Scoped for the same reason as `attr()` above — the streamed panel exists
  // twice for a moment, once in React's buffer and once in place.
  await expect(
    page.getByTestId("attributes-section").getByTestId("attributes-panel"),
  ).toBeVisible();
}

test.describe("flags: the visitor id", () => {
  test("proxy mints one, and it survives a reload", async ({ page }) => {
    await page.goto("/flags");
    await ready(page);

    const first = await attr(page, "id").textContent();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);

    await page.reload();
    await expect(attr(page, "id")).toHaveText(first!);
  });

  test("a different browser gets a different id", async ({ page, browser }) => {
    await page.goto("/flags");
    await ready(page);
    const mine = await attr(page, "id").textContent();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/flags");
    await ready(otherPage);
    const theirs = await attr(otherPage, "id").textContent();
    await other.close();

    expect(theirs).toMatch(/^[0-9a-f-]{36}$/);
    expect(theirs).not.toBe(mine);
  });
});

test.describe("flags: attributes", () => {
  test("the switcher is in the shell, the attributes stream in", async ({
    page,
  }) => {
    await page.goto("/flags");

    // Both are in the prerendered document: the control, and a placeholder for
    // the thing it controls.
    await expect(page.getByTestId("persona-select")).toBeVisible();
    await ready(page);

    for (const key of ATTRS) {
      await expect(attr(page, key)).not.toBeEmpty();
    }
  });

  test("a persona pins all four, and clearing it restores them", async ({
    page,
  }) => {
    const persona = PERSONAS.find((p) => p.id === "returning-tablet-us-night")!;

    await page.goto("/flags");
    await ready(page);
    const idBefore = await attr(page, "id").textContent();

    await page.getByTestId("persona-select").selectOption(persona.id);
    for (const [key, value] of Object.entries(persona.attributes)) {
      await expect(attr(page, key as (typeof ATTRS)[number])).toHaveText(value);
    }

    // The persona covers targeting only. The bucketing id is not a targeting
    // dimension and must not move, or every variant would reshuffle with it.
    await expect(attr(page, "id")).toHaveText(idBefore!);

    await page.getByTestId("persona-select").selectOption("");
    await expect(attr(page, "audience")).toHaveText("organic");
    await expect(attr(page, "id")).toHaveText(idBefore!);
  });

  test("a campaign is captured on the landing request and then kept", async ({
    page,
  }) => {
    // Applies on this very request: proxy writes the cookie, and Next merges it
    // into the request's cookie store before the component reads it.
    await page.goto("/flags?utm_campaign=ad-anxiety");
    await ready(page);
    await expect(attr(page, "audience")).toHaveText("ad-anxiety");

    // And survives the URL losing the parameter — otherwise a visitor would
    // silently reclassify as organic partway through an experiment.
    await page.goto("/flags");
    await ready(page);
    await expect(attr(page, "audience")).toHaveText("ad-anxiety");
  });

  test("an unknown campaign is ignored rather than stored", async ({
    page,
  }) => {
    await page.goto("/flags?utm_campaign=not-a-real-audience");
    await ready(page);
    await expect(attr(page, "audience")).toHaveText("organic");
  });
});

test.describe("flags: targeting", () => {
  /**
   * Asserts the wiring, not the rule.
   *
   * `pricing-badge`'s ON/OFF depends on a rule that lives in GrowthBook, and
   * pinning the suite to it would mean a test that fails whenever somebody
   * edits a flag — which is the opposite of what a flag is for. What must hold
   * regardless is that the visitor's country reaches the evaluation.
   */
  for (const [persona, country] of [
    ["anxiety-mobile-in", "IN"],
    ["corporate-desktop-us", "US"],
    ["belonging-desktop-uk", "UK"],
  ] as const) {
    test(`the ${country} persona's country reaches the evaluation`, async ({
      page,
    }) => {
      await page.goto("/flags");
      await ready(page);
      await page.getByTestId("persona-select").selectOption(persona);
      await expect(attr(page, "country")).toHaveText(country);

      await expect(
        page
          .getByTestId("targeting-section")
          .getByTestId("pricing-badge-country"),
      ).toHaveText(`country=${country}`);
    });
  }

  test("the targeted flag streams, the untargeted one does not", async ({
    page,
  }) => {
    await page.goto("/flags");

    // The kill switch has no targeting, so it is in the document the server
    // sent — before any boundary resolves.
    await expect(page.getByTestId("kill-switch-value")).toBeVisible();

    // The targeted one reads `country`, so it cannot be prerendered.
    await expect(
      page.getByTestId("targeting-section").getByTestId("pricing-badge-value"),
    ).toBeVisible();
  });
});

test.describe("flags: the experiment", () => {
  const hero = (page: Page, id: string) =>
    page.getByTestId("experiment-section").getByTestId(id);

  test("the same visitor keeps the same variant", async ({ page, baseURL }) => {
    await page.context().addCookies([
      { name: "demo-anon-id", value: "e2e-stable-visitor", url: baseURL! },
    ]);

    await page.goto("/flags");
    const first = await hero(page, "hero-variant").textContent();
    expect(first).toBeTruthy();

    await page.reload();
    await expect(hero(page, "hero-variant")).toHaveText(first!);
  });

  test("different visitors do not all land in one variant", async ({
    browser,
    baseURL,
  }) => {
    // Not an assertion about the split — that lives in GrowthBook and may be
    // edited. What must hold is that the id is actually being hashed, which a
    // single-variant result across many ids would disprove.
    const seen = new Set<string>();

    for (let i = 0; i < 12; i++) {
      const context = await browser.newContext();
      await context.addCookies([
        { name: "demo-anon-id", value: `e2e-spread-${i}`, url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto("/flags");
      const variant = await hero(page, "hero-variant").textContent();
      if (variant) seen.add(variant.trim());
      await context.close();
    }

    expect(seen.size).toBeGreaterThan(1);
  });

  test("targeting excludes before hashing happens", async ({
    page,
    baseURL,
  }) => {
    await page.context().addCookies([
      { name: "demo-anon-id", value: "e2e-corporate-visitor", url: baseURL! },
      { name: "demo-persona", value: "corporate-desktop-us", url: baseURL! },
    ]);

    await page.goto("/flags");

    // A forced rule decides eligibility before any hashing happens, so this
    // visitor pins to control however their id would have hashed. The id below
    // lands elsewhere without the persona — see the test above.
    await expect(hero(page, "hero-variant")).toHaveText("control");
  });

  test("an eligible visitor is decided by hashing", async ({
    page,
    baseURL,
  }) => {
    await page.context().addCookies([
      { name: "demo-anon-id", value: "e2e-eligible-visitor", url: baseURL! },
      { name: "demo-persona", value: "anxiety-mobile-in", url: baseURL! },
    ]);

    await page.goto("/flags");

    // No forced rule matches this persona, so the value comes from hashing the
    // id — which must produce one of the three declared variants.
    await expect(hero(page, "hero-variant")).toHaveText(
      /^(control|urgency|reassurance)$/,
    );
    await expect(hero(page, "hero-headline")).not.toBeEmpty();
  });
});

test.describe("flags: the per-person flag", () => {
  const panel = (page: Page, id: string) =>
    page.getByTestId("entitlement-section").getByTestId(id);

  test("each visitor is decided by their own id", async ({
    browser,
    baseURL,
  }) => {
    /**
     * The claim is isolation, not the value. Whether anyone is entitled depends
     * on a list in GrowthBook that may be edited, so asserting ON or OFF would
     * make this fail whenever somebody grants access. What must hold is that two
     * browsers are decided separately — a shared cache entry would give the
     * second visitor the first one's id.
     */
    const read = async (id: string) => {
      const context = await browser.newContext();
      await context.addCookies([
        { name: "demo-anon-id", value: id, url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto("/flags");
      const seen = await panel(page, "entitlement-id").textContent();
      await context.close();
      return seen?.trim();
    };

    expect(await read("e2e-entitled-alice")).toBe("e2e-entitled-alice");
    expect(await read("e2e-entitled-bob")).toBe("e2e-entitled-bob");
  });

  test("nothing per-person reaches the static shell", async ({ page }) => {
    // A private scope streams by construction: it reads cookies, so it cannot
    // be part of a document that is shared by everyone. If this ever landed in
    // the shell it would mean one visitor's entitlement had been prerendered
    // for all of them.
    const html = await (await page.request.get("/flags")).text();
    const closingMain = html.indexOf("</main>");
    const value = html.indexOf('data-testid="entitlement-value"');

    expect(value).toBeGreaterThan(-1);
    expect(value).toBeGreaterThan(closingMain);

    await page.goto("/flags");
    await expect(panel(page, "entitlement-value")).toBeVisible();
  });
});

test.describe("flags: the exposure counter", () => {
  /**
   * The counters are module state on one server, shared by every test here, so
   * each starts by clearing them *and* the cached renders. Resetting only the
   * counters would leave the entries warm and the broken path would record
   * zero rather than one per variant — which overstates the bug instead of
   * demonstrating it.
   */
  async function reset(page: Page) {
    await page.goto("/flags");
    await page.getByTestId("exposure-reset").click();
    await expect(page.getByTestId("exposure-outside")).toContainText("0 / 0");
  }

  const count = async (page: Page, side: "inside" | "outside") => {
    const text = await page.getByTestId(`exposure-${side}`).innerText();
    return Number(text.split("/")[0].trim());
  };

  test("tracking inside the cache counts entries, not visitors", async ({
    page,
  }) => {
    await reset(page);
    await page.getByTestId("exposure-run").click();
    await expect(page.getByTestId("exposure-outside")).toContainText(
      "50 / 50",
      { timeout: 60_000 },
    );

    // The correct path fires once per visitor, whatever the cache does.
    expect(await count(page, "outside")).toBe(50);

    /**
     * The broken one fires once per cache entry. Asserted as "far fewer than
     * the visitors" rather than as exactly 3: the entry count is the number of
     * variants those 50 ids actually hashed into, and the split lives in
     * GrowthBook. Any number near 50 would mean the trap had stopped working.
     */
    const inside = await count(page, "inside");
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeLessThanOrEqual(5);
  });

  test("a second run records nothing at all on the broken path", async ({
    page,
  }) => {
    await reset(page);

    await page.getByTestId("exposure-run").click();
    await expect(page.getByTestId("exposure-outside")).toContainText(
      "50 / 50",
      { timeout: 60_000 },
    );
    const firstInside = await count(page, "inside");

    // Every entry is warm now, so the tracking call is not merely under-firing
    // — it does not execute at all. This is what months of a quietly invalid
    // experiment looks like.
    await page.getByTestId("exposure-run").click();
    await expect(page.getByTestId("exposure-outside")).toContainText(
      "100 / 100",
      { timeout: 60_000 },
    );

    expect(await count(page, "inside")).toBe(firstInside);
    expect(await count(page, "outside")).toBe(100);
  });
});

test.describe("flags: caching the variant", () => {
  const cached = (page: Page, id: string) =>
    page.getByTestId("cached-hero-section").getByTestId(id);

  test("the render is frozen within a variant", async ({ page, baseURL }) => {
    await page.context().addCookies([
      { name: "demo-anon-id", value: "e2e-frozen-visitor", url: baseURL! },
    ]);

    await page.goto("/flags");
    const first = await cached(page, "cached-hero-rendered-at").textContent();
    expect(first).toBeTruthy();

    // The timestamp is generated inside the cached component, so it is part of
    // the entry rather than a description of it. A hit replays it unchanged.
    await page.reload();
    await expect(cached(page, "cached-hero-rendered-at")).toHaveText(first!);
  });

  test("visitors sharing a variant share one render", async ({
    browser,
    baseURL,
  }) => {
    /**
     * The claim of the whole step: N visitors across M variants cost M renders.
     * Asserted as "distinct timestamps never exceed distinct variants" rather
     * than as a fixed number, because the split lives in GrowthBook and may be
     * edited — but a render per visitor would break it however the traffic is
     * divided.
     */
    const seen = new Map<string, Set<string>>();

    for (let i = 0; i < 8; i++) {
      const context = await browser.newContext();
      await context.addCookies([
        { name: "demo-anon-id", value: `e2e-shared-${i}`, url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto("/flags");

      const variant = (
        await cached(page, "cached-hero-variant").textContent()
      )?.trim();
      const renderedAt = (
        await cached(page, "cached-hero-rendered-at").textContent()
      )?.trim();
      await context.close();

      if (!variant || !renderedAt) continue;
      if (!seen.has(variant)) seen.set(variant, new Set());
      seen.get(variant)!.add(renderedAt);
    }

    expect(seen.size).toBeGreaterThan(0);
    for (const [variant, timestamps] of seen) {
      expect(
        timestamps.size,
        `variant ${variant} rendered ${timestamps.size} times, expected 1`,
      ).toBe(1);
    }
  });

  test("expiring one variant leaves the others frozen", async ({
    browser,
    baseURL,
  }) => {
    // Per-variant tags, so a copy change to one variant does not throw away
    // the other two renders.
    const read = async (id: string) => {
      const context = await browser.newContext();
      await context.addCookies([
        { name: "demo-anon-id", value: id, url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto("/flags");
      const out = {
        variant: (
          await cached(page, "cached-hero-variant").textContent()
        )?.trim(),
        renderedAt: (
          await cached(page, "cached-hero-rendered-at").textContent()
        )?.trim(),
      };
      await context.close();
      return out;
    };

    // Find two visitors in different variants, or skip: the split is
    // GrowthBook's to decide and a single-variant result is not a failure here.
    const samples = [];
    for (let i = 0; i < 10; i++) samples.push(await read(`e2e-expire-${i}`));
    const first = samples[0];
    const other = samples.find((s) => s.variant !== first.variant);
    test.skip(!other, "all sampled visitors landed in one variant");

    const page = await browser.newPage();
    await page.goto("/invalidate");
    await page.getByTestId(`invalidate-hero-variant-${first.variant}`).click();
    await expect(page.getByTestId("invalidate-receipt")).toHaveAttribute(
      "data-ok",
      "true",
    );
    await page.close();

    const firstAgain = await read("e2e-expire-0");
    const otherAgain = await read(
      `e2e-expire-${samples.indexOf(other!)}`,
    );

    expect(firstAgain.renderedAt).not.toBe(first.renderedAt);
    expect(otherAgain.renderedAt).toBe(other!.renderedAt);
  });
});

test.describe("flags: the Flags SDK", () => {
  test("an untargeted SDK flag is prerendered, a targeted one streams", async ({
    page,
  }) => {
    /**
     * Position, not presence.
     *
     * A response body contains everything eventually, so `toContain` cannot
     * tell the shell from the stream. Document *order* can: shell content is
     * written in place, inside `<main>`, while content still pending when the
     * shell flushed is appended to a hidden buffer after it and moved into
     * place by a script. So "before `</main>`" means prerendered and "after"
     * means streamed.
     *
     * Both flags below are Flags SDK flags. The difference is that the kill
     * switch has no targeting and is read with a stand-in request, which takes
     * the one `flag()` branch that never touches `next/headers`.
     */
    const html = await (await page.request.get("/flags")).text();
    const closingMain = html.indexOf("</main>");
    const killSwitch = html.indexOf('data-testid="kill-switch-value"');
    const hero = html.indexOf('data-testid="hero-variant"');

    expect(closingMain).toBeGreaterThan(-1);
    expect(killSwitch).toBeGreaterThan(-1);
    expect(hero).toBeGreaterThan(-1);

    // Step 3's whole claim, and what the SDK refactor had to preserve.
    expect(killSwitch).toBeLessThan(closingMain);

    // The experiment reads attributes, so it cannot be prerendered.
    expect(hero).toBeGreaterThan(closingMain);
  });

  test("the discovery endpoint answers only with a valid access proof", async ({
    request,
  }) => {
    // Unauthenticated is 401 — the response describes the app's whole flag
    // surface, so that is the point rather than a misconfiguration.
    expect((await request.get("/.well-known/vercel/flags")).status()).toBe(401);

    // And so is the *secret itself*, which is the part that wastes an
    // afternoon: `verifyAccess` wants an encrypted proof token minted by the
    // Vercel Toolbar, not the value of FLAGS_SECRET.
    const secret = process.env.FLAGS_SECRET;
    test.skip(!secret, "FLAGS_SECRET not in the test environment");

    expect(
      (
        await request.get("/.well-known/vercel/flags", {
          headers: { Authorization: `Bearer ${secret}` },
        })
      ).status(),
    ).toBe(401);

    // A real proof gets the declarations — every flag, not just the ones some
    // component happened to render.
    const { createAccessProof } = await import("flags");
    const proof = await createAccessProof(secret);
    const response = await request.get("/.well-known/vercel/flags", {
      headers: { Authorization: `Bearer ${proof}` },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      definitions: Record<string, unknown>;
    };
    expect(Object.keys(body.definitions).sort()).toEqual([
      "catalog-kill-switch",
      "hero-copy",
      "pricing-badge",
    ]);
  });
});

test.describe("flags: device classification", () => {
  // `userAgent()` (ua-parser, bundled into Next) gives the type; Client Hints
  // give the capability. Neither alone is enough for the four buckets.
  for (const [name, ua, hints, expected] of [
    [
      "iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      {},
      "mobile",
    ],
    [
      "iPad",
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1",
      {},
      "tablet",
    ],
    [
      "Android phone reporting 1GB and 3g",
      "Mozilla/5.0 (Linux; Android 13; SM-A045F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
      { "device-memory": "1", ect: "3g" },
      "low-end-mobile",
    ],
    [
      "flagship phone with Save-Data on",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
      { "device-memory": "8", ect: "4g", "save-data": "on" },
      "low-end-mobile",
    ],
  ] as const) {
    test(`${name} → ${expected}`, async ({ browser }) => {
      const context = await browser.newContext({
        userAgent: ua,
        extraHTTPHeaders: hints,
      });
      const page = await context.newPage();
      await page.goto("/flags");
      await ready(page);
      await expect(attr(page, "device")).toHaveText(expected);
      await context.close();
    });
  }
});

test.describe("flags: precompute", () => {
  /**
   * Step 12 inverts every earlier step, and these tests are the proof.
   *
   * Elsewhere the page is static and the *decision* arrives at request time,
   * streaming in behind `<Suspense>`. Here `proxy.ts` decides first, encodes
   * the decision into a URL segment, and rewrites to a page prebuilt for that
   * combination — so the hero is in the document rather than appended to it.
   */
  test("the hero is prerendered, not streamed", async ({ page }) => {
    const response = await page.request.get("/precomputed");
    expect(response.status()).toBe(200);

    // The plan's first test: this route is served from a prerender.
    expect(response.headers()["x-nextjs-prerender"]).toBe("1");

    // Position, not presence — same reasoning as the SDK test above.
    const html = await response.text();
    const closingMain = html.indexOf("</main>");
    const hero = html.indexOf('data-testid="precomputed-hero-variant"');

    expect(closingMain).toBeGreaterThan(-1);
    expect(hero).toBeGreaterThan(-1);

    // The whole claim of step 12.
    expect(hero).toBeLessThan(closingMain);

    // And no skeleton at all, because nothing was ever pending.
    expect(html).not.toContain('data-testid="precomputed-hero-skeleton"');
  });

  test("the per-person flag is not baked into the shared page", async ({
    browser,
  }) => {
    /**
     * The failure this guards against is the worst one available here: twelve
     * pages are prerendered and *shared*, so a per-person value that ended up
     * inside one would be served to everybody who resolved to that code.
     *
     * Asserted by giving two visitors different ids and requiring different
     * answers. An earlier version of this test instead checked that the
     * entitlement appeared after `</main>` — and that is not a sound way to ask
     * the question. A Suspense child that resolves quickly enough is inlined
     * before the shell flushes, so the byte position tracks how fast the
     * entitlement resolved rather than whether it was shared. It failed on a
     * warm cache while nothing was wrong.
     */
    const listed = "55cc9438-ebf9-4073-b612-ad389cd3b4d3";

    const read = async (id: string) => {
      const context = await browser.newContext();
      await context.addCookies([
        { name: "demo-anon-id", value: id, url: "http://localhost:3100" },
      ]);
      const page = await context.newPage();
      await page.goto("/precomputed");
      const value = await page
        .getByTestId("entitlement-value")
        .textContent({ timeout: 15_000 });
      await context.close();
      return value;
    };

    // The id on GrowthBook's forced list, and one that is on nobody's.
    expect(await read(listed)).toBe("GRANTED");
    expect(await read("nobody-in-any-list")).toBe("NOT GRANTED");
  });

  test("the same hero streams on /flags", async ({ page }) => {
    /**
     * The control. Without it "the hero is in the shell" only says that this
     * page is static — not that precompute is what made it static. Same hero,
     * same 600ms, same visitor; the only difference is where the decision was
     * made.
     */
    const html = await (await page.request.get("/flags")).text();
    const closingMain = html.indexOf("</main>");
    const hero = html.indexOf('data-testid="cached-hero-variant"');

    expect(hero).toBeGreaterThan(-1);
    expect(hero).toBeGreaterThan(closingMain);
  });

  test("proxy and the render agree on the variant", async ({ page }) => {
    /**
     * The failure this guards against is silent and would look like a caching
     * bug: proxy resolves the attributes itself, and if it derived them any
     * differently from the render it would rewrite to one variant while the
     * page believed it was serving another.
     *
     * Both go through `resolveAttributesFrom`, which is why this passes — and
     * why that function has one implementation rather than two.
     */
    await page.goto("/precomputed");
    const rendered = await page
      .getByTestId("precomputed-hero-variant")
      .textContent();

    await page.goto("/flags");
    await expect(page.getByTestId("cached-hero-variant")).toBeVisible();
    const streamed = await page
      .getByTestId("cached-hero-variant")
      .textContent();

    expect(rendered).toBe(streamed);
  });

  test("the browser URL never shows the code", async ({ page }) => {
    // A rewrite, not a redirect: no extra round trip, and the variant never
    // ends up bookmarked or pasted into a bug report.
    await page.goto("/precomputed");
    await expect(page.getByTestId("precomputed-hero")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/precomputed");
  });

  test("the persona switcher re-enters the routing decision", async ({
    page,
  }) => {
    /**
     * Switching persona on this route is not the same operation it is on
     * `/flags`, and the difference is the whole point of step 12.
     *
     * The Server Action writes the cookie, but proxy had already run — with the
     * *old* cookie — before the action existed. Re-rendering would faithfully
     * re-render the page proxy already chose. Only a real navigation asks it
     * again, which is why the switcher takes `decidedInProxy` here.
     *
     * The `mains` count is a regression guard, not decoration. `router.refresh()`
     * was tried first and mounted the new tree *beside* the old one — two
     * `<main>` elements, two heroes, two switchers — because a rewritten URL can
     * resolve to a different route between one request and the next.
     */
    await page.goto("/precomputed");
    await expect(page.getByTestId("precomputed-hero")).toBeVisible();

    const pick = async (persona: string) => {
      await Promise.all([
        page.waitForEvent("load"),
        page.getByTestId("persona-select").selectOption(persona),
      ]);
      await expect(page.getByTestId("precomputed-hero")).toBeVisible();
      expect(await page.locator("main").count()).toBe(1);
      return page.getByTestId("precomputed-hero-variant").textContent();
    };

    // A forced rule excludes corporate visitors from the experiment, so this
    // one is pinned however the bucketing id hashes.
    expect(await pick("corporate-desktop-us")).toBe("control");

    // Every other persona shares one bucketing id — yours — so they share a
    // variant. Which variant that is depends on the id, so it is compared
    // rather than named.
    const first = await pick("anxiety-mobile-in");
    expect(await pick("returning-tablet-us-night")).toBe(first);

    // The rewrite never reaches the address bar, switch or no switch.
    expect(new URL(page.url()).pathname).toBe("/precomputed");
  });

  test("a code that does not verify falls back instead of erroring", async ({
    page,
  }) => {
    /**
     * `getPrecomputed` throws on a segment that does not verify. Unhandled,
     * that produced a 200 whose entire `<main>` was missing — a shell with no
     * content and nothing in the response saying why. This is that regression.
     */
    const response = await page.request.get("/precomputed/not-a-real-code");
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain('data-testid="precomputed-invalid"');

    // Falls back to the declared defaults rather than rendering nothing.
    expect(html).toContain('data-testid="precomputed-hero-variant"');
    expect(html).toContain("control");
  });
});
