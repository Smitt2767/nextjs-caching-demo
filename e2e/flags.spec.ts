import { test, expect, type Page } from "@playwright/test";

import { PERSONAS } from "../src/lib/personas";

/**
 * Steps 1 and 2 of FLAGS-PLAN.md: the bucketing id, and the four targeting
 * attributes that feed every flag decision after this.
 */

const ATTRS = ["id", "audience", "device", "country", "daypart"] as const;

/** Wait for the streamed panel before touching the switcher: the control is in
 *  the static shell, so it is clickable well before React has attached its
 *  handler, and on a slower device the change event lands on nothing. */
async function ready(page: Page) {
  await expect(page.getByTestId("attributes-panel")).toBeVisible();
}

test.describe("flags: the visitor id", () => {
  test("proxy mints one, and it survives a reload", async ({ page }) => {
    await page.goto("/flags");
    await ready(page);

    const first = await page.getByTestId("attr-id").textContent();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);

    await page.reload();
    await expect(page.getByTestId("attr-id")).toHaveText(first!);
  });

  test("a different browser gets a different id", async ({ page, browser }) => {
    await page.goto("/flags");
    await ready(page);
    const mine = await page.getByTestId("attr-id").textContent();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/flags");
    await ready(otherPage);
    const theirs = await otherPage.getByTestId("attr-id").textContent();
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

    for (const attr of ATTRS) {
      await expect(page.getByTestId(`attr-${attr}`)).not.toBeEmpty();
    }
  });

  test("a persona pins all four, and clearing it restores them", async ({
    page,
  }) => {
    const persona = PERSONAS.find((p) => p.id === "returning-tablet-us-night")!;

    await page.goto("/flags");
    await ready(page);
    const idBefore = await page.getByTestId("attr-id").textContent();

    await page.getByTestId("persona-select").selectOption(persona.id);
    for (const [key, value] of Object.entries(persona.attributes)) {
      await expect(page.getByTestId(`attr-${key}`)).toHaveText(value);
    }

    // The persona covers targeting only. The bucketing id is not a targeting
    // dimension and must not move, or every variant would reshuffle with it.
    await expect(page.getByTestId("attr-id")).toHaveText(idBefore!);

    await page.getByTestId("persona-select").selectOption("");
    await expect(page.getByTestId("attr-audience")).toHaveText("organic");
    await expect(page.getByTestId("attr-id")).toHaveText(idBefore!);
  });

  test("a campaign is captured on the landing request and then kept", async ({
    page,
  }) => {
    // Applies on this very request: proxy writes the cookie, and Next merges it
    // into the request's cookie store before the component reads it.
    await page.goto("/flags?utm_campaign=ad-anxiety");
    await ready(page);
    await expect(page.getByTestId("attr-audience")).toHaveText("ad-anxiety");

    // And survives the URL losing the parameter — otherwise a visitor would
    // silently reclassify as organic partway through an experiment.
    await page.goto("/flags");
    await ready(page);
    await expect(page.getByTestId("attr-audience")).toHaveText("ad-anxiety");
  });

  test("an unknown campaign is ignored rather than stored", async ({
    page,
  }) => {
    await page.goto("/flags?utm_campaign=not-a-real-audience");
    await ready(page);
    await expect(page.getByTestId("attr-audience")).toHaveText("organic");
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
      await expect(page.getByTestId("attr-device")).toHaveText(expected);
      await context.close();
    });
  }
});
