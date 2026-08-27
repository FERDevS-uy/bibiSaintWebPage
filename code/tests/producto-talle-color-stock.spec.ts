import { test, expect } from "@playwright/test";

/**
 * Spec: Producto Kai - stock, talles y feedback de selección
 *
 * Flujo Kai: el cliente fetchea https://kaideco.uy/products/{handle}.js y
 * parsea la respuesta Shopify-style ({ product: { variants, options } }).
 * Se mockea con 4 variantes: talles XS/S/M disponibles y XL no disponible
 * (los numéricos 34-37 colapsan todos a "L" por normalizeSizes, por eso se
 * usan talles canónicos distintos).
 * La auto-verificación de stock corre en requestIdleCallback al cargar.
 *
 * PASS:
 *  (a) #stockBadge muestra "En Stock" (expect.poll hasta 15s)
 *  (b) Botones .size visibles para XS/S/M
 *  (c) Talle XL ausente o disabled
 *  (d) Seleccionar talle S -> botón marcado .selected y #sizeFeedback oculto
 *
 * NOTA (d): producción NO cambia el texto de #sizeFeedback al seleccionar un
 * talle; lo oculta agregando la clase .hidden (display:none). El assert
 * verifica el estado post-click (clase .selected en el botón + feedback
 * oculto), no el innerText del elemento oculto.
 *
 * NOTA: el edge case "color sin talles" es del flujo Martina (no hay productos
 * mdt- en CSV) -> no se incluye ningún assert de colores.
 */
test.describe("Producto Kai - talle, color y stock", () => {
  test("muestra stock, talles disponibles y feedback válido", async ({ page }) => {
    const fixture = {
      id: "10309657362746",
      title: "Producto Kai Test",
      handle: "kai-10309657362746",
      variants: [
        { id: 1, available: true, title: "XS", option1: "XS", price: "100.00" },
        { id: 2, available: true, title: "S", option1: "S", price: "100.00" },
        { id: 3, available: true, title: "M", option1: "M", price: "100.00" },
        { id: 4, available: false, title: "XL", option1: "XL", price: "100.00" },
      ],
      options: [{ name: "Talle", values: ["XS", "S", "M", "XL"] }],
    };

    await page.route("**/kaideco.uy/products/*.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: JSON.stringify(fixture),
      });
    });

    await page.goto("/producto/kai-10309657362746", { waitUntil: "domcontentloaded" });

    // (a) Badge de stock: se auto-verifica vía requestIdleCallback al cargar
    await expect
      .poll(
        async () => (await page.locator("#stockBadge").innerText().catch(() => "")).toLowerCase(),
        { timeout: 15_000 }
      )
      .toContain("en stock");

    // (b) Talles disponibles visibles
    for (const talle of ["XS", "S", "M"]) {
      await expect(page.locator(`.size[data-size="${talle}"]`)).toBeVisible({ timeout: 15_000 });
    }

    // (c) Talle XL: ausente o deshabilitado
    const talleXL = page.locator('.size[data-size="XL"]');
    if ((await talleXL.count()) > 0) {
      await expect(talleXL).toBeDisabled();
    }

    // (d) Seleccionar talle S -> estado válido y feedback sin error visible
    await page.locator('.size[data-size="S"]').click();
    // El botón queda marcado como seleccionado (producción agrega .selected)
    await expect(page.locator('.size[data-size="S"]')).toHaveClass(/selected/, {
      timeout: 10_000,
    });
    // El feedback de error queda oculto (producción agrega .hidden al seleccionar)
    await expect(page.locator("#sizeFeedback")).toBeHidden({ timeout: 10_000 });
  });
});
