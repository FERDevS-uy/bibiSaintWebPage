import { test, expect } from "@playwright/test";

/**
 * Spec: Home (/)
 *
 * PASS:
 *  - Hero carousel visible
 *  - >= 1 carrusel de productos con >= 1 card .carousel-item
 *  - Al menos un link que apunta a /producto/{id}
 *
 * Los carruseles son componentes Astro SSR; los islands se hidratan con
 * client:load (hook astro:page-load). Se usa la señal DOM (.carousel-item,
 * clase real de ProductCarousel.astro) como espera de hidratación.
 */
test.describe("Home", () => {
  test("muestra hero, carruseles con productos y links a /producto/", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Esperar hidratación/render de carruseles (astro:page-load)
    await expect
      .poll(async () => page.locator(".carousel-item").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Hero carousel visible (HeroBannerCarousel.astro — selectores candidatos)
    const hero = page
      .locator(
        '#hero, .hero, .hero-carousel, .hero-banner, [data-hero], [class*="hero-carousel"], [class*="hero-banner"]'
      )
      .first();
    await expect(hero).toBeVisible();

    // >= 1 carrusel con >= 1 card (en home los productos solo aparecen
    // dentro de ProductCarousel, que renderiza .carousel-item)
    const cards = page.locator(".carousel-item");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    // Al menos un link a /producto/{id}
    const productoLinks = page.locator('a[href*="/producto/"]');
    expect(await productoLinks.count()).toBeGreaterThanOrEqual(1);
  });
});
