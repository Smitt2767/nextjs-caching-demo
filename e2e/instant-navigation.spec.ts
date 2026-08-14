import { test, expect, type Locator, type Page } from "@playwright/test";
import { instant } from "@next/playwright";

// A synchronous node of /ppr's static shell — never streamed data.
const SHELL_MARKER = "ppr-shell";

/** Which static card wraps each streamed body. */
const CARD_OF: Record<string, string> = {
  "country-slot": "country",
  "country-skeleton": "country",
  "cached-country-slot": "country-cached",
  "cached-country-skeleton": "country-cached",
  "component-country-slot": "country-component",
  "component-country-skeleton": "country-component",
  "cached-catalog": "catalog",
  "component-cached-catalog": "catalog-component",
  "private-all-slot": "private-all",
  "private-all-skeleton": "private-all",
  "private-component-slot": "private-component",
  "private-component-skeleton": "private-component",
  // Status readouts inside the streamed bodies, duplicated the same way.
  "cached-country-verdict": "country-cached",
  "cached-country-ms": "country-cached",
  "component-country-rendered-at": "country-component",
  "private-all-rendered-at": "private-all",
  "private-component-rendered-at": "private-component",
};

/**
 * Scope a streamed body to its card.
 *
 * While a boundary is in flight React parks a copy of its content in a hidden
 * buffer at the end of <body>, then a script moves it into place. For a moment
 * two nodes carry the same testid, which trips Playwright's strict mode. The
 * card wrapper is static and never inside the boundary, so scoping through it
 * always resolves exactly the placed copy.
 */
function slot(page: Page, testId: string): Locator {
  return page.getByTestId(`card-${CARD_OF[testId]}`).getByTestId(testId);
}

/** The shell is committed and the uncached slots are still gated. */
async function expectStaticShell(page: Page) {
  await expect(page.getByTestId(SHELL_MARKER)).toBeVisible();
  // Both catalogs are cached with no request-time input, so both prerender
  // into the shell — the data-cached one and the component-cached one alike.
  await expect(slot(page, "cached-catalog")).toBeVisible();
  await expect(slot(page, "component-cached-catalog")).toBeVisible();

  // Only the uncached slot is guaranteed to still be loading. The cached ones
  // resolve as fast as their cache allows, and on a warm cache that is fast
  // enough to ride along in the prefetched shell — so asserting a skeleton for
  // them here would depend on cache state rather than on the shell.
  await expect(slot(page, "country-skeleton")).toBeVisible();
  await expect(slot(page, "country-slot")).toHaveCount(0);
}

/** Every dynamic slot arrived once the lock released. */
async function expectSlotsArrived(page: Page) {
  await expect(slot(page, "country-slot")).toBeVisible();
  await expect(slot(page, "cached-country-slot")).toBeVisible();
  await expect(slot(page, "component-country-slot")).toBeVisible();
  await expect(slot(page, "private-all-slot")).toBeVisible();
  await expect(slot(page, "private-component-slot")).toBeVisible();
}

/**
 * Which of two slots commits first on a fresh load of /ppr.
 *
 * Asserted as a race rather than "is the other one still a skeleton", because
 * the skeleton is gone the moment its slot resolves — an assertion that has to
 * run inside that window is a coin flip under parallel load. A race has no
 * such window: it only compares arrival order, which is exactly the claim.
 *
 * "commit" so the previous document is gone before the waiters start —
 * otherwise both selectors match the old page and the race is meaningless.
 */
async function raceSlots(
  page: Page,
  a: { testId: string; name: string },
  b: { testId: string; name: string },
): Promise<string> {
  await page.goto("/ppr", { waitUntil: "commit" });
  return Promise.race([
    slot(page, a.testId)
      .waitFor({ timeout: 25000 })
      .then(() => a.name),
    slot(page, b.testId)
      .waitFor({ timeout: 25000 })
      .then(() => b.name),
  ]);
}

test.describe("instant nav: /ppr", () => {
  // Initial load (hard navigation): the served document is the route's
  // prerendered static shell. instant() gates dynamic data for the duration of
  // the callback, so this only passes while the marker is genuinely in the
  // shell. baseURL is required because `page` is still about:blank when
  // instant() runs.
  //
  // Self-validating: the shell must be present AND the streamed slots absent
  // under the lock. If the lock ever failed to engage, the slots would already
  // be there and toHaveCount(0) would fail — so this cannot pass vacuously.
  test("shell is served instantly on an initial load", async ({
    page,
    baseURL,
  }) => {
    await instant(
      page,
      async () => {
        await page.goto("/ppr");
        await expectStaticShell(page);
        // On a document request the lock gates every dynamic slot, however
        // warm its cache is: none of them are part of the static shell.
        for (const id of [
          "cached-country",
          "component-country",
          "private-all",
          "private-component",
        ]) {
          await expect(slot(page, `${id}-skeleton`)).toBeVisible();
          await expect(slot(page, `${id}-slot`)).toHaveCount(0);
        }
      },
      { baseURL },
    );

    await expectSlotsArrived(page);
  });

  // Soft navigation: clicking a real <Link> from /. The committed UI is the
  // destination's prefetched App Shell, which is a different code path from
  // the initial-load document — a boundary can cover one without covering the
  // other, so both are guarded.
  test("shell commits instantly on a client navigation from /", async ({
    page,
  }) => {
    await page.goto("/");
    const link = page.getByTestId("ppr-link");
    await expect(link).toBeVisible();

    await instant(page, async () => {
      await link.click();
      // Wait for the destination before asserting: a shared selector could
      // otherwise match the source page before /ppr commits.
      await page.waitForURL((url) => url.pathname === "/ppr");
      await expectStaticShell(page);

      // The payoff of caching: these resolved during prefetch, so they commit
      // WITH the shell instead of streaming in afterwards. The two shells
      // genuinely differ here — on an initial load these are still skeletons.
      await expect(slot(page, "component-country-slot")).toBeVisible();
      await expect(slot(page, "component-country-skeleton")).toHaveCount(0);
      await expect(slot(page, "private-component-slot")).toBeVisible();
    });

    await expectSlotsArrived(page);
  });
});

test.describe("index", () => {
  test("links to the demo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-shell")).toBeVisible();
    await expect(page.getByTestId("ppr-link")).toHaveAttribute("href", "/ppr");
  });

  test("explains the timing badges behind a collapsible", async ({ page }) => {
    await page.goto("/");

    const explainer = page.getByTestId("timing-explainer");
    await expect(explainer).toBeVisible();

    // Collapsed by default, but the highlighted code is already in the
    // document — the index is fully static, so nothing is fetched on open.
    const toggle = page.getByTestId("timing-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(explainer.locator(".shiki")).toHaveCount(1);
    await expect(explainer.locator(".shiki:visible")).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(explainer.locator(".shiki:visible")).toHaveCount(1);
    // The measurement it documents: the inline script, not an effect.
    await expect(explainer.locator(".shiki")).toContainText(
      "performance.now()",
    );

    await toggle.click();
    await expect(explainer.locator(".shiki:visible")).toHaveCount(0);
  });
});

test.describe("static wrappers", () => {
  // The wrapper requirement: frame, title, description and code for every slot
  // must be in the prerendered document, never inside the boundary they
  // describe. Asserted under the lock, where nothing dynamic can have arrived.
  const CARD_IDS = [
    "shell",
    "catalog",
    "catalog-component",
    "country",
    "country-cached",
    "country-component",
    "private-all",
    "private-component",
  ];

  test("every card and its disclosures are in the static shell", async ({
    page,
    baseURL,
  }) => {
    await instant(
      page,
      async () => {
        await page.goto("/ppr");
        for (const id of CARD_IDS) {
          await expect(page.getByTestId(`card-${id}`)).toBeVisible();
          await expect(page.getByTestId(`about-toggle-${id}`)).toBeVisible();
          await expect(page.getByTestId(`code-toggle-${id}`)).toBeVisible();
        }
        // Highlighted server-side, so the code is in the document too.
        await expect(page.locator(".shiki")).toHaveCount(CARD_IDS.length);
      },
      { baseURL },
    );
  });

  test("disclosures toggle independently", async ({ page }) => {
    await page.goto("/ppr");
    await expect(slot(page, "component-country-slot")).toBeVisible();

    // Collapsed by default: markup present, nothing shown.
    await expect(page.locator(".shiki:visible")).toHaveCount(0);

    for (const id of CARD_IDS) {
      await page.getByTestId(`code-toggle-${id}`).click();
    }
    await expect(page.locator(".shiki:visible")).toHaveCount(CARD_IDS.length);

    await page.getByTestId(`code-toggle-${CARD_IDS[0]}`).click();
    await expect(page.locator(".shiki:visible")).toHaveCount(
      CARD_IDS.length - 1,
    );

    // The "what this shows" notes are a separate, independent disclosure.
    const about = page.getByTestId("about-toggle-country");
    await expect(about).toHaveAttribute("aria-expanded", "false");
    await about.click();
    await expect(about).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("country slots", () => {
  for (const [code, price] of [
    ["IN", "₹1,499 / mo"],
    ["US", "$29 / mo"],
    ["UK", "£24 / mo"],
  ] as const) {
    test(`render ${code} content for the ${code} preference`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        { name: "demo-country", value: code, url: baseURL! },
      ]);
      await page.goto("/ppr");

      for (const testId of [
        "country-slot",
        "cached-country-slot",
        "component-country-slot",
        "private-all-slot",
        "private-component-slot",
      ]) {
        const panel = slot(page, testId);
        await expect(panel).toBeVisible();
        await expect(panel).toHaveAttribute("data-country", code);
        await expect(panel.getByTestId(`${testId}-price`)).toHaveText(price);
      }
    });
  }
});

test.describe("use cache, keyed by country", () => {
  // The performance claim this demo exists to make.
  test("a warm data-cached slot lands before the uncached slot", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "demo-country", value: "UK", url: baseURL! },
    ]);

    // First request fills the cache entry for UK (may be a hit already if an
    // earlier test warmed it — either way, the entry exists afterwards).
    await page.goto("/ppr");
    await expect(slot(page, "cached-country-slot")).toBeVisible();

    const winner = await raceSlots(
      page,
      { testId: "cached-country-slot", name: "data-cached" },
      { testId: "country-slot", name: "uncached" },
    );
    expect(winner).toBe("data-cached");

    await expect(slot(page, "cached-country-verdict")).toHaveText("cache HIT");
    // A hit skips the 2000ms lookup entirely: two digits of ms at most.
    await expect(slot(page, "cached-country-ms")).toHaveText(/^\d{1,2}ms$/);

    // And the uncached slot still pays full price on that same request.
    await expect(slot(page, "country-slot")).toBeVisible();
  });

  // Caching the component caches its rendered output, so the render is skipped
  // too — which the data-cached slot cannot do.
  test("a component-cached slot freezes its render and beats the data-cached one", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "demo-country", value: "US", url: baseURL! },
    ]);

    await page.goto("/ppr");
    await expect(slot(page, "component-country-slot")).toBeVisible();
    const firstRender = await slot(
      page,
      "component-country-rendered-at",
    ).textContent();

    // The component-cached slot skips a 400ms render the data-cached one still
    // pays, so the order is not a coin flip.
    const winner = await raceSlots(
      page,
      { testId: "component-country-slot", name: "component-cached" },
      { testId: "cached-country-slot", name: "data-cached" },
    );
    expect(winner).toBe("component-cached");

    // The render timestamp is baked into the cache entry: a hit replays the
    // same markup rather than rendering again.
    await expect(slot(page, "component-country-rendered-at")).toHaveText(
      firstRender!,
    );

    // Meanwhile the data-cached slot got its data free but still re-rendered.
    await expect(slot(page, "cached-country-slot")).toBeVisible();
    await expect(slot(page, "cached-country-ms")).toHaveText(/^\d{1,2}ms$/);
  });
});

test.describe("invalidation", () => {
  // These mutate server-wide cache state, so they must not share the server
  // with anything asserting a cache hit. Serial here, and `workers: 1` in the
  // config, together mean nothing else is in flight while they run. Each test
  // also establishes its own baseline first, so it is unaffected by whatever
  // ran before it.
  test.describe.configure({ mode: "serial" });

  /** Reads the two frozen timestamps that prove a cache entry was reused. */
  async function readStamps(page: Page) {
    await page.goto("/ppr");
    await expect(slot(page, "component-country-slot")).toBeVisible();
    const catalog = await page.getByTestId("card-catalog").innerText();
    return {
      catalog: catalog.match(/computed once at (\S+)/)?.[1],
      countryPanel: await slot(
        page,
        "component-country-rendered-at",
      ).textContent(),
    };
  }

  async function press(page: Page, testId: string) {
    await page.goto("/invalidate");
    await page.getByTestId(testId).click();
    await expect(page.getByTestId("invalidate-receipt")).toHaveAttribute(
      "data-ok",
      "true",
    );
  }

  test("updateTag expires one entry and leaves the rest cached", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "demo-country", value: "IN", url: baseURL! },
    ]);

    const before = await readStamps(page);
    // Nothing moves without an invalidation — otherwise the assertions below
    // would pass for the wrong reason.
    expect(await readStamps(page)).toEqual(before);

    await press(page, "invalidate-catalog-data");
    const after = await readStamps(page);

    expect(after.catalog).not.toBe(before.catalog);
    // Surgical: the country panel was not named, so it stays cached.
    expect(after.countryPanel).toBe(before.countryPanel);
  });

  test("revalidatePath drops everything on the route", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "demo-country", value: "IN", url: baseURL! },
    ]);

    const before = await readStamps(page);
    await press(page, "invalidate-ppr-path");
    const after = await readStamps(page);

    expect(after.catalog).not.toBe(before.catalog);
    expect(after.countryPanel).not.toBe(before.countryPanel);
  });

  test("rejects a tag that is not on the allowlist", async ({ page }) => {
    // The Server Action is a public endpoint; it must not expire arbitrary
    // tags just because a caller asked.
    await page.goto("/invalidate");
    const rejected = await page.evaluate(async () => {
      const form = document.querySelector(
        '[data-testid="invalidate-catalog-data"]',
      )!.parentElement as HTMLFormElement;
      const input = form.querySelector("input[name=tag]") as HTMLInputElement;
      input.value = "not-a-real-tag";
      form.requestSubmit();
      return true;
    });
    expect(rejected).toBe(true);

    const receipt = page.getByTestId("invalidate-receipt");
    await expect(receipt).toHaveAttribute("data-ok", "false");
    await expect(receipt).toContainText("Unknown tag");
  });
});

test.describe("use cache: private", () => {
  // The point of the group: navigating back shows no loading state, because
  // the result is held in the browser. The uncached control beside it does
  // reload, which is what makes the comparison meaningful.
  test("shows no loading state when navigating back", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "demo-country", value: "UK", url: baseURL! },
    ]);

    // Arrive once so the browser holds the private result.
    await page.goto("/ppr");
    await expect(slot(page, "private-component-slot")).toBeVisible();

    // Leave with the client router — no document load, so browser memory
    // survives.
    await page.getByRole("link", { name: "← all demos" }).click();
    await page.waitForURL((url) => url.pathname === "/");

    // The navigation back must happen INSIDE instant(), otherwise the lock is
    // acquired after everything has already streamed and gates nothing.
    await instant(page, async () => {
      await page.getByTestId("ppr-link").click();
      await page.waitForURL((url) => url.pathname === "/ppr");

      // Held in the browser: present with no skeleton at any point.
      //
      // The presence of a *skeleton* is the signal, not the absence of the
      // slot. Returning to a route re-renders it while React keeps the
      // previous copy mounted, so the old body lingers in the DOM either way —
      // what differs is whether a loading state appears alongside it.
      await expect(slot(page, "private-component-slot")).toBeVisible();
      await expect(slot(page, "private-component-skeleton")).toHaveCount(0);

      // Group 2's red slot is the identical component without the directive,
      // and it does show a loading state on this same navigation.
      await expect(slot(page, "country-skeleton")).toBeVisible();
    });
  });

  // The directive's other half, straight from the docs: nothing is stored on
  // the server, and browser memory does not survive a document load. Easy to
  // "optimise away" by mistake, and wrong if it ever changes.
  test("re-renders on a full reload, unlike the server-cached slot", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "demo-country", value: "UK", url: baseURL! },
    ]);

    await page.goto("/ppr");
    await expect(slot(page, "private-all-slot")).toBeVisible();
    const allPrivate = await slot(
      page,
      "private-all-rendered-at",
    ).textContent();
    const wrapped = await slot(
      page,
      "private-component-rendered-at",
    ).textContent();
    const serverCached = await slot(
      page,
      "component-country-rendered-at",
    ).textContent();

    await page.reload();
    await expect(slot(page, "private-all-slot")).toBeVisible();

    // The all-private slot keeps nothing on the server, and a reload clears
    // browser memory, so its timestamp MUST move.
    await expect(slot(page, "private-all-rendered-at")).not.toHaveText(
      allPrivate!,
    );

    // The wrapped slot's timestamp comes from the plain `use cache` component
    // inside it, which IS on the server — so it stays frozen even though the
    // private wrapper around it re-ran. That difference is the whole point of
    // splitting the scopes.
    await expect(slot(page, "private-component-rendered-at")).toHaveText(
      wrapped!,
    );
    // Same for group 2's server-cached slot, for comparison.
    await expect(slot(page, "component-country-rendered-at")).toHaveText(
      serverCached!,
    );
  });

  test("reads the cookie from inside the cached scope", async ({
    page,
    context,
    baseURL,
  }) => {
    // No uncached wrapper hoists this value — the private scope reads it
    // itself, which plain `use cache` cannot do.
    await context.addCookies([
      { name: "demo-country", value: "IN", url: baseURL! },
    ]);
    await page.goto("/ppr");

    const panel = slot(page, "private-component-slot");
    await expect(panel).toHaveAttribute("data-country", "IN");
    await expect(panel.getByTestId("private-component-slot-price")).toHaveText(
      "₹1,499 / mo",
    );
  });
});
