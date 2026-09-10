import { test, expect, type Page } from "@playwright/test";

/**
 * Spec: Coincidencia de totales carrito ↔ pedido con navegación REAL.
 *
 * Escenario: se navega la web y se cargan 20 productos reales del catálogo
 * CSV (kai-*, artículos del hogar "Hogar", sin talles obligatorios) usando el
 * botón "Añadir al Carrito" de cada página de producto. Luego:
 *   T1 = total visible en /carrito (#total)
 *   T2 = total del mensaje de WhatsApp (texto del href de #waBtn)
 *   T3 = total visible en la URL /pedido?p=... que genera el carrito
 *
 * PASS: T1, T2 y T3 son idénticos (normalizados, tolerancia 0.01). Protege la
 * regresión "el precio del carrito difiere del precio del pedido".
 *
 * Mocks (determinismo, sin red externa):
 *  - Cualquier request externo (kaideco.uy, cdn.shopify.com, supabase) → 404.
 *    El check en vivo de proveedor falla y la página conserva el PRECIO REAL
 *    del CSV (formatPrice sin decimales). Así el flujo usa precios del catálogo.
 *  - /productos.json y rest/v1/products → respuestas locales controladas antes
 *    de abrir /pedido (igual que totales-coincidencia.spec.ts).
 *
 * Nota de talles: los kai del hogar tienen check en vivo; si el check fallara
 * y aun así renderizara talles (ej. proveedor OK en el futuro), el helper
 * selecciona el primer talle disponible antes de agregar.
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

function captureBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

// 20 productos reales del CSV (src/data/productos.csv) con precio no vacío.
const PRODUCT_IDS = [
  "kai-10309657362746",
  "kai-10294001271098",
  "kai-10293993242938",
  "kai-9289116352826",
  "kai-9289118515514",
  "kai-10196951499066",
  "kai-10196932297018",
  "kai-10196922761530",
  "kai-10196907458874",
  "kai-10179451388218",
  "kai-10173812375866",
  "kai-10121360343354",
  "kai-10072731058490",
  "kai-10072673583418",
  "kai-10071874699578",
  "kai-10049598292282",
  "kai-9936291332410",
  "kai-9690876182842",
  "kai-9739318526266",
  "kai-9739290181946",
];

const INITIAL_STATUS = "Consulta en vivo desde proveedor.";

// Suma de los 20 precios del CSV (verificada): el total final, sin markup.
const EXPECTED_TOTAL = 52038;

async function registerMocks(page: Page): Promise<void> {
  // Todo lo externo falla → se conserva el precio del CSV (flujo real).
  await page.route(/^https?:\/\/(?!localhost)(?!127\.0\.0\.1)/, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
  );
}

async function addProductToCart(page: Page, productId: string): Promise<void> {
  await page.goto(`/producto/${productId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#addToCartBtn", { timeout: 15_000 });

  const addBtn = page.locator("#addToCartBtn");

  // Esperar a que se asiente el check en vivo del proveedor (se dispara solo al
  // cargar). Así conocemos si hay talles para habilitar el agregado.
  const status = page.locator("#stockCheckStatus");
  if ((await status.count()) > 0) {
    await expect
      .poll(async () => (await status.innerText().catch(() => "")).trim(), { timeout: 15_000 })
      .not.toBe(INITIAL_STATUS);
  }

  // Si el proveedor devolvió talles, seleccionar el primero disponible.
  // :visible descarta los botones del bloque hidden (server-rendered sin uso).
  const availableSize = page.locator(".size:not(.unavailable):visible").first();
  if ((await availableSize.count()) > 0) {
    await availableSize.click();
    await expect(availableSize).toHaveClass(/selected/, { timeout: 10_000 });
  }

  await expect(addBtn).toBeEnabled({ timeout: 10_000 });
  await addBtn.click();

  // Confirma el agregado (AGREGADO implica que addToCart terminó y el carrito
  // ya tiene la línea guardada).
  await expect(addBtn).toHaveText(/AGREGADO/i, { timeout: 8_000 });
}

test.describe("Carrito → pedido con 20 productos reales navegados", () => {
  test.setTimeout(240_000);

  test("T1 (carrito) == T2 (whatsapp) == T3 (pedido) con 20 productos", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await registerMocks(page);

    let t1 = NaN;
    let t2 = NaN;
    let t3 = NaN;

    try {
      // 1. Navegá y cargá 20 productos reales al carrito vía UI.
      for (const productId of PRODUCT_IDS) {
        await addProductToCart(page, productId);
      }

      // 2. /carrito: esperá el enlace de WhatsApp (implica render + total listo).
      await page.goto("/carrito", { waitUntil: "domcontentloaded" });

      let waHref = "";
      await expect
        .poll(
          async () => {
            waHref = (await page.locator("#waBtn").getAttribute("href").catch(() => null)) ?? "";
            return waHref;
          },
          { timeout: 15_000 },
        )
        .toContain("https://wa.me/59891361706");

      // 3. T1: total del carrito.
      await expect
        .poll(
          async () => {
            t1 = parseMoney(await page.locator("#total").innerText().catch(() => ""));
            return t1;
          },
          { timeout: 10_000 },
        )
        .toBeGreaterThan(0);

      // 4. T2 y token del mensaje de WhatsApp.
      const text = decodeURIComponent(new URL(waHref).searchParams.get("text") ?? "");
      const totalMatch = text.match(/Total:\s*\$([\d.,]+)/);
      expect(totalMatch, `Total ausente en mensaje WhatsApp. Errores:\n${browserErrors.join("\n") || "(none)"}`).not.toBeNull();
      t2 = parseMoney(totalMatch![1]);

      const tokenMatch = text.match(/pedido\?p=(v3_[A-Za-z0-9_-]+)/);
      expect(tokenMatch, `Token de pedido ausente. Errores:\n${browserErrors.join("\n") || "(none)"}`).not.toBeNull();
      const token = tokenMatch![1];

      // 5. /pedido con el token que generó el carrito.
      await page.route("**/productos.json", (route) =>
        route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
      );
      await page.route("**/rest/v1/products*", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
      );
      await page.goto(`/pedido?p=${token}`, { waitUntil: "domcontentloaded" });

      // Debe renderizar los 20 items (no auto-check: >5 líneas).
      await expect
        .poll(async () => page.locator(".pedido-item").count(), { timeout: 20_000 })
        .toBe(PRODUCT_IDS.length);

      // 6. T3: total en /pedido.
      await expect
        .poll(
          async () => {
            t3 = parseMoney(await page.locator(".pedido-total-row.main").innerText().catch(() => ""));
            return t3;
          },
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0);
    } catch (error) {
      throw new Error(
        `${String(error)}\nT1=${t1} T2=${t2} T3=${t3}\nBrowser errors:\n${
          browserErrors.join("\n") || "(none)"
        }`,
      );
    }

    // 7. Consistentes entre sí (tolerancia 0.01).
    expect(Number.isFinite(t1), `T1 no finito (${t1})`).toBe(true);
    expect(Number.isFinite(t2), `T2 no finito (${t2})`).toBe(true);
    expect(Number.isFinite(t3), `T3 no finito (${t3})`).toBe(true);
    expect(Math.abs(t1 - t2)).toBeLessThan(0.01);
    expect(Math.abs(t2 - t3)).toBeLessThan(0.01);
    expect(Math.abs(t1 - t3)).toBeLessThan(0.01);
    // El total debe ser exactamente la suma de los precios reales del CSV.
    expect(Math.abs(t1 - EXPECTED_TOTAL)).toBeLessThan(0.01);
    expect(Math.abs(t2 - EXPECTED_TOTAL)).toBeLessThan(0.01);
    expect(Math.abs(t3 - EXPECTED_TOTAL)).toBeLessThan(0.01);
  });
});