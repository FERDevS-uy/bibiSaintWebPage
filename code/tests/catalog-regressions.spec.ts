import { test, expect, type Locator, type Page } from "@playwright/test";

async function getProductHrefs(cards: Locator): Promise<string[]> {
  return cards.evaluateAll((elements) =>
    elements.flatMap((card) => {
      const link = card.matches("a[href]") ? card : card.querySelector("a[href]");
      const href = link?.getAttribute("href");
      return href ? [href] : [];
    })
  );
}

async function expectProductPage(page: Page, expectedPath: string): Promise<string[]> {
  await expect(page.locator("#products-list-grid")).toBeVisible();
  const cards = page.locator("#products-list-grid .producto_card");
  await expect(cards).toHaveCount(10);

  const hrefs = await getProductHrefs(cards);
  expect(hrefs).toHaveLength(10);
  for (const href of hrefs) {
    expect(new URL(href, page.url()).pathname).toMatch(/^\/producto\//);
  }

  expect(page.url()).toContain(expectedPath);
  return hrefs;
}

async function expectSSRResponse(response: Awaited<ReturnType<Page["goto"]>>): Promise<void> {
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  expect(html).toContain('id="products-list-grid"');
  expect(html).toContain('class="producto_card');
}

async function expectPagination(page: Page): Promise<void> {
  await expect(page.locator("#products-pagination")).toBeVisible();
  const totalPages = Number.parseInt((await page.locator("#totalPages").innerText()).trim(), 10);
  expect(totalPages).toBeGreaterThanOrEqual(2);
}

async function expectNextPageWithDifferentProducts(
  page: Page,
  firstPageHrefs: string[],
  expectedPath: string
): Promise<void> {
  const nextLink = page.locator('#products-pagination a[aria-label="Página siguiente"]');
  await expect(nextLink).toBeVisible();
  await expect(nextLink).toHaveAttribute("href", /\/page\/2(?:\?|$)/);
  await nextLink.click();

  await page.waitForURL((url) => url.pathname === expectedPath);
  await expect(page.locator("#actualPage")).toHaveText("2");
  const secondPageHrefs = await expectProductPage(page, expectedPath);

  expect(secondPageHrefs).not.toEqual(expect.arrayContaining(firstPageHrefs));
}

test.describe("Catalog SSR regressions", () => {
  test("Tecno renders the stable canonical empty state without fabricated cards", async ({ page }) => {
    const response = await page.goto("/categories/Tecno", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Sin Productos")).toBeVisible();
    await expect(page.locator("#products-list-grid .producto_card")).toHaveCount(0);
    await expect(page.locator("#products-pagination")).toHaveCount(0);
    expect(page.url()).toContain("/categories/Tecno");
  });

  test("offers render ten products and paginate to a different page", async ({ page }) => {
    const response = await page.goto("/ofertas", { waitUntil: "domcontentloaded" });
    await expectSSRResponse(response);
    await expect(page.locator(".offersHeader")).toBeVisible();
    await expect(page.locator(".offersMeta")).toBeVisible();

    const firstPageHrefs = await expectProductPage(page, "/ofertas");
    await expectPagination(page);

    await expectNextPageWithDifferentProducts(page, firstPageHrefs, "/ofertas/page/2");
  });

  test("Ropa Hombre renders the parent product and prefixed child products", async ({ page }) => {
    const response = await page.goto("/categories/Ropa/Hombre", { waitUntil: "domcontentloaded" });
    await expectSSRResponse(response);

    const cards = page.locator("#products-list-grid .producto_card");
    await expect(cards).toHaveCount(10);
    await expect
      .poll(
        () => page.locator('#products-list-grid .producto_card[data-subcategory*="Hombre - "]').count(),
      )
      .toBeGreaterThan(0);
    expect(page.url()).toContain("/categories/Ropa/Hombre");
  });
});
