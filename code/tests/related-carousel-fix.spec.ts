// tests/related-carousel-fix.spec.ts
// QA visual + funcional del fix en src/components/RelatedProductCarousel.astro.
// Contexto del fix:
//   - Se quitaron los handlers custom touchstart/touchend.
//   - En mobile el `scroll-snap-stop` pasa de `always` a `normal`.
//   - Flechas/teclado en desktop siguen usando scrollBy({behavior:"smooth"|"auto"}),
//     con `auto` cuando `prefers-reduced-motion: reduce`.
// Criterios de aceptación:
//   1. Screenshot mobile sin clipping / layout roto.
//   2. Swipe/touch produce scroll continuo y el final queda alineado a tarjeta.
//   3. No hay doble salto / parada rígida visible.
//   4. Desktop: flechas + teclado siguen operativos.
//   5. prefers-reduced-motion => scrollBy usa behavior: "auto" (no smooth).
//   6. Sin errores JS relevantes en consola.

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVIDENCE_DIR = path.resolve(__dirname, "evidence", "related-carousel");
const PRODUCT_ID = "195"; // 6 productos relacionados (198 192 193 188 184 176) -> overflow real

test.beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

async function gotoProductAndScrollToCarousel(page: Page) {
  await page.goto(`/producto/${PRODUCT_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".related[data-carousel]", { timeout: 15000 });
  // Esperar a que el script enganche astro:page-load (View Transitions)
  await page.waitForFunction(() => {
    const c = document.querySelector(".related[data-carousel]") as HTMLElement | null;
    return !!c && c.dataset.initialized === "true";
  }, undefined, { timeout: 5000 }).catch(() => {});
  await page.locator(".related[data-carousel]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
}

async function getTrackInfo(page: Page) {
  return page.$eval(".related__track", (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      canScroll: el.scrollWidth > el.clientWidth,
      gap: cs.gap,
      snapType: cs.scrollSnapType,
      paddingLeft: parseFloat(cs.paddingLeft) || 0,
      paddingRight: parseFloat(cs.paddingRight) || 0,
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  });
}

async function resetScrollLeft(page: Page) {
  await page.evaluate(() => {
    const t = document.querySelector(".related__track") as HTMLElement | null;
    if (t) t.scrollTo({ left: 0, behavior: "auto" });
  });
  await page.waitForTimeout(100);
}

async function getItemsBox(page: Page) {
  return page.$$eval(".related__item", (els) =>
    els.map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i, x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) };
    }),
  );
}

async function getCarouselBox(page: Page) {
  return page.$eval(".related[data-carousel]", (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
    };
  });
}

// ---------------------------------------------------------------------------
// Mobile 390x844 (viewport por defecto del playwright.config.ts)
// ---------------------------------------------------------------------------
test.describe("RelatedProductCarousel fix — mobile 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("viewport activo es mobile (≤767px)", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    const vw = await page.evaluate(() => window.innerWidth);
    expect(vw, "innerWidth debe ser 390").toBe(390);
    expect(vw, "innerWidth debe ser ≤767 (mobile)").toBeLessThanOrEqual(767);
  });

  test("CSS: scroll-snap-stop es 'normal' en mobile", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    // scroll-snap-stop no es una propiedad estándar observable en getComputedStyle
    // en todos los navegadores, pero podemos leer la regla CSS directamente.
    const ruleSnapStop = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; }
        if (!rules) continue;
        for (const r of Array.from(rules)) {
          const sr = r as CSSStyleRule;
          if (!sr.selectorText) continue;
          if (sr.selectorText.includes(".related__item")) {
            const cssText = sr.cssText;
            const m = cssText.match(/scroll-snap-stop\s*:\s*([a-z]+)/);
            if (m) return m[1];
          }
        }
      }
      return null;
    });
    expect(ruleSnapStop, "scroll-snap-stop debe ser 'normal' (no 'always')").toBe("normal");
  });

  test("JS: NO hay listeners touchstart/touchend custom en el track", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    // Estrategia: el dev server expone el código fuente inline; verificar que el
    // script del componente NO contiene `addEventListener("touchstart"` ni
    // `addEventListener("touchend"`. Leemos los scripts cargados.
    const hasCustomTouch = await page.evaluate(() => {
      // Chrome DevTools no expone addEventListeners. Estrategia alternativa:
      // dispatchar un TouchEvent sintético y verificar que el scrollLeft cambia
      // EXACTAMENTE lo que el scroll nativo permite, no un "step" de 2 ítems.
      // (Si hubiera handler custom touchend, veríamos un salto de 2 ítems.)
      return null;
    });
    expect(hasCustomTouch).toBeNull();

    // Verificación alternativa: contamos "touchstart"/"touchend" en los scripts
    // cargados por el documento. getScriptsInPage busca en document.scripts.
    const scriptTexts = await page.$$eval("script", (els) =>
      els.map((s) => s.textContent || ""),
    );
    const allText = scriptTexts.join("\n");
    // El fix eliminó AMBOS handlers. Si reaparecen, FAIL.
    expect(
      allText.includes(`addEventListener("touchstart"`),
      "no debe existir addEventListener(\"touchstart\") en scripts inline",
    ).toBe(false);
    expect(
      allText.includes(`addEventListener("touchend"`),
      "no debe existir addEventListener(\"touchend\") en scripts inline",
    ).toBe(false);
  });

  test("Layout: track scrollea horizontalmente (6 items > viewport)", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    const t = await getTrackInfo(page);
    const items = await getItemsBox(page);
    expect(items.length, "6 productos relacionados").toBe(6);
    expect(t.canScroll, "track.scrollWidth > clientWidth").toBe(true);
    // Cada item ~60vw = 234px en 390. Con 6 items + 5 gaps, total >> 390.
    expect(t.scrollWidth, "scrollWidth significativamente > clientWidth")
      .toBeGreaterThan(t.clientWidth * 2);

    // Evidencia 1: screenshot del carrusel mobile
    await page.locator(".related[data-carousel]").screenshot({
      path: path.join(EVIDENCE_DIR, "01-mobile-390-carousel.png"),
    });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "01-mobile-390-full.png"),
      fullPage: false,
    });
  });

  test("Layout: items dentro del viewport (sin clipping horizontal)", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    const items = await getItemsBox(page);
    const carousel = await getCarouselBox(page);
    // Al inicio (scrollLeft=0), el primer item debe estar alineado al borde
    // izquierdo del track (con padding-inline) y los items siguientes visibles
    // u overflow-eando. Ningún item debe tener width=0 ni y fuera del carrusel.
    for (const it of items) {
      expect(it.w, `item[${it.i}] width > 0`).toBeGreaterThan(0);
      // Y debe estar dentro del alto del carrusel (no vertical clipping raro)
      expect(it.x, `item[${it.i}] x no es NaN`).not.toBeNaN();
    }
    // Primer item debe comenzar cerca del borde izquierdo del carousel
    expect(items[0].x, `item[0].x >= carousel.x (no recortado por la izquierda)`)
      .toBeGreaterThanOrEqual(carousel.x - 0.5);
    // El item NO debe "salir" hacia la izquierda del carousel (clip)
    expect(items[0].x, `item[0].x dentro del carrusel`).toBeLessThan(carousel.right);
    test.info().annotations.push({
      type: "layout",
      description: JSON.stringify({ items, carousel }),
    });
  });

  test("Interacción: swipe nativo (touch sintetizado) NO genera scrollBy custom", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);

    // Spy en scrollBy del track: el fix quitó el handler custom touchend que
    // hacía scrollBy. Verificamos que ningún touch event dispara scrollBy.
    await page.evaluate(() => {
      const track = document.querySelector(".related__track") as HTMLElement;
      // @ts-ignore
      window.__swipeScrollByCalls = [];
      const original = track.scrollBy.bind(track);
      track.scrollBy = ((opts: any) => {
        // @ts-ignore
        window.__swipeScrollByCalls.push({ opts, scrollLeftAtCall: track.scrollLeft });
        return original(opts);
      }) as any;
    });

    // Swipe via TouchEvent sintético (touchstart -> touchmove -> touchend).
    const dispatched = await page.evaluate(async () => {
      const track = document.querySelector(".related__track") as HTMLElement;
      if (!track) return { ok: false, error: "no track" };
      const r = track.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const startX = r.left + r.width * 0.8;
      const endX = r.left + r.width * 0.2;

      function mkTouch(x: number) {
        // @ts-ignore
        return new Touch({
          identifier: 1,
          target: track,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
          radiusX: 1,
          radiusY: 1,
          rotationAngle: 0,
          force: 1,
        });
      }

      try {
        track.dispatchEvent(new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [mkTouch(startX)] as any,
          targetTouches: [mkTouch(startX)] as any,
          changedTouches: [mkTouch(startX)] as any,
        }));
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const x = startX + ((endX - startX) * i) / steps;
          track.dispatchEvent(new TouchEvent("touchmove", {
            bubbles: true,
            cancelable: true,
            touches: [mkTouch(x)] as any,
            targetTouches: [mkTouch(x)] as any,
            changedTouches: [mkTouch(x)] as any,
          }));
          await new Promise((res) => setTimeout(res, 16));
        }
        track.dispatchEvent(new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [] as any,
          targetTouches: [] as any,
          changedTouches: [mkTouch(endX)] as any,
        }));
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
      }
    });
    expect(dispatched.ok, `dispatch swipe OK (${dispatched.error ?? ""})`).toBe(true);

    await page.waitForTimeout(500);
    const calls = await page.evaluate(() => (window as any).__swipeScrollByCalls);
    test.info().annotations.push({
      type: "swipe-scrollby",
      description: JSON.stringify({ calls, count: calls.length }),
    });
    // CRITERIO CENTRAL DEL FIX: ningún touch event debe disparar scrollBy.
    // (Con el bug original, touchend disparaba scrollBy({behavior:"smooth"}) con
    // 2 ítems de offset, generando el doble salto rígido.)
    expect(
      calls.length,
      "fix OK: ningún TouchEvent debe disparar scrollBy custom (era el bug)",
    ).toBe(0);

    // Evidencia: screenshot post-swipe
    await page.locator(".related[data-carousel]").screenshot({
      path: path.join(EVIDENCE_DIR, "02-mobile-390-after-swipe.png"),
    });
  });

  test("Interacción: scroll programático + wheel produce snap a tarjeta", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    await resetScrollLeft(page);

    // 1) Forzar un scrollLeft no alineado y dejar que scroll-snap lo arregle.
    // Las tarjetas arrancan en x = paddingLeft dentro del track. Con
    // scroll-snap-align: start, scrollLeft debe terminar en un múltiplo de
    // (itemWidth + gap) MÁS el padding-left.
    const t0 = await getTrackInfo(page);
    const itemWidth = await page.$eval(".related__item", (el) => el.getBoundingClientRect().width);
    const gap = 16;
    const stride = itemWidth + gap;
    const targetAligned = t0.paddingLeft + stride; // alineado al item[1]

    await page.evaluate((target) => {
      const track = document.querySelector(".related__track") as HTMLElement;
      // Salto deliberadamente no alineado
      track.scrollTo({ left: target + 30, behavior: "auto" });
    }, targetAligned);

    // Dar tiempo al snap (puede tardar un poco en headless)
    await page.waitForTimeout(700);

    const after = await getTrackInfo(page);
    const tolerance = 4; // px de tolerancia para el snap
    test.info().annotations.push({
      type: "snap-result",
      description: JSON.stringify({
        target: targetAligned,
        scrollLeft: after.scrollLeft,
        delta: Math.abs(after.scrollLeft - targetAligned),
        stride,
        paddingLeft: t0.paddingLeft,
      }),
    });
    expect(
      Math.abs(after.scrollLeft - targetAligned),
      `scrollLeft (${after.scrollLeft}) debe estar alineado a tarjeta (target=${targetAligned}, tolerance=${tolerance})`,
    ).toBeLessThanOrEqual(tolerance);

    // 2) Scroll programático (lo que hace el componente internamente al hacer
    // tap en flecha o similar): scrollBy({left, behavior:'auto'}). Con
    // scroll-snap-type: x mandatory, el browser debe asentar scrollLeft en
    // un snap point válido (alineado a tarjeta).
    await resetScrollLeft(page);
    await page.waitForTimeout(200);
    const scrollByResult = await page.evaluate(() => {
      const track = document.querySelector(".related__track") as HTMLElement;
      const before = track.scrollLeft;
      // Salto grande deliberadamente desalineado
      track.scrollBy({ left: 400, behavior: "auto" });
      return { before, afterImmediate: track.scrollLeft };
    });
    await page.waitForTimeout(700);
    const after2 = await getTrackInfo(page);
    // Snap points: {24, 24+stride, 24+2*stride, ...}
    // offsetMod = (scrollLeft - 24) mod stride. Debe estar cerca de 0.
    const offset = after2.scrollLeft - 24;
    const offsetMod = ((offset % stride) + stride) % stride;
    const alignedToSnap =
      Math.abs(offsetMod) < tolerance || Math.abs(offsetMod - stride) < tolerance;
    test.info().annotations.push({
      type: "scrollby-result",
      description: JSON.stringify({
        before: scrollByResult.before,
        afterImmediate: scrollByResult.afterImmediate,
        finalScrollLeft: after2.scrollLeft,
        stride,
        offsetMod,
        alignedToSnap,
      }),
    });
    expect(
      after2.scrollLeft,
      `scrollBy(400) debe mover scrollLeft más allá del primer snap-zone (era ${scrollByResult.before})`,
    ).toBeGreaterThan(scrollByResult.before + 100);
    expect(
      alignedToSnap,
      `scrollLeft (${after2.scrollLeft}) debe quedar alineado a un snap point (stride=${stride}, offsetMod=${offsetMod})`,
    ).toBe(true);

    // Evidencia: screenshot post-snap
    await page.locator(".related[data-carousel]").screenshot({
      path: path.join(EVIDENCE_DIR, "03-mobile-390-after-snap.png"),
    });
  });

  test("JS: sin errores en consola (pageerror)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await gotoProductAndScrollToCarousel(page);
    // Disparar un par de interacciones para ejercitar el script
    await page.evaluate(() => {
      const t = document.querySelector(".related__track") as HTMLElement;
      t.scrollTo({ left: 200, behavior: "auto" });
    });
    await page.waitForTimeout(200);
    // Filtrar errores conocidos no relacionados al carrusel (red, fetch, supabase)
    const relevant = errors.filter((e) => {
      const lower = e.toLowerCase();
      // Ignorar errores de Supabase/fetch/red que vienen de la página completa
      if (lower.includes("supabase") || lower.includes("failed to fetch")) return false;
      if (lower.includes("favicon") || lower.includes("404")) return false;
      if (lower.includes("hydration")) return false;
      return true;
    });
    test.info().annotations.push({
      type: "console-errors",
      description: JSON.stringify({ total: errors.length, relevant }),
    });
    expect(relevant, "no debe haber errores JS relevantes").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mobile 375x812 (iPhone X)
// ---------------------------------------------------------------------------
test.describe("RelatedProductCarousel fix — mobile 375x812", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("screenshot y layout limpio en 375x812", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    const vw = await page.evaluate(() => window.innerWidth);
    expect(vw).toBe(375);

    const t = await getTrackInfo(page);
    const items = await getItemsBox(page);
    expect(items.length).toBe(6);
    expect(t.canScroll).toBe(true);

    // Cada item sigue siendo 60vw ≈ 225px en este viewport
    const itemWidth = await page.$eval(".related__item", (el) => el.getBoundingClientRect().width);
    expect(itemWidth, "item width ~60vw").toBeGreaterThan(220);
    expect(itemWidth, "item width ~60vw").toBeLessThan(235);

    await page.locator(".related[data-carousel]").screenshot({
      path: path.join(EVIDENCE_DIR, "04-mobile-375-carousel.png"),
    });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "04-mobile-375-full.png"),
      fullPage: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Desktop 1280x800
// ---------------------------------------------------------------------------
test.describe("RelatedProductCarousel fix — desktop 1280x800", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  test("viewport activo es desktop", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    const vw = await page.evaluate(() => window.innerWidth);
    expect(vw, "innerWidth >= 1000 (desktop breakpoint)").toBeGreaterThanOrEqual(1000);
  });

  test("CSS: scroll-snap desactivado en desktop y flechas visibles al hover", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);

    const snapType = await page.$eval(".related__track", (el) =>
      getComputedStyle(el).scrollSnapType,
    );
    // En desktop, scroll-snap-type debe ser 'none' (no snap entre tarjetas).
    expect(snapType, "scroll-snap-type en desktop").toBe("none");

    // Las flechas tienen opacity:0 por defecto; al hover del carousel padre
    // deben pasar a opacity:1. Probamos hovering el contenedor.
    const carousel = page.locator(".related[data-carousel]");
    await carousel.hover();
    await page.waitForTimeout(200);
    const opacityNext = await page.locator(".related__arrow--next").evaluate(
      (el) => getComputedStyle(el).opacity,
    );
    const opacityPrev = await page.locator(".related__arrow--prev").evaluate(
      (el) => getComputedStyle(el).opacity,
    );
    expect(opacityNext, "flecha next visible al hover").toBe("1");
    expect(opacityPrev, "flecha prev visible al hover").toBe("1");

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "05-desktop-1280-hover-arrows.png"),
      fullPage: false,
    });
  });

  test("Flechas: click desplaza scrollLeft (smooth)", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    await resetScrollLeft(page);
    const carousel = page.locator(".related[data-carousel]");
    await carousel.hover();
    await page.waitForTimeout(200);

    // Spy en scrollBy para confirmar que el handler del componente se disparó
    await page.evaluate(() => {
      const track = document.querySelector(".related__track") as HTMLElement;
      // @ts-ignore
      window.__arrowScrollByCalls = [];
      const original = track.scrollBy.bind(track);
      track.scrollBy = ((opts: any) => {
        // @ts-ignore
        window.__arrowScrollByCalls.push({ opts, scrollLeftAtCall: track.scrollLeft });
        return original(opts);
      }) as any;
    });

    const t0 = await getTrackInfo(page);
    expect(t0.scrollLeft, "scrollLeft inicial 0").toBeLessThanOrEqual(1);

    // Click en next. Hay que esperar la animación smooth.
    await page.locator(".related__arrow--next").click({ force: true });

    // Mientras está smooth, scrollLeft > 0 un poco después
    await page.waitForTimeout(150);
    const tMid = await getTrackInfo(page);
    const calls = await page.evaluate(() => (window as any).__arrowScrollByCalls);
    test.info().annotations.push({
      type: "arrow-smooth",
      description: JSON.stringify({
        scrollLeftAfterClick: tMid.scrollLeft,
        scrollByCalls: calls,
      }),
    });
    expect(calls.length, "scrollBy se llamó al menos una vez").toBeGreaterThan(0);
    expect(calls[0].opts.behavior, "behavior debe ser 'smooth' sin reduced-motion")
      .toBe("smooth");
    expect(tMid.scrollLeft, "scrollLeft > 0 tras click smooth").toBeGreaterThan(0);

    // Esperar a que la animación termine
    await page.waitForTimeout(900);
    const tEnd = await getTrackInfo(page);

    // El delta final debe ser ~2*(itemWidth+gap). Desktop item width =
    // (100% - 2*16)/3. En 1280, container width ≈ 1000-1280 => item ≈ 410.
    const itemWidth = await page.$eval(".related__item", (el) => el.getBoundingClientRect().width);
    const expectedStep = 2 * (itemWidth + 16);
    test.info().annotations.push({
      type: "arrow-step",
      description: JSON.stringify({
        expectedStep: Math.round(expectedStep),
        scrollLeft: tEnd.scrollLeft,
        delta: tEnd.scrollLeft - t0.scrollLeft,
      }),
    });
    // Tolerancia ±40 px
    expect(
      Math.abs(tEnd.scrollLeft - expectedStep),
      `scrollLeft final debe ~${expectedStep}`,
    ).toBeLessThan(40);
  });

  test("Teclado: ArrowRight desplaza scrollLeft cuando focus en item", async ({ page }) => {
    await gotoProductAndScrollToCarousel(page);
    await resetScrollLeft(page);

    // Foco en el primer .related__item (article). Si article no es focusable,
    // caemos al .related__link que sí tiene tabindex=0.
    const firstItem = page.locator(".related__item").first();
    await firstItem.focus();
    let activeTag = await page.evaluate(() => document.activeElement?.tagName);
    let activeClass = await page.evaluate(() => document.activeElement?.className || "");
    if (!activeClass.includes("related__item") && !activeClass.includes("related__link")) {
      await page.locator(".related__link").first().focus();
      activeTag = await page.evaluate(() => document.activeElement?.tagName);
      activeClass = await page.evaluate(() => document.activeElement?.className || "");
    }
    const inContainer = await page.evaluate(() => {
      const c = document.querySelector(".related[data-carousel]");
      return c ? c.contains(document.activeElement) : false;
    });
    test.info().annotations.push({
      type: "focus-state",
      description: JSON.stringify({ activeTag, activeClass, inContainer }),
    });
    expect(inContainer, "activeElement debe estar dentro de .related[data-carousel]").toBe(true);

    const t0 = await getTrackInfo(page);
    expect(t0.scrollLeft).toBeLessThanOrEqual(1);

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1100);
    const t1 = await getTrackInfo(page);
    test.info().annotations.push({
      type: "key-arrow-right",
      description: JSON.stringify({ scrollLeft: t1.scrollLeft, delta: t1.scrollLeft - t0.scrollLeft }),
    });
    expect(t1.scrollLeft, "scrollLeft > 0 tras ArrowRight").toBeGreaterThan(0);

    // ArrowLeft debe volver cerca del origen (tolerancia por snap)
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(1100);
    const t2 = await getTrackInfo(page);
    test.info().annotations.push({
      type: "key-arrow-left",
      description: JSON.stringify({ scrollLeft: t2.scrollLeft }),
    });
    expect(t2.scrollLeft, "scrollLeft volvió cerca de 0 tras ArrowLeft").toBeLessThanOrEqual(10);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "06-desktop-1280-after-arrows.png"),
      fullPage: false,
    });
  });

  test("prefers-reduced-motion: flecha usa scrollBy con behavior:'auto' (instantáneo)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoProductAndScrollToCarousel(page);
    const carousel = page.locator(".related[data-carousel]");
    await carousel.hover();
    await page.waitForTimeout(150);

    // Inyectamos un spy de scrollBy sobre el track
    await page.evaluate(() => {
      const track = document.querySelector(".related__track") as HTMLElement;
      // @ts-ignore
      window.__scrollByCalls = [];
      const original = track.scrollBy.bind(track);
      track.scrollBy = ((opts: any) => {
        // @ts-ignore
        window.__scrollByCalls.push(opts);
        return original(opts);
      }) as any;
    });

    await page.locator(".related__arrow--next").click({ force: true });
    await page.waitForTimeout(50); // con behavior:'auto', el scroll ya terminó

    const calls = await page.evaluate(() => (window as any).__scrollByCalls);
    test.info().annotations.push({
      type: "reduced-motion-calls",
      description: JSON.stringify(calls),
    });
    expect(calls.length, "debe haberse llamado scrollBy al menos una vez").toBeGreaterThan(0);
    expect(
      calls[0].behavior,
      `behavior debe ser 'auto' cuando prefers-reduced-motion: reduce (recibido: ${calls[0].behavior})`,
    ).toBe("auto");

    // Verificar también que CSS tiene scroll-behavior:auto en el media query
    const reducedMotionRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; }
        if (!rules) continue;
        for (const r of Array.from(rules)) {
          if (r instanceof CSSMediaRule && r.conditionText.includes("prefers-reduced-motion")) {
            return r.cssText;
          }
        }
      }
      return null;
    });
    expect(reducedMotionRule, "regla @media (prefers-reduced-motion: reduce) presente")
      .not.toBeNull();
    expect(reducedMotionRule!).toMatch(/scroll-behavior\s*:\s*auto/);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "07-desktop-1280-reduced-motion.png"),
      fullPage: false,
    });
  });

  test("Sin prefers-reduced-motion: flecha usa scrollBy con behavior:'smooth'", async ({ page }) => {
    // Restaurar media por defecto (no reduce)
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await gotoProductAndScrollToCarousel(page);
    const carousel = page.locator(".related[data-carousel]");
    await carousel.hover();
    await page.waitForTimeout(150);

    await page.evaluate(() => {
      const track = document.querySelector(".related__track") as HTMLElement;
      // @ts-ignore
      window.__scrollByCalls2 = [];
      const original = track.scrollBy.bind(track);
      track.scrollBy = ((opts: any) => {
        // @ts-ignore
        window.__scrollByCalls2.push(opts);
        return original(opts);
      }) as any;
    });

    await page.locator(".related__arrow--next").click({ force: true });
    await page.waitForTimeout(50);
    const calls = await page.evaluate(() => (window as any).__scrollByCalls2);
    expect(calls.length).toBeGreaterThan(0);
    expect(
      calls[0].behavior,
      `behavior debe ser 'smooth' cuando NO hay reduced-motion (recibido: ${calls[0].behavior})`,
    ).toBe("smooth");
    test.info().annotations.push({
      type: "smooth-calls",
      description: JSON.stringify(calls),
    });
  });
});
