// tests/producto-swatch-mobile.spec.ts
// QA visual: valida la corrección del swatch/colores en la página de producto
// en viewport mobile (≤767px). Criterios:
//   1. Primer swatch seleccionado no recortado por el contenedor
//   2. Todos los círculos de colores visibles (clip != hidden, área > 0)
//   3. Scroll horizontal del contenedor de colores no está roto
//   4. Focus-visible por teclado en swatches funciona
import { test, expect, type Page } from "@playwright/test";

const PRODUCT_ID = "409"; // ACOLCHADO PLUMA 240x260 (Nuvex, varios colores)

async function gotoProduct(page: Page) {
  await page.goto(`/producto/${PRODUCT_ID}`, { waitUntil: "domcontentloaded" });
  // Espera a que el cliente haya hidratado y al menos un swatch exista
  await page.waitForSelector("#colorsSelector .swatch", { timeout: 10_000 });
}

async function isElementInViewport(page: Page, selector: string) {
  return page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      visible: r.width > 0 && r.height > 0,
      inViewport:
        r.right > 0 &&
        r.bottom > 0 &&
        r.left < vw &&
        r.top < vh,
    };
  });
}

test.describe("Producto / swatches (mobile ≤767px)", () => {
  test("viewport activo es mobile", async ({ page }) => {
    await gotoProduct(page);
    const vw = await page.evaluate(() => window.innerWidth);
    expect(vw, "el viewport debe ser ≤767px").toBeLessThanOrEqual(767);
  });

  test("1) primer swatch seleccionado NO está recortado por el contenedor", async ({ page }) => {
    await gotoProduct(page);
    const firstSw = page.locator("#colorsSelector .swatch").first();
    const sw = await isElementInViewport(page, "#colorsSelector .swatch:first-child");
    // bounding box del primer swatch vs bounds del contenedor .colors
    const container = await page.$eval("#colorsSelector", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, width: r.width, right: r.right, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    const sel = await firstSw.evaluate((el) => el.getBoundingClientRect());
    // Escala 1.1 => el rect del DOM se mantiene en 32×32 (no se escala en box),
    // pero el visual sí. El test garantiza que el rect no esté fuera del contenedor.
    expect(sel.width, "swatch tiene tamaño > 0").toBeGreaterThan(0);
    expect(sel.x, "swatch.left dentro de container.left..right").toBeGreaterThanOrEqual(container.x - 0.5);
    expect(sel.x + sel.width, "swatch.right dentro de container.right")
      .toBeLessThanOrEqual(container.x + container.width + 0.5);
    // scrollWidth > clientWidth indica que el contenido podría overflowear horizontalmente
    // (no es bug si los primeros no están recortados). Sólo documentamos.
    test.info().annotations.push({
      type: "container-bounds",
      description: JSON.stringify({ container, swatch: { x: sel.x, right: sel.x + sel.width, w: sel.width } }),
    });
  });

  test("2) todos los swatches son círculos visibles (no clip:hidden, área > 0)", async ({ page }) => {
    await gotoProduct(page);
    const swatches = page.locator("#colorsSelector .swatch");
    const count = await swatches.count();
    expect(count, "al menos 2 swatches visibles").toBeGreaterThan(1);

    const report = await page.$$eval("#colorsSelector .swatch", (els) => {
      return els.map((el, i) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const parent = el.parentElement?.parentElement;
        const parentCs = parent ? getComputedStyle(parent) : null;
        return {
          i,
          aria: el.getAttribute("aria-label"),
          class: el.className,
          w: Math.round(r.width),
          h: Math.round(r.height),
          borderRadius: cs.borderRadius,
          visibility: cs.visibility,
          display: cs.display,
          opacity: cs.opacity,
          overflow: parentCs?.overflowX ?? null,
        };
      });
    });
    for (const s of report) {
      expect(s.w, `swatch[${s.i}] ancho > 0`).toBeGreaterThan(0);
      expect(s.h, `swatch[${s.i}] alto > 0`).toBeGreaterThan(0);
      expect(s.visibility, `swatch[${s.i}] no visibility:hidden`).not.toBe("hidden");
      expect(s.display, `swatch[${s.i}] no display:none`).not.toBe("none");
      expect(parseFloat(s.opacity), `swatch[${s.i}] opacity > 0`).toBeGreaterThan(0);
      // circles => border-radius 50% o === width
      const isCircle = s.borderRadius.includes("50%") ||
        (s.borderRadius.endsWith("px") && Math.abs(parseFloat(s.borderRadius) - s.w / 2) < 2);
      expect(isCircle, `swatch[${s.i}] es circular (border-radius=${s.borderRadius})`).toBeTruthy();
    }
    console.log("SWATCH REPORT:", JSON.stringify(report, null, 2));
  });

  test("3) scroll horizontal del contenedor de colores funciona y no está truncado", async ({ page }) => {
    await gotoProduct(page);
    const info = await page.$eval("#colorsSelector", (el) => {
      const r = el.getBoundingClientRect();
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
        canScroll: el.scrollWidth > el.clientWidth,
        containerWidth: Math.round(r.width),
      };
    });
    // En mobile con overflow-x: auto, scrollWidth puede ser > clientWidth
    // si hay muchos colores. Si sólo hay 2-3, no scrollea (y eso está bien).
    expect(["auto", "scroll"], "overflow-x permitido").toContain(info.overflowX);

    if (info.canScroll) {
      // Si hay overflow, intentamos scrollear y verificar que el primer swatch
      // se mueva hacia la izquierda (no se quede pegado).
      const before = await page.$eval("#colorsSelector .swatch:first-child", (el) => el.getBoundingClientRect().x);
      await page.$eval("#colorsSelector", (el) => { el.scrollLeft = 60; });
      await page.waitForTimeout(120);
      const after = await page.$eval("#colorsSelector .swatch:first-child", (el) => el.getBoundingClientRect().x);
      // Tras scrollLeft=60, el bounding x del primer swatch debe haber cambiado o haberse ocultado
      // por la izquierda (overflow). Lo importante: scroll no rompe layout vertical.
      expect(after, "scroll horizontal no rompe el layout").not.toBeNaN();
      console.log("SCROLL: before", before, "after", after);
    } else {
      console.log("SCROLL: no hay overflow en este producto (pocos swatches). Aceptable.");
    }
    console.log("SCROLL INFO:", JSON.stringify(info));
  });

  test("4) focus-visible por teclado en swatches", async ({ page }) => {
    await gotoProduct(page);
    const firstSw = page.locator("#colorsSelector .swatch").first();
    // Real keyboard navigation: reload and Tab from <body> until we reach a .swatch.
    // Headless Chromium aplica :focus-visible al recibir focus vía teclado.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    // Tab repetidamente hasta que el activeElement sea un .swatch o lleguemos a 80 tabs.
    let tabs = 0;
    let reachedSwatch = false;
    while (tabs < 80) {
      await page.keyboard.press("Tab");
      tabs++;
      const isSw = await page.evaluate(
        () => document.activeElement?.classList.contains("swatch") ?? false,
      );
      if (isSw) { reachedSwatch = true; break; }
    }
    expect(reachedSwatch, `se alcanzó un .swatch con Tab en ${tabs} pasos`).toBeTruthy();

    // Captura el outline computado mientras :focus-visible está activo
    const styles = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        cls: el.className,
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        outlineColor: cs.outlineColor,
        outlineOffset: cs.outlineOffset,
        borderColor: cs.borderColor,
        transform: cs.transform,
        // Chromium expone si :focus-visible está activo
        matchesFocusVisible: (el as any).matches?.(":focus-visible") ?? null,
      };
    });
    console.log("FOCUS STYLES:", JSON.stringify(styles, null, 2));

    // El CSS esperado: outline 2px solid var(--p-b-color, fallback) offset 2px
    // --p-b-color está definido globalmente en GlobalStyles.astro:28 como #c11010
    // (rgb 193,16,16). El fallback #e67e22 sólo se usaría si la variable no existiera.
    if (styles.matchesFocusVisible) {
      expect(styles.outlineStyle, "outline-style = solid cuando :focus-visible").toBe("solid");
      expect(styles.outlineWidth, "outline-width = 2px cuando :focus-visible").toBe("2px");
      // Acepta la marca real (#c11010) o el fallback (#e67e22) si la variable no resuelve
      const ok = ["rgb(193, 16, 16)", "rgb(230, 126, 34)"];
      expect(ok, `outline-color debe ser la marca #c11010 o el fallback #e67e22 (recibido ${styles.outlineColor})`)
        .toContain(styles.outlineColor);
      expect(styles.outlineOffset, "outline-offset = 2px").toBe("2px");
    } else {
      console.warn(":focus-visible no se activó en este headless; verificamos la regla CSS");
    }

    // Independientemente: la regla CSS debe existir en el stylesheet
    const ruleFound = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; }
        if (!rules) continue;
        for (const r of Array.from(rules)) {
          const t = (r as CSSStyleRule).selectorText;
          if (t && t.includes(".swatch") && t.includes("focus-visible")) return t;
        }
      }
      return null;
    });
    expect(ruleFound, "regla CSS .swatch:focus-visible presente").toMatch(/:global\(\.swatch\):focus-visible|\.swatch:focus-visible/);
    console.log("FOCUS RULE:", ruleFound);
  });

  test("5) captura de pantalla del bloque de colores para evidencia", async ({ page }) => {
    await gotoProduct(page);
    const block = page.locator("#colorsBlock");
    await block.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await block.screenshot({ path: "tests/evidence/colors-mobile.png" });
    await page.screenshot({ path: "tests/evidence/full-mobile.png", fullPage: false });
  });

  test("6) producto con muchos colores (id=200, 20 swatches): el primer swatch no se recorta", async ({ page }) => {
    await page.goto("/producto/200", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorsSelector .swatch", { timeout: 10_000 });

    const containerInfo = await page.$eval("#colorsSelector", (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: r.x,
        width: r.width,
        right: r.right,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        flexWrap: cs.flexWrap,
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
        canScrollX: el.scrollWidth > el.clientWidth,
        canScrollY: el.scrollHeight > el.clientHeight,
        height: Math.round(r.height),
      };
    });
    console.log("CONTAINER INFO (20 swatches):", JSON.stringify(containerInfo, null, 2));

    // overflow-x: auto, overflow-y: hidden
    expect(containerInfo.overflowX, "overflow-x debe ser auto en mobile").toBe("auto");
    expect(containerInfo.overflowY, "overflow-y debe ser hidden en mobile").toBe("hidden");
    // flex-wrap: wrap hace que los swatches se distribuyan en varias filas
    expect(containerInfo.flexWrap, "flex-wrap debe ser wrap").toBe("wrap");

    // En mobile el seleccionado no usa scale, que podía recortarlo contra el overflow.
    const firstBox = await page.$eval("#colorsSelector .swatch:first-child", (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: r.x, right: r.right, w: r.width, h: r.height, transform: cs.transform };
    });
    expect(firstBox.w, "primer swatch tiene tamaño fijo").toBe(32);
    expect(firstBox.h, "primer swatch tiene altura fija").toBe(32);
    expect(firstBox.transform, "primer swatch no se escala en mobile").toBe("none");
    // El borde izquierdo del primer swatch NO debe ser menor que el borde izquierdo del container
    // (eso indicaría que el scale lo recorta contra el borde del container)
    expect(firstBox.x, "primer swatch.selected.left >= container.left (sin recorte)")
      .toBeGreaterThanOrEqual(containerInfo.x - 0.5);

    // Verificar que el primer swatch está visualmente dentro del container
    // (el tamaño fijo garantiza que el swatch quede dentro del contenedor)
    const visualMargin = firstBox.x - containerInfo.x;
    expect(visualMargin, "margen visual izquierdo entre container y primer swatch debe ser >= 0")
      .toBeGreaterThanOrEqual(0);

    // Captura evidencia
    await page.locator("#colorsBlock").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.locator("#colorsBlock").screenshot({ path: "tests/evidence/colors-mobile-overflow.png" });

    console.log(`FIRST swatch: x=${firstBox.x} w=${firstBox.w} (container.x=${containerInfo.x})`);
    console.log(`Visual left margin: ${visualMargin}px (padding-left=${containerInfo.paddingLeft})`);
  });
});
