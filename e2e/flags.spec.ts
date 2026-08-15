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

      const reason = page
        .getByTestId("targeting-section")
        .getByTestId("pricing-badge-reason");
      await expect(reason).toContainText(`country=${country}`);
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

    // The two mechanisms are the point of the section: a corporate visitor is
    // decided by a rule, never bucketed, and must not count towards a result.
    await expect(hero(page, "hero-mechanism")).toContainText("targeting");
    await expect(hero(page, "hero-mechanism")).not.toContainText("hashing");
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
    await expect(hero(page, "hero-mechanism")).toContainText("hashing");
    await expect(hero(page, "hero-headline")).not.toBeEmpty();
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
