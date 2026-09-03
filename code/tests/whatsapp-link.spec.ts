import { test, expect, type Page } from "@playwright/test";
import { decryptIDs, encryptIDs } from "../src/utils/encription";
import { decodeOrderTokenV2, decodeOrderTokenV3 } from "../src/utils/orderToken";

/**
 * Spec: Link de WhatsApp del carrito
 *
 * Seed 10 items (ids mdt-/kai-/alo- variados, precios enteros simples,
 * cantidades variadas). En /carrito el botón #waBtn se arma con un resumen:
 *   Hola, quiero hacer un pedido.\n\nN productos · M unidades
 *   Total: $X\nVer pedido: {origin}/pedido?p=v3_TOKEN
 *
 * PASS:
 *  - href empieza con https://wa.me/59891361706
 *  - el texto del param `text` contiene el resumen, un `Total:` con el valor
 *    correcto y un único enlace `/pedido?p=v3_`
 *  - el token gzip compacto descifra a 10 items con `price` string presente.
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

test.describe("WhatsApp link del carrito", () => {
  test("arma href wa.me con resumen, total correcto y token v3 descifrable", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    const items = [
      { id: "mdt-1", name: "Zapato M-1", price: "100", cantidad: 1, img: "/img/a.jpg", selectedColorId: null, selectedColorName: null },
      { id: "mdt-2", name: "Zapato M-2", price: "150", cantidad: 2, img: "/img/b.jpg", selectedColorId: null, selectedColorName: null },
      { id: "kai-1", name: "Zapato K-1", price: "200", cantidad: 1, img: "/img/c.jpg", selectedColorId: null, selectedColorName: null },
      { id: "kai-2", name: "Zapato K-2", price: "250", cantidad: 1, img: "/img/d.jpg", selectedColorId: null, selectedColorName: null },
      { id: "kai-3", name: "Zapato K-3", price: "300", cantidad: 1, img: "/img/e.jpg", selectedColorId: null, selectedColorName: null },
      { id: "alo-1", name: "Zapato A-1", price: "350", cantidad: 1, img: "/img/f.jpg", selectedColorId: null, selectedColorName: null },
      { id: "alo-2", name: "Zapato A-2", price: "400", cantidad: 2, img: "/img/g.jpg", selectedColorId: null, selectedColorName: null },
      { id: "mdt-3", name: "Zapato M-3", price: "450", cantidad: 1, img: "/img/h.jpg", selectedColorId: null, selectedColorName: null },
      { id: "kai-4", name: "Zapato K-4", price: "500", cantidad: 1, img: "/img/i.jpg", selectedColorId: null, selectedColorName: null },
      { id: "alo-3", name: "Zapato A-3", price: "550", cantidad: 1, img: "/img/j.jpg", selectedColorId: null, selectedColorName: null },
    ];
    const expectedTotal = items.reduce((s, it) => s + Number.parseFloat(it.price) * it.cantidad, 0);

    await page.addInitScript((seed: typeof items) => {
      localStorage.setItem("carrito", JSON.stringify(seed));
    }, items);

    await page.goto("/carrito", { waitUntil: "domcontentloaded" });

    // El href se arma en renderCart (astro:page-load)
    const href = await waitForWhatsAppHref(page, browserErrors);
    expect(href.startsWith("https://wa.me/59891361706")).toBe(true);

    // Texto del mensaje (decodificado)
    const rawText = new URL(href).searchParams.get("text") ?? "";
    const text = rawText;
    expect(text).toContain("Hola, quiero hacer un pedido.");

    // El mensaje es un resumen; no repite una línea por producto.
    expect(text).toContain("10 productos · 12 unidades");
    for (const it of items) expect(text).not.toContain(it.name);
    expect(text.match(/Ver pedido:/g)).toHaveLength(1);

    // Total: con valor correcto
    const totalMatch = text.match(/Total:\s*\$([\d.,]+)/);
    expect(totalMatch).not.toBeNull();
    expect(parseMoney(totalMatch![1])).toBe(expectedTotal);

    // URL gzip compacta del pedido presente
    expect(text).toContain("/pedido?p=v3_");

    // Token descifrable -> 10 items con price string
    const tokenMatch = text.match(/pedido\?p=(v3_[A-Za-z0-9_-]+)/);
    expect(tokenMatch).not.toBeNull();
    const snapshot = await decodeOrderTokenV3(tokenMatch![1]);
    expect(snapshot.items).toHaveLength(10);
    for (const item of snapshot.items) {
      expect(typeof item.id).toBe("string");
      expect(Number.isFinite(Number(item.cantidad))).toBe(true);
      expect(typeof item.price).toBe("string");
      expect(item.price.trim().length).toBeGreaterThan(0);
    }

    // La representación compacta es menor que el token JSON legado para este carrito.
    const legacyToken = encryptIDs(items.map((item) => JSON.stringify({ ...item, price: item.price ?? null })), "elias");
    expect(tokenMatch![1].length).toBeLessThan(legacyToken.length);
  });

  test("mantiene el enlace legacy si el pedido excede el límite compacto", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    const items = Array.from({ length: 101 }, (_, index) => ({
      id: `producto-${index}`,
      name: `Producto ${index}`,
      price: "10",
      cantidad: 1,
      img: "/img/a.jpg",
      selectedColorId: null,
      selectedColorName: null,
    }));

    await page.addInitScript((seed: typeof items) => {
      localStorage.setItem("carrito", JSON.stringify(seed));
    }, items);
    await page.goto("/carrito", { waitUntil: "domcontentloaded" });

    const href = await waitForWhatsAppHref(page, browserErrors);
    const text = new URL(href).searchParams.get("text") ?? "";
    expect(text).toContain("101 productos · 101 unidades");
    expect(text).toContain("/pedido?id=");
    expect(text).not.toContain("/pedido?p=v2_");

    const token = text.match(/pedido\?id=([A-Za-z0-9_-]+)/)?.[1] ?? "";
    expect(decryptIDs(token, "elias")).toHaveLength(101);
  });

  test("usa v2 si CompressionStream no está disponible", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await page.addInitScript(() => {
      try {
        Object.defineProperty(globalThis, "CompressionStream", {
          configurable: true,
          writable: true,
          value: undefined,
        });
      } catch {
        // Chromium exposes this property as configurable; this is only a guard.
      }
    });

    const items = [
      { id: "mdt-fallback-1", name: "Producto fallback", price: "100", cantidad: 1, img: "/img/a.jpg", selectedColorId: null, selectedColorName: null },
    ];
    await page.addInitScript((seed: typeof items) => {
      localStorage.setItem("carrito", JSON.stringify(seed));
    }, items);
    await page.goto("/carrito", { waitUntil: "domcontentloaded" });

    const href = await waitForWhatsAppHref(page, browserErrors);
    const text = new URL(href).searchParams.get("text") ?? "";
    const token = text.match(/pedido\?p=(v2_[A-Za-z0-9_-]+)/)?.[1] ?? "";
    expect(token).not.toBe("");
    expect(decodeOrderTokenV2(token).items).toHaveLength(1);
  });
});
