import { test, expect, type Page } from "@playwright/test";

/**
 * Spec: Coincidencia de totales carrito → WhatsApp → pedido
 *
 * Seed carrito 3 items: precios "100" (x1), "200.50" (x2), "50" (x1) → 551.
 *
 * Flujo:
 *  - /carrito: T1 = texto de #total.
 *  - /carrito: del href de #waBtn se extrae "Total: $X" (T2) y el token
 *    de la URL /pedido?p=v3_TOKEN.
 *  - /pedido?p=v3_TOKEN: T3 = total mostrado en .pedido-total-row.main.
 *
 * PASS: normalizando T1/T2/T3 (sin $, espacios ni separadores de miles,
 * comparación float con tolerancia 0.01) los 3 son idénticos = 551.
 *
 * Mocks en /pedido: productos.json 404 y Supabase sin links (los ids kai-*
 * quedan "Sin verificación", sin fetch externo; el total no depende de eso).
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
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function waitForWhatsAppHref(page: Page, browserErrors: string[]): Promise<string> {
  let href = "";
  try {
    await expect
      .poll(
        async () => {
          href = (await page.locator("#waBtn").getAttribute("href").catch(() => null)) ?? "";
          return href;
        },
        { timeout: 10_000 },
      )
      .toContain("https://wa.me/59891361706");
  } catch (error) {
    throw new Error(`${String(error)}\nBrowser errors:\n${browserErrors.join("\n") || "(none)"}`);
  }
  return href;
}

test.describe("Coincidencia de totales carrito → WhatsApp → pedido", () => {
  // Aislamiento: specs previas dejan estado residual (lastPedidoToken, carrito,
  // etc.) en localStorage/cookies que contamina este flujo en corrida completa.
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("T1 (carrito), T2 (mensaje wsp) y T3 (pedido) son idénticos = 551", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    const items = [
      { id: "kai-1", name: "Producto A", price: "100", cantidad: 1, img: "/img/a.jpg", selectedColorId: null, selectedColorName: null },
      { id: "kai-2", name: "Producto B", price: "200.50", cantidad: 2, img: "/img/b.jpg", selectedColorId: null, selectedColorName: null },
      { id: "kai-3", name: "Producto C", price: "50", cantidad: 1, img: "/img/c.jpg", selectedColorId: null, selectedColorName: null },
    ];

    await page.addInitScript((seed: typeof items) => {
      localStorage.clear();
      localStorage.setItem("carrito", JSON.stringify(seed));
    }, items);

    // T1: total en /carrito
    await page.goto("/carrito", { waitUntil: "domcontentloaded" });
    let t1 = NaN;
    await expect
      .poll(
        async () => {
          t1 = parseMoney(await page.locator("#total").innerText().catch(() => ""));
          return t1;
        },
        { timeout: 10_000 }
      )
      .toBe(551);

    // T2: total del mensaje de WhatsApp + token del pedido
    const href = await waitForWhatsAppHref(page, browserErrors);
    const text = decodeURIComponent(new URL(href).searchParams.get("text") ?? "");
    const totalMatch = text.match(/Total:\s*\$([\d.,]+)/);
    expect(totalMatch).not.toBeNull();
    const t2 = parseMoney(totalMatch![1]);

    const token = text.match(/pedido\?p=(v3_[A-Za-z0-9_-]+)/)?.[1] ?? "";
    expect(token).not.toBe("");

    // T3: total en /pedido
    await page.route("**/productos.json", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
    );
    await page.route("**/rest/v1/products*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.goto(`/pedido?p=${token}`, { waitUntil: "domcontentloaded" });

    let t3 = NaN;
    await expect
      .poll(
        async () => {
          t3 = parseMoney(await page.locator(".pedido-total-row.main").innerText().catch(() => ""));
          return t3;
        },
        { timeout: 15_000 }
      )
      .toBe(551);

    // Los 3 idénticos = 551 (tolerancia 0.01)
    expect(Math.abs(t1 - 551)).toBeLessThan(0.01);
    expect(Math.abs(t2 - 551)).toBeLessThan(0.01);
    expect(Math.abs(t3 - 551)).toBeLessThan(0.01);
    expect(Math.abs(t1 - t2)).toBeLessThan(0.01);
    expect(Math.abs(t2 - t3)).toBeLessThan(0.01);
    expect(Math.abs(t1 - t3)).toBeLessThan(0.01);
  });
});
