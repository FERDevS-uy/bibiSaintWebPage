import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Search pagination contract for tasks 5.1/5.2.
 *
 * The browser API is mocked with page.route so these tests do not require
 * Supabase credentials or a particular CSV catalog. SSR-first intentionally
 * verifies the server-rendered catalog available from the running app.
 * Start the app in another terminal with `pnpm dev` when no Playwright
 * webServer is configured: `cd code && pnpm dev`.
 */

const API_PATH = "/api/search-products";

type FixtureProduct = {
  id: string;
  name: string;
  price: number;
  img: string[];
  enOferta: boolean;
};

function product(id: string, name: string): FixtureProduct {
  return {
    id,
    name,
    price: 100,
    img: [],
    enOferta: false,
  };
}

function jsonResponse(
  items: FixtureProduct[],
  metadata: { hasMore?: boolean; nextCursor?: string | null; version?: string; total?: number } = {},
) {
  return {
    items,
    hasMore: metadata.hasMore ?? false,
    nextCursor: metadata.nextCursor ?? null,
    version: metadata.version ?? "1",
    total: metadata.total ?? items.length,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function countSearchRequests(page: Page) {
  let count = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === API_PATH) count += 1;
  });
  return () => count;
}

test.describe("Search SSR and cursor pagination", () => {
  test("renders SSR results without a client API request on first mount", async ({ page }) => {
    const searchRequests = countSearchRequests(page);
    await page.route("**/api/search-products**", async (route) => {
      // This route must remain unused: the initial results come from SSR.
      await fulfillJson(route, { error: "unexpected client request" }, 500);
    });
    await page.goto("/search?q=bota", { waitUntil: "domcontentloaded" });

    const firstCard = page.locator(".producto_card").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.locator(".p-name")).not.toBeEmpty();
    expect(searchRequests()).toBe(0);
  });

  test("shows an error and retries the failed request", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/search-products**", async (route) => {
      requests += 1;
      if (requests === 1) {
        await fulfillJson(route, { error: "temporary failure" }, 503);
        return;
      }
      await fulfillJson(route, jsonResponse([product("retry-1", "Retry result")]));
    });

    await page.goto("/search?q=retry-fixture-query", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeEnabled();

    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.locator(".p-name").filter({ hasText: "Retry result" })).toBeVisible();
    expect(requests).toBe(2);
  });

  test("sends cursor and version when loading the next page", async ({ page }) => {
    const requests: URL[] = [];
    await page.route("**/api/search-products**", async (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      if (!url.searchParams.has("cursor")) {
        await fulfillJson(
          route,
          jsonResponse([product("cursor-1", "First page")], {
            hasMore: true,
            nextCursor: "cursor-token",
            version: "catalog-v7",
            total: 2,
          }),
        );
        return;
      }
      await fulfillJson(route, jsonResponse([product("cursor-2", "Second page")]));
    });

    await page.goto("/search?q=cursor-fixture-query", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".p-name").filter({ hasText: "First page" })).toBeVisible();

    await page.getByRole("button", { name: "Cargar más" }).click();
    await expect(page).toHaveURL(/cursor=cursor-token/);
    await expect(page).toHaveURL(/v=catalog-v7/);
    await expect(page.locator(".p-name").filter({ hasText: "Second page" })).toBeVisible();

    expect(requests).toHaveLength(2);
    expect(requests[1].searchParams.get("cursor")).toBe("cursor-token");
    expect(requests[1].searchParams.get("v")).toBe("catalog-v7");
  });

  test("does not let a stale query response overwrite the current query", async ({ page }) => {
    let releaseSlow!: () => void;
    const slowResponse = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    await page.route("**/api/search-products**", async (route) => {
      const query = new URL(route.request().url()).searchParams.get("q");
      if (query === "slow-fixture-query") {
        await slowResponse;
        await fulfillJson(route, jsonResponse([product("slow-1", "Stale slow result")]));
        return;
      }
      await fulfillJson(route, jsonResponse([product("fast-1", "Current fast result")]));
    });

    await page.goto("/search?q=slow-fixture-query", { waitUntil: "domcontentloaded" });
    await expect
      .poll(() => page.locator(".search-loading").count())
      .toBeGreaterThan(0);

    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("q", "fast-fixture-query");
      window.history.pushState({}, "", url);
      window.dispatchEvent(new CustomEvent("searchurlchange"));
    });

    await expect(page.locator(".p-name").filter({ hasText: "Current fast result" })).toBeVisible();
    releaseSlow();
    await expect(page.locator(".p-name").filter({ hasText: "Current fast result" })).toBeVisible();
    await expect(page.locator(".p-name").filter({ hasText: "Stale slow result" })).toHaveCount(0);
  });
});
