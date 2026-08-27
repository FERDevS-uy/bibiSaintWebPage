import { test, expect } from "@playwright/test";

/**
 * Spec: Carrito
 *
 * localStorage "carrito" = JSON array de {id, name, price, cantidad, img,
 * selectedColorId, selectedColorName} con price string. Render en astro:page-load.
 *
 * Items seed: A price "100" (qty 1), B price "200.50" (qty 2), C price "50" (qty 1)
 * Total inicial: 100*1 + 200.50*2 + 50*1 = 551.00
 *  - click .addOnce primer item  -> 651.00
 *  - click .removeBtn tercer item -> 601.00 (2 items)
 *  - reload -> estado persiste (2 items, 601.00)
 *
 * NOTA: addInitScript corre en CADA documento (incluido reload); un marker en
 * localStorage evita que el reload resiembre el estado original y permite
 * verificar persistencia.
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

test.describe("Carrito", () => {
  test("renderiza items, calcula total, modifica cantidades y persiste", async ({ page }) => {
    const items = [
      { id: "kai-1", name: "Producto A", price: "100", cantidad: 1, img: "/img/a.jpg", selectedColorId: null, selectedColorName: null },
      { id: "kai-2", name: "Producto B", price: "200.50", cantidad: 2, img: "/img/b.jpg", selectedColorId: null, selectedColorName: null },
      { id: "kai-3", name: "Producto C", price: "50", cantidad: 1, img: "/img/c.jpg", selectedColorId: null, selectedColorName: null },
    ];

    // Seed solo en la primera carga (marker: persistencia testeable en reload)
    await page.addInitScript((seed: typeof items) => {
      if (!localStorage.getItem("__cart_seeded")) {
        localStorage.setItem("carrito", JSON.stringify(seed));
        localStorage.setItem("__cart_seeded", "1");
      }
    }, items);

    await page.goto("/carrito", { waitUntil: "domcontentloaded" });

    // 3 items renderizados (cada item expone su .removeBtn)
    await expect
      .poll(async () => page.locator(".removeBtn").count(), { timeout: 10_000 })
      .toBe(3);
    await expect(page.locator("#cartEmpty")).toBeHidden();

    // Total inicial 551.00 (normalizado: sin $ ni separadores)
    await expect
      .poll(
        async () => parseMoney(await page.locator("#total").innerText().catch(() => "")),
        { timeout: 10_000 }
      )
      .toBeCloseTo(551, 2);

    // addOnce en el primer item -> total 651.00
    await page.locator(".addOnce").first().click();
    await expect
      .poll(
        async () => parseMoney(await page.locator("#total").innerText().catch(() => "")),
        { timeout: 10_000 }
      )
      .toBeCloseTo(651, 2);

    // removeBtn del tercer item -> desaparece y total 601.00
    await page.locator(".removeBtn").nth(2).click();
    await expect
      .poll(async () => page.locator(".removeBtn").count(), { timeout: 10_000 })
      .toBe(2);
    await expect
      .poll(
        async () => parseMoney(await page.locator("#total").innerText().catch(() => "")),
        { timeout: 10_000 }
      )
      .toBeCloseTo(601, 2);

    // Reload -> el estado persiste (2 items, total 601.00)
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => page.locator(".removeBtn").count(), { timeout: 10_000 })
      .toBe(2);
    await expect
      .poll(
        async () => parseMoney(await page.locator("#total").innerText().catch(() => "")),
        { timeout: 10_000 }
      )
      .toBeCloseTo(601, 2);
  });
});
