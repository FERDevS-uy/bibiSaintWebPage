import { test, expect, type Page } from "@playwright/test";
import { encryptIDs } from "../src/utils/encription";

/**
 * Spec: Página /pedido (render 100% client-side, prerender estática)
 *
 * El token se arma como en renderCart: encryptIDs(array de JSON strings de
 * {id, cantidad, selectedColorId, selectedColorName, price}, "elias").
 *
 * PASS por caso:
 *  (a) Token válido (4 items: 1 mdt-, 1 alo-, 1 kai- con link, 1 id desconocido
 *      sin precio) -> 4 items renderizados, precios = los del token,
 *      total = suma exacta, warning de producto faltante (missingCount=1)
 *      visible, auto-check secuencial: badge martina -> ok, alondra -> error,
 *      kai -> ok.
 *  (b) Token inválido -> .pedido-message con "Error" visible, sin crash.
 *  (c) Sin param -> .pedido-message "No hay id de pedido".
 *  (d) 7 items (>5) -> #pedidoVerifyAll visible, botones .pedido-check-btn
 *      presentes, badges inician pending "Sin verificar" (auto-check NO corre).
 *
 * Mocks:
 *  - endpoint rest/v1/products de Supabase -> links de proveedor (ids = baseId
 *    con prefijo, tal como los usa la query `.in("id", baseIds)` del cliente).
 *  - endpoint /api/martina/product-price -> { price, inStock: true } (badge ok)
 *  - endpoint alondra-ecommerce-be.sitios.uy/api/products -> { price, in_stock: false } (badge error)
 *  - endpoint kaideco.uy/products/{handle}.js -> Shopify-style con variant available (badge ok)
 *  - productos.json -> 404 (tolerado, nunca rompe)
 */
function parseMoney(texto: string): number {
  const t = texto.replace(/[^\d.,-]/g, "");
  if (!t) return NaN;
  if (/,\d{2}$/.test(t) && !/\.\d{2}$/.test(t)) {
    return Number.parseFloat(t.replace(/\./g, "").replace(",", "."));
  }
  if (/\.\d{2}$/.test(t)) {
    return Number.parseFloat(t);
  }
  return Number.parseFloat(t.replace(/[.,]/g, ""));
}

const KAI_ID = "kai-10309657362746";
const KAI_LINK = `https://kaideco.uy/products/${KAI_ID}`;

function cartPayload(id: string, cantidad: number, price: string | null) {
  return { id, cantidad, selectedColorId: null, selectedColorName: null, price };
}

function makeToken(payloads: Array<Record<string, unknown>>): string {
  return encryptIDs(payloads.map((p) => JSON.stringify(p)), "elias");
}

function kaiShopifyFixture(): object {
  return {
    id: "10309657362746",
    title: "Producto Kai Test",
    handle: KAI_ID,
    variants: [{ id: 1, available: true, title: "36", option1: "36", price: "10000" }],
    options: [{ name: "Talle", values: ["36"] }],
  };
}

/** Routes que aplican a todos los casos (catálogo ausente, sin links). */
async function registerCommonRoutes(page: Page) {
  await page.route("**/productos.json", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
  );
  await page.route("**/rest/v1/products*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
}

/** Routes con proveedores vivos para el caso (a). */
async function registerProviderRoutes(page: Page) {
  await page.route("**/productos.json", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
  );
  await page.route("**/api/martina/product-price*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ price: "100", inStock: true, colors: [] }),
    })
  );
  await page.route("**/alondra-ecommerce-be.sitios.uy/api/products/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ price: "50", in_stock: false }),
    })
  );
  await page.route("**/kaideco.uy/products/*.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: JSON.stringify(kaiShopifyFixture()),
    })
  );
  // Última registrada: gana sobre la de array vacío (kai con link).
  await page.route("**/rest/v1/products*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: KAI_ID, provider_link: KAI_LINK }]),
    })
  );
}

test.describe("Pedido (/pedido)", () => {
  test("token válido: renderiza items, precios, total, warning y auto-check", async ({ page }) => {
    await registerProviderRoutes(page);

    const token = makeToken([
      cartPayload("mdt-1", 1, "100"),
      cartPayload("alo-2", 2, "50"),
      cartPayload(KAI_ID, 1, "100"),
      cartPayload("desconocido-9", 1, null),
    ]);

    await page.goto(`/pedido?id=${token}`, { waitUntil: "domcontentloaded" });

    // 4 items renderizados
    await expect
      .poll(async () => page.locator(".pedido-item").count(), { timeout: 15_000 })
      .toBe(4);

    // Precios visibles = los del token; el item desconocido sin precio
    await expect
      .poll(async () => page.locator(".pedido-item-price").allTextContents(), { timeout: 15_000 })
      .toEqual(["$100 c/u", "$50 c/u", "$100 c/u", "Precio no disponible"]);

    // Total = suma exacta: 100*1 + 50*2 + 100*1 = 300
    await expect
      .poll(
        async () => parseMoney(await page.locator(".pedido-total-row.main").innerText().catch(() => "")),
        { timeout: 15_000 }
      )
      .toBe(300);

    // Warning de producto faltante (missingCount = 1)
    await expect(
      page.locator("#result__container p", { hasText: /1 producto del pedido no tiene precio disponible/ })
    ).toBeVisible({ timeout: 15_000 });

    // Auto-check secuencial (4 <= 5): martina ok, alondra error, kai ok
    const badge = (n: number) => page.locator(".pedido-item").nth(n).locator(".pedido-stock-badge");
    await expect(badge(0)).toHaveClass(/ok/, { timeout: 15_000 });
    await expect(badge(1)).toHaveClass(/error/, { timeout: 15_000 });
    await expect(badge(2)).toHaveClass(/ok/, { timeout: 15_000 });
  });

  test("token inválido muestra Error sin crash", async ({ page }) => {
    await registerCommonRoutes(page);

    await page.goto("/pedido?id=garbage", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".pedido-message")).toContainText("Error", { timeout: 10_000 });
  });

  test("sin param id muestra mensaje de pedido faltante", async ({ page }) => {
    await registerCommonRoutes(page);

    await page.goto("/pedido", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".pedido-message")).toContainText("No hay id de pedido", { timeout: 10_000 });
  });

  test("7 items: sin auto-check, botón verificar todo y badges pending", async ({ page }) => {
    await registerCommonRoutes(page);

    const token = makeToken([
      cartPayload("mdt-1", 1, "100"),
      cartPayload("mdt-2", 1, "150"),
      cartPayload("mdt-3", 1, "200"),
      cartPayload("mdt-4", 1, "250"),
      cartPayload("kai-1", 1, "300"),
      cartPayload("alo-1", 1, "350"),
      cartPayload("alo-2", 1, "400"),
    ]);

    await page.goto(`/pedido?id=${token}`, { waitUntil: "domcontentloaded" });

    await expect
      .poll(async () => page.locator(".pedido-item").count(), { timeout: 15_000 })
      .toBe(7);

    await expect(page.locator("#pedidoVerifyAll")).toBeVisible({ timeout: 10_000 });
    // 7 botones por item + 1 "Verificar todo"
    await expect(page.locator(".pedido-check-btn")).toHaveCount(8, { timeout: 10_000 });

    // Badges inician pending "Sin verificar" (auto-check NO corre con >5 items)
    const badges = page.locator(".pedido-stock-badge");
    await expect(badges).toHaveCount(7);
    await expect(badges.first()).toHaveClass(/pending/);
    await expect(badges.first()).toHaveText("Sin verificar");

    // Tras esperar, siguen pending: nadie corrió el auto-check
    await page.waitForTimeout(2500);
    await expect(badges.first()).toHaveClass(/pending/);
    await expect(badges.first()).toHaveText("Sin verificar");
  });
});
