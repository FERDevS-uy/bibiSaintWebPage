import { test, expect } from "@playwright/test";
import { decryptIDs } from "../src/utils/encription";

/**
 * Spec: Link de WhatsApp del carrito
 *
 * Seed 10 items (ids mdt-/kai-/alo- variados, precios enteros simples,
 * cantidades variadas). En /carrito el botón #waBtn se arma con:
 *   https://wa.me/59891361706?text=Hola, quiero pedir: - Name xN ($precio) ...
 *   ... \nTotal: $X\n{origin}/pedido?id=TOKEN
 *
 * PASS:
 *  - href empieza con https://wa.me/59891361706
 *  - el texto del param `text` (decodificado) contiene los 10 nombres,
 *    un `Total:` con el valor correcto (calculado en el test) y `/pedido?id=`
 *  - el token del param id descifra (decryptIDs "elias") a 10 items JSON con
 *    campo `price` string presente.
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

test.describe("WhatsApp link del carrito", () => {
  test("arma href wa.me con detalle, total correcto y token descifrable", async ({ page }) => {
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
    await expect
      .poll(
        async () => (await page.locator("#waBtn").getAttribute("href").catch(() => null)) ?? "",
        { timeout: 10_000 }
      )
      .toContain("https://wa.me/59891361706");

    const href = (await page.locator("#waBtn").getAttribute("href")) ?? "";
    expect(href.startsWith("https://wa.me/59891361706")).toBe(true);

    // Texto del mensaje (decodificado)
    const rawText = new URL(href).searchParams.get("text") ?? "";
    const text = decodeURIComponent(rawText);
    expect(text).toContain("Hola, quiero pedir:");

    // Contiene los 10 nombres (patrón "name xN" para evitar falsos positivos)
    for (const it of items) {
      expect(text).toContain(`${it.name} x`);
    }

    // Total: con valor correcto
    const totalMatch = text.match(/Total:\s*\$([\d.,]+)/);
    expect(totalMatch).not.toBeNull();
    expect(parseMoney(totalMatch![1])).toBe(expectedTotal);

    // URL del pedido presente
    expect(text).toContain("/pedido?id=");

    // Token descifrable -> 10 items JSON con price string
    const tokenMatch = text.match(/pedido\?id=([A-Za-z0-9_-]+)/);
    expect(tokenMatch).not.toBeNull();
    const decrypted = decryptIDs(tokenMatch![1], "elias");
    expect(decrypted).toHaveLength(10);
    for (const raw of decrypted) {
      const item = JSON.parse(raw);
      expect(typeof item.id).toBe("string");
      expect(Number.isFinite(Number(item.cantidad))).toBe(true);
      expect(typeof item.price).toBe("string");
      expect(item.price.trim().length).toBeGreaterThan(0);
    }
  });
});
