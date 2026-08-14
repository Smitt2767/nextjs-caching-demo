import { test, expect } from "@playwright/test";
import { instant } from "@next/playwright";

// A synchronous node of the route's static shell — never streamed data.
const SHELL_MARKER = "home-shell";

test.describe("instant nav: /", () => {
  // Initial load (hard navigation): the served document is the route's
  // prerendered static shell. instant() gates dynamic data for the duration of
  // the callback, so this only passes while the marker is genuinely in the
  // shell. baseURL is required because `page` is still about:blank when
  // instant() runs.
  test("shell is served on an initial load", async ({ page, baseURL }) => {
    await instant(
      page,
      async () => {
        await page.goto("/");
        await expect(page.getByTestId(SHELL_MARKER)).toBeVisible();
      },
      { baseURL },
    );
  });
});

// No soft-navigation guard yet: the app has a single route, so there is no
// <Link> to click and no destination App Shell to commit. Add the soft-nav
// spec (drive a real <Link> click inside instant()) alongside the second route.
