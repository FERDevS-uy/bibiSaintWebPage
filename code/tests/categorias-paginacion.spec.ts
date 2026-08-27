import { test, expect, type Locator } from "@playwright/test";

/**
 * Spec: Categoría Hogar - paginación SSR
 *
 * Supabase inalcanzable -> SSR cae a CSV determinista: Hogar = 265 productos,
 * 10/página -> 27 páginas. El routing de categorías es case-sensitive:
 * la URL canónica es /categories/Hogar (con mayúscula).
 *
 * PASS:
 *  - Exactamente 10 .producto_card en página 1
 *  - #totalPages >= 2 (CSV: "27")
 *  - Click en "Página siguiente" -> URL contiene /page/2
 *  - Página 2: 10 cards y primera card distinta de la página 1 (hrefs)
 */
async function getProductoHrefs(cards: Locator): Promise<(string | null)[]> {
  return cards.evaluateAll((els) =>
    els.map((c) => {
      const a = c.matches("a[href]") ? c : c.querySelector("a[href]");
      return a ? a.getAttribute("href") : null;
    })
  );
}

test.describe("Categoría Hogar - paginación", () => {
  test("pagina 10 productos por página y navega a página 2", async ({ page }) => {
    await page.goto("/categories/Hogar", { waitUntil: "domcontentloaded" });

    // Esperar render de la grilla (SSR + hidratación)
    await expect
      .poll(async () => page.locator(".producto_card").count(), { timeout: 15_000 })
      .toBe(10);

    // Contadores de paginación
    const totalPages = Number.parseInt((await page.locator("#totalPages").innerText()).trim(), 10);
    expect(totalPages).toBeGreaterThanOrEqual(2); // CSV determinista: 27 páginas
    await expect(page.locator("#actualPage")).toHaveText("1");

    // Hrefs de la página 1 (el link puede ser la card misma o un <a> dentro)
    const hrefsPag1 = await getProductoHrefs(page.locator(".producto_card"));
    expect(hrefsPag1).toHaveLength(10);
    expect(hrefsPag1.every(Boolean)).toBe(true);

    // Navegar a página 2
    const nextLink = page.locator('#products-pagination a[aria-label="Página siguiente"]');
    await expect(nextLink).toBeVisible();
    await nextLink.click();
    await page.waitForURL(/\/categories\/Hogar\/page\/2/);
    await expect(page.locator("#actualPage")).toHaveText("2");

    // Página 2: 10 cards y primera distinta de la página 1
    // El poll espera la re-renderización post-transición (evita comparar DOM viejo)
    let hrefsPag2: (string | null)[] = [];
    await expect
      .poll(
        async () => {
          hrefsPag2 = await getProductoHrefs(page.locator(".producto_card"));
          return hrefsPag2.length === 10 && hrefsPag2[0] !== hrefsPag1[0];
        },
        { timeout: 15_000 }
      )
      .toBe(true);

    expect(hrefsPag2[0]).not.toBe(hrefsPag1[0]);
  });
});
