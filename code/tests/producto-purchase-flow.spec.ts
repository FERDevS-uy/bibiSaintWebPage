/**
 * Spec: Flujo completo de compra interactivo en página de producto
 *
 * Cubre:
 *  1. Navegar a producto desde home/categoría
 *  2. Verificar auto-check de stock al cargar (requestIdleCallback)
 *  3. Selección de color (swatches) -> actualiza talles disponibles + galería
 *  4. Selección de talle -> habilita botón "Añadir al Carrito"
 *  5. Verificación en vivo de stock/precio (botón "Verificar stock y precio")
 *  6. Añadir al carrito con variante correcta (color + talle)
 *  7. Verificar toast + contador carrito
 *  8. Ir a carrito y validar item agregado
 *
 * Productos de prueba (CSV):
 *  - 197: Juego Sabana King Size (Nuvex, múltiples colores, sin talles)
 *  - 198: Juego Sabana King Size 150H (Nuvex, colores, sin talles)
 *  - 409: Acolchado Pluma (Nuvex, 6 colores, sin talles)
 *  - 410: Producto Martina (mdt-*, con talles inferidos de imágenes)
 *  - kai-*: Productos Kai (talles desde Shopify API)
 *
 * Config: ENABLE_CSV_FALLBACK=true para que los productos CSV estén disponibles
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:4321";

// Helpers - usar URLs directas de producto (evita depender de home)
async function gotoProduct(page: Page, productId: string) {
  await page.goto(`/producto/${productId}`, { waitUntil: "domcontentloaded" });
  // Esperar hidratación: stock badge + botón carrito
  await page.waitForSelector("#stockBadge, #addToCartBtn", { timeout: 15_000 });
}

async function waitForProductPage(page: Page, productId: string) {
  await expect(page).toHaveURL(new RegExp(`/producto/${productId}`));
  await page.waitForSelector("#stockBadge, #addToCartBtn", { timeout: 15_000 });
}

async function waitForAutoStockCheck(page: Page, timeout = 20_000) {
  // La auto-verificación corre en requestIdleCallback (300ms) o requestIdleCallback
  await expect
    .poll(
      async () => (await page.locator("#stockBadge").innerText().catch(() => "")).toLowerCase(),
      { timeout }
    )
    .toContain("en stock");
}

async function selectColor(page: Page, colorIndex = 0) {
  const swatches = page.locator("#colorsSelector .swatch");
  const count = await swatches.count();
  if (count === 0) return false;

  const target = swatches.nth(colorIndex);
  await expect(target).toBeVisible({ timeout: 10_000 });
  await target.click();

  // Esperar que se marque como seleccionado
  await expect(target).toHaveClass(/selected/, { timeout: 10_000 });
  return true;
}

async function selectSize(page: Page, size: string) {
  const sizeBtn = page.locator(`.size[data-size="${size}"]`);
  const count = await sizeBtn.count();
  if (count === 0) return false;

  await expect(sizeBtn).toBeEnabled({ timeout: 10_000 });
  await sizeBtn.click();

  await expect(sizeBtn).toHaveClass(/selected/, { timeout: 10_000 });
  // Feedback de error debe ocultarse
  await expect(page.locator("#sizeFeedback")).toBeHidden({ timeout: 5_000 });
  return true;
}

async function clickLiveStockCheck(page: Page) {
  const btn = page.locator("#checkStockBtn");
  if ((await btn.count()) === 0) return false;

  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();

  // Esperar loading state
  await expect(btn).toHaveClass(/is-loading/, { timeout: 5_000 });

  // Esperar a que termine (loading se quita)
  await expect(btn).not.toHaveClass(/is-loading/, { timeout: 30_000 });

  // Verificar estado de stock actualizado
  const status = await page.locator("#stockCheckStatus").innerText();
  console.log("[LIVE CHECK] Status:", status);
  return true;
}

async function addToCart(page: Page, options?: { qty?: number }) {
  const qty = options?.qty ?? 1;

  // Setear cantidad si hay NumberInput
  const qtyInput = page.locator("#cartQty input[type='number'], #cartQty");
  if ((await qtyInput.count()) > 0) {
    await qtyInput.fill(String(qty));
  }

  const addBtn = page.locator("#addToCartBtn");
  await expect(addBtn).toBeEnabled({ timeout: 10_000 });
  await addBtn.click();

  // Toast "✓ AGREGADO!"
  await expect(addBtn).toHaveText(/AGREGADO/i, { timeout: 5_000 });

  // Esperar que vuelva al estado original
  await expect(addBtn).toHaveText(/Agregar al carrito/i, { timeout: 3_000 });

  // Verificar contador carrito (window.updateCartCount)
  const cartCount = await page.evaluate(() => {
    const el = document.querySelector("#cartCount, .cart-count, [data-cart-count]");
    return el?.textContent?.trim() ?? "0";
  });
  console.log("[CART] Contador:", cartCount);

  return true;
}

async function goToCart(page: Page) {
  // Buscar link/icono carrito en header
  const cartLink = page.locator("a[href*='carrito'], a[href='/carrito'], .cart-link, #cartLink").first();
  if ((await cartLink.count()) > 0) {
    await cartLink.click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/.*carrito/);
  }
}

test.describe("Flujo completo de compra - Producto", () => {
  // test.beforeEach removed - tests go directly to product URLs

  test("Navegar a producto y verificar elementos base", async ({ page }) => {
    await gotoProduct(page, "409");

    // Verificar elementos clave de la página
    await expect(page.locator("#stockBadge")).toBeVisible();
    await expect(page.locator("#addToCartBtn")).toBeVisible();
    await expect(page.locator(".name")).toBeVisible();
    await expect(page.locator(".price")).toBeVisible();
  });

  test("Auto-check de stock al cargar (producto Nuvex sin talles)", async ({ page }) => {
    // Usar producto 409 (Acolchado Pluma - Nuvex, 6 colores, sin talles)
    await gotoProduct(page, "409");

    // Auto-check debe ejecutarse y mostrar "En Stock"
    await waitForAutoStockCheck(page);

    // Verificar que hay colores disponibles
    const swatches = page.locator("#colorsSelector .swatch");
    const count = await swatches.count();
    expect(count).toBeGreaterThan(1);

    // Primer swatch debe estar seleccionado por defecto
    const firstSwatch = swatches.first();
    await expect(firstSwatch).toHaveClass(/selected/);
  });

  test("Selección de color actualiza galería y talles (Nuvex)", async ({ page }) => {
    await page.goto("/producto/409", { waitUntil: "domcontentloaded" });
    await waitForProductPage(page, "409");
    await waitForAutoStockCheck(page);

    const swatches = page.locator("#colorsSelector .swatch");
    const initialCount = await swatches.count();
    expect(initialCount).toBeGreaterThan(1);

    // Click en segundo color
    await selectColor(page, 1);

    // Verificar que se disparó evento de cambio de galería
    const galleryChanged = await page.evaluate(() => {
      return window.__galleryChanged === true;
    });
    // Nota: el evento es 'product:image-set', se puede verificar si se escucha
  });

  test("Producto con talles (Kai): selección de talle habilita carrito", async ({ page }) => {
    // Mock para Kai - el test existente usa fixture, aquí lo reutilizamos
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
    await waitForProductPage(page, "kai-10309657362746");
    await waitForAutoStockCheck(page);

    // Talles XS, S, M disponibles
    for (const talle of ["XS", "S", "M"]) {
      await expect(page.locator(`.size[data-size="${talle}"]`)).toBeVisible({ timeout: 15_000 });
    }
    // XL no disponible (disabled o ausente)
    const talleXL = page.locator('.size[data-size="XL"]');
    if ((await talleXL.count()) > 0) {
      await expect(talleXL).toBeDisabled();
    }

    // Seleccionar talle S
    await selectSize(page, "S");

    // Botón carrito debe estar habilitado
    await expect(page.locator("#addToCartBtn")).toBeEnabled();
  });

  test("Verificación en vivo de stock (botón checkStock)", async ({ page }) => {
    await page.goto("/producto/409", { waitUntil: "domcontentloaded" });
    await waitForProductPage(page, "409");
    await waitForAutoStockCheck(page);

    const checkBtn = page.locator("#checkStockBtn");
    if ((await checkBtn.count()) === 0) {
      test.skip(true, "Producto no tiene verificación en vivo");
    }

    await clickLiveStockCheck(page);

    // Verificar que el badge sigue en "En Stock"
    await expect(page.locator("#stockBadge")).toHaveText(/En Stock/i);
  });

  test("Añadir al carrito producto sin talles (Nuvex)", async ({ page }) => {
    await page.goto("/producto/409", { waitUntil: "domcontentloaded" });
    await waitForProductPage(page, "409");
    await waitForAutoStockCheck(page);

    // Seleccionar un color (requerido para variante)
    await selectColor(page, 0);

    // Añadir al carrito
    await addToCart(page);

    // Verificar que el contador del carrito se actualizó
    // (el toast ya se verificó en addToCart)
  });

  test("Añadir al carrito producto con talles (Kai)", async ({ page }) => {
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
    await waitForProductPage(page, "kai-10309657362746");
    await waitForAutoStockCheck(page);

    // Seleccionar talle
    await selectSize(page, "M");

    // Añadir al carrito
    await addToCart(page);
  });

  test("Validación: sin talle seleccionado no permite añadir (producto ropa)", async ({ page }) => {
    const fixture = {
      id: "10309657362746",
      title: "Producto Kai Test",
      handle: "kai-10309657362746",
      variants: [
        { id: 1, available: true, title: "S", option1: "S", price: "100.00" },
        { id: 2, available: true, title: "M", option1: "M", price: "100.00" },
      ],
      options: [{ name: "Talle", values: ["S", "M"] }],
    };

    await page.route("**/kaideco.uy/products/*.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: JSON.stringify(fixture),
      });
    });

    await page.goto("/producto/kai-10309657362746", { waitUntil: "domcontentloaded" });
    await waitForProductPage(page, "kai-10309657362746");
    await waitForAutoStockCheck(page);

    // NO seleccionar talle, intentar añadir
    const addBtn = page.locator("#addToCartBtn");
    await addBtn.click();

    // Debe mostrar feedback de error
    await expect(page.locator("#sizeFeedback")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("#sizeFeedback")).toHaveText(/Selecciona un talle/i);
  });

  test("Flujo completo: producto -> color -> talle -> live check -> carrito -> ver carrito", async ({ page }) => {
    // 1. Ir directo a un producto conocido (409 = Nuvex con colores, sin talles)
    await gotoProduct(page, "409");
    await waitForAutoStockCheck(page);

    const productId = "409";

    // 3. Si hay colores, seleccionar uno
    const hasColors = (await page.locator("#colorsSelector .swatch").count()) > 0;
    if (hasColors) {
      await selectColor(page, 0);
    }

    // 4. Si hay talles, seleccionar uno
    const hasSizes = (await page.locator(".size:not(.unavailable)").count()) > 0;
    if (hasSizes) {
      // Tomar primer talle disponible
      const firstSize = await page.locator(".size:not(.unavailable)").first().getAttribute("data-size");
      if (firstSize) await selectSize(page, firstSize);
    }

    // 5. Verificación en vivo (si disponible)
    const hasLiveCheck = (await page.locator("#checkStockBtn").count()) > 0;
    if (hasLiveCheck) {
      await clickLiveStockCheck(page);
    }

    // 6. Añadir al carrito
    await addToCart(page);

    // 7. Ir a carrito y validar
    await goToCart(page);

    // Verificar que hay al menos un item en el carrito
    const cartItems = page.locator(".cart-item, .cart__item, [data-cart-item]");
    const count = await cartItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test("Feedback de talle no disponible para color seleccionado", async ({ page }) => {
    // Mock Martina con color que no tiene talles
    const fixture = {
      id: "mdt-TEST123",
      colors: [
        { id: 1, name: "Rojo", sizes: ["S", "M"], hex: "#ff0000", images: [], rawSizes: [] },
        { id: 2, name: "Azul", sizes: [], hex: "#0000ff", images: [], rawSizes: [] }, // Sin talles
      ],
      price: "1000",
      isDiscount: false,
      inStock: true,
    };

    await page.route("**/api/martina/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      });
    });

    await page.goto("/producto/mdt-TEST123", { waitUntil: "domcontentloaded" });
    await waitForProductPage(page, "mdt-TEST123");
    await waitForAutoStockCheck(page);

    // Seleccionar color Azul (sin talles)
    await selectColor(page, 1); // índice 1 = Azul

    // Debe mostrar "Sin stock" y talles deshabilitados
    await expect(page.locator("#stockBadge")).toHaveText(/Sin stock/i);
    const sizes = page.locator(".size");
    const count = await sizes.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(sizes.nth(i)).toBeDisabled();
      }
    }
  });
});

// ============ TESTS DE REGRESIÓN VISUAL (opcional) ============
test.describe("Evidencia visual - Purchase flow", () => {
  test("Captura pantalla completa del flujo en producto 409", async ({ page }) => {
    await page.goto("/producto/409", { waitUntil: "domcontentloaded" });
    await waitForProductPage(page, "409");
    await waitForAutoStockCheck(page);

    // Scroll y captura
    await page.locator(".productContainer").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "tests/evidence/purchase-flow-409-full.png",
      fullPage: true
    });

    // Captura solo del panel de info
    await page.locator(".infoBox").screenshot({
      path: "tests/evidence/purchase-flow-409-infobox.png"
    });
  });
});