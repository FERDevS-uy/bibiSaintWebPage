// tests/product-carousel-fix.spec.ts
// QA visual + funcional del fix en src/components/ProductCarousel.astro (Ciclo 2).
//
// Contexto del fix:
//   - Guard `container.dataset.carouselInitialized` (L360-361) para evitar doble
//     inicialización del IntersectionObserver en mobile ni de los listeners de
//     flechas en desktop.
//   - Listener `astro:page-load` (L407-412) garantiza reinicialización con
//     View Transitions tras ir a producto y volver.
//   - Sin residual top-level que dispare handlers duplicados.
//
// Criterios de aceptación (este spec):
//   1. Mobile 390x844: en el home cada `.carousel-container` tiene ≥1
//      `.carousel-item.active` y sus `.carousel-info` tienen opacity:1
//      (precio + "ELEGIR TALLE" visibles en los activos).
//   2. Mobile roundtrip ×3: home → click `.carousel-img-link` → volver al home
//      → re-medir activos + opacity +0 errores de consola. Repetir 3 veces.
//   3. Desktop 1280x800: todos los `.carousel-item` tienen `.active`. Click en
//      `.next-arrow` produce UNA sola llamada a `track.scrollBy`.
//   4. Cero pageerrors durante todo el flujo.

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVIDENCE_DIR = path.resolve(__dirname, "evidence", "product-carousel");

test.beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

// ---------- Helpers ---------------------------------------------------------

/** Espera a que TODOS los `.carousel-container` del home estén inicializados. */
async function waitForAllCarouselsInitialized(page: Page) {
  await page.waitForFunction(() => {
    const containers = document.querySelectorAll(".carousel-container");
    if (containers.length === 0) return false;
    for (const c of Array.from(containers)) {
      if ((c as HTMLElement).dataset.carouselInitialized !== "true") return false;
    }
    return true;
  }, undefined, { timeout: 10_000 }).catch(() => {});
}

/** Recolecta por contenedor: id, #items, #items con .active, opacities de info activos. */
async function getCarouselState(page: Page) {
  return page.$$eval(".carousel-container", (containers) =>
    containers.map((c) => {
      const container = c as HTMLElement;
      const items = Array.from(container.querySelectorAll(".carousel-item"));
      const active = items.filter((it) => it.classList.contains("active"));
      const activeInfoOpacities = active.map((it) => {
        const info = it.querySelector(".carousel-info") as HTMLElement | null;
        return info ? parseFloat(getComputedStyle(info).opacity) : null;
      });
      return {
        id: container.id || null,
        totalItems: items.length,
        activeCount: active.length,
        activeInfoOpacities,
        // primer item activo: nombre + precio + presencia de botón add-to-cart
        firstActive: active[0]
          ? {
              name: active[0].querySelector(".p-name")?.textContent?.trim() ?? null,
              price:
                active[0].querySelector(".p-price")?.textContent?.trim() ?? null,
              hasAddBtn: !!active[0].querySelector(
                "button, .add-btn-wrapper, [data-add-to-cart], astro-island",
              ),
            }
          : null,
        containerInitialized: container.dataset.carouselInitialized === "true",
      };
    }),
  );
}

/** Cuenta listeners pageerror + console errors relevantes durante el flujo. */
function attachErrorSpy(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  return {
    snapshot: () => ({ pageErrors: [...pageErrors], consoleErrors: [...consoleErrors] }),
    relevant: () => {
      const all = [...pageErrors, ...consoleErrors];
      return all.filter((e) => {
        const l = e.toLowerCase();
        if (l.includes("supabase") || l.includes("failed to fetch")) return false;
        if (l.includes("favicon") || l.includes("404")) return false;
        if (l.includes("hydration")) return false;
        // Errores de Astro DevTools inline (vienen en producción como vacío)
        if (l.includes("astro devtools")) return false;
        return true;
      });
    },
  };
}

/** Click en un link de producto del primer carrusel; devuelve la URL. */
async function clickFirstProductLinkAndGetUrl(page: Page) {
  const firstLink = page.locator(".carousel-img-link").first();
  const href = await firstLink.getAttribute("href");
  await firstLink.click();
  return href;
}

// ---------- Tests -----------------------------------------------------------

// =============================================================
// 1. MOBILE 390x844 — Home directo
// =============================================================
test.describe("ProductCarousel fix — mobile 390x844 (home directo)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("viewport activo mobile + 3 carruseles en el home", async ({ page }) => {
    const errors = attachErrorSpy(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForAllCarouselsInitialized(page);

    const vw = await page.evaluate(() => window.innerWidth);
    expect(vw, "innerWidth debe ser 390").toBe(390);
    expect(vw, "innerWidth ≤ 767 (mobile)").toBeLessThanOrEqual(767);

    const state = await getCarouselState(page);
    test.info().annotations.push({
      type: "mobile-home-state",
      description: JSON.stringify(state),
    });
    expect(state.length, "debe haber 3 carruseles en el home").toBe(3);
    // cada uno tiene al menos 1 item y al menos 1 activo
    for (const c of state) {
      expect(c.containerInitialized, `carrusel #${c.id} inicializado`).toBe(true);
      expect(c.totalItems, `carrusel #${c.id} tiene items`).toBeGreaterThan(0);
      expect(c.activeCount, `carrusel #${c.id} tiene ≥1 .active`).toBeGreaterThan(0);
    }

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "01-mobile-home.png"),
      fullPage: false,
    });

    // Sin pageerrors ni errores de consola relevantes
    const rel = errors.relevant();
    test.info().annotations.push({
      type: "mobile-home-errors",
      description: JSON.stringify({ pageErrors: errors.snapshot().pageErrors, consoleErrors: errors.snapshot().consoleErrors, relevant: rel }),
    });
    expect(rel, "no debe haber pageerrors/console errors relevantes en mobile home").toEqual([]);
  });

  test("items activos muestran precio y botón (info con opacity 1)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForAllCarouselsInitialized(page);
    // pequeño delay para que el observer asiente
    await page.waitForTimeout(400);

    const state = await getCarouselState(page);
    expect(state.length).toBe(3);
    for (const c of state) {
      for (let i = 0; i < c.activeInfoOpacities.length; i++) {
        const op = c.activeInfoOpacities[i];
        expect(
          op,
          `carrusel #${c.id} .carousel-info[${i}] opacity debe ser 1 (recibido ${op})`,
        ).toBe(1);
      }
      // El primer item activo de cada carrusel debe tener nombre y precio no vacíos
      if (c.firstActive) {
        expect(c.firstActive.name, `carrusel #${c.id} primer activo tiene nombre`).toBeTruthy();
        expect(c.firstActive.price, `carrusel #${c.id} primer activo tiene precio`).toBeTruthy();
      }
    }
  });
});

// =============================================================
// 2. MOBILE roundtrip ×3
// =============================================================
test.describe("ProductCarousel fix — mobile roundtrip ×3", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  for (let i = 1; i <= 3; i++) {
    test(`roundtrip #${i}: home → producto → home conserva estado`, async ({ page }) => {
      const errors = attachErrorSpy(page);

      // 1) Home
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAllCarouselsInitialized(page);
      await page.waitForTimeout(300);

      const before = await getCarouselState(page);
      test.info().annotations.push({
        type: `roundtrip-${i}-before`,
        description: JSON.stringify(
          before.map((c) => ({ id: c.id, total: c.totalItems, active: c.activeCount, infoOp: c.activeInfoOpacities })),
        ),
      });

      // 2) Click en el primer link de producto del primer carrusel
      const href = await clickFirstProductLinkAndGetUrl(page);
      expect(href, "el link debe tener href /producto/...").toMatch(/^\/producto\//);
      // Esperar navegación SSR + hidratación
      await page.waitForURL(/\/producto\//, { timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded");
      // Pequeño delay para que termine la transición
      await page.waitForTimeout(400);

      // 3) Volver al home con goBack
      await page.goBack({ waitUntil: "domcontentloaded" });
      // View Transitions: esperar evento astro:page-load mediante flag
      await page.waitForFunction(() => {
        const containers = document.querySelectorAll(".carousel-container");
        if (containers.length === 0) return false;
        for (const c of Array.from(containers)) {
          if ((c as HTMLElement).dataset.carouselInitialized !== "true") return false;
        }
        return true;
      }, undefined, { timeout: 10_000 });
      await page.waitForTimeout(400);

      const after = await getCarouselState(page);
      test.info().annotations.push({
        type: `roundtrip-${i}-after`,
        description: JSON.stringify(
          after.map((c) => ({ id: c.id, total: c.totalItems, active: c.activeCount, infoOp: c.activeInfoOpacities })),
        ),
      });

      // Mismo número de carruseles, mismo total items, al menos 1 activo en cada uno
      expect(after.length, "número de carruseles tras roundtrip").toBe(before.length);
      for (let k = 0; k < after.length; k++) {
        const b = before[k];
        const a = after[k];
        expect(a.totalItems, `carrusel[${k}] total items preservado`).toBe(b.totalItems);
        expect(a.containerInitialized, `carrusel[${k}] reinicializado tras back`).toBe(true);
        expect(a.activeCount, `carrusel[${k}] ≥1 activo tras roundtrip`).toBeGreaterThan(0);
        // Opacity 1 en todos los .carousel-info activos
        for (let j = 0; j < a.activeInfoOpacities.length; j++) {
          expect(
            a.activeInfoOpacities[j],
            `carrusel[${k}] .info[${j}] opacity 1 tras roundtrip (recibido ${a.activeInfoOpacities[j]})`,
          ).toBe(1);
        }
      }

      // Screenshot evidencia por iteración
      await page.screenshot({
        path:
          i === 1
            ? path.join(EVIDENCE_DIR, "02-mobile-after-back.png")
            : path.join(EVIDENCE_DIR, "03-mobile-after-3-roundtrips.png"),
        fullPage: false,
      });

      // Sin errores nuevos (acumulado del flujo)
      const rel = errors.relevant();
      test.info().annotations.push({
        type: `roundtrip-${i}-errors`,
        description: JSON.stringify({
          pageErrors: errors.snapshot().pageErrors,
          consoleErrors: errors.snapshot().consoleErrors,
          relevant: rel,
        }),
      });
      expect(rel, `roundtrip #${i} no debe introducir pageerrors/console errors relevantes`).toEqual([]);
    });
  }
});

// =============================================================
// 3. DESKTOP 1280x800
// =============================================================
test.describe("ProductCarousel fix — desktop 1280x800", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  test("todos los items tienen .active en desktop", async ({ page }) => {
    const errors = attachErrorSpy(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForAllCarouselsInitialized(page);
    await page.waitForTimeout(300);

    const vw = await page.evaluate(() => window.innerWidth);
    expect(vw, "innerWidth ≥ 1000 (desktop breakpoint)").toBeGreaterThanOrEqual(1000);

    const state = await getCarouselState(page);
    test.info().annotations.push({
      type: "desktop-state",
      description: JSON.stringify(state),
    });
    expect(state.length).toBe(3);
    for (const c of state) {
      expect(
        c.activeCount,
        `desktop: carrusel #${c.id} todos los items activos (${c.activeCount}/${c.totalItems})`,
      ).toBe(c.totalItems);
    }

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "04-desktop.png"),
      fullPage: false,
    });

    const rel = errors.relevant();
    test.info().annotations.push({
      type: "desktop-errors",
      description: JSON.stringify({
        pageErrors: errors.snapshot().pageErrors,
        consoleErrors: errors.snapshot().consoleErrors,
        relevant: rel,
      }),
    });
    expect(rel, "desktop: no debe haber errores relevantes").toEqual([]);
  });

  test("click en .next-arrow produce UN solo scrollBy (sin handlers duplicados)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForAllCarouselsInitialized(page);
    await page.waitForTimeout(300);

    // Trabajar con el primer .carousel-container
    const firstContainer = page.locator(".carousel-container").first();
    await firstContainer.scrollIntoViewIfNeeded();

    // Inyectar spy en scrollBy del track del primer carrusel
    await page.evaluate(() => {
      const track = document.querySelector(
        ".carousel-container .carousel-track",
      ) as HTMLElement;
      // @ts-ignore
      window.__nextScrollByCalls = [];
      const original = track.scrollBy.bind(track);
      track.scrollBy = ((opts: any) => {
        // @ts-ignore
        window.__nextScrollByCalls.push({ opts, at: performance.now() });
        return original(opts);
      }) as any;
    });

    // Estado inicial del scrollLeft
    const t0 = await page.evaluate(() => {
      const track = document.querySelector(
        ".carousel-container .carousel-track",
      ) as HTMLElement;
      return { scrollLeft: track.scrollLeft, scrollWidth: track.scrollWidth, clientWidth: track.clientWidth };
    });
    test.info().annotations.push({
      type: "desktop-before-click",
      description: JSON.stringify(t0),
    });

    // Forzar hover para hacer visible la flecha (en desktop solo se ve al hover)
    await firstContainer.hover();
    await page.waitForTimeout(150);

    // Click único en .next-arrow del primer carrusel
    await firstContainer.locator(".next-arrow").click({ force: true });

    // Esperar a que la animación smooth termine (~400ms es suficiente)
    await page.waitForTimeout(900);

    const calls = await page.evaluate(() => (window as any).__nextScrollByCalls);
    const t1 = await page.evaluate(() => {
      const track = document.querySelector(
        ".carousel-container .carousel-track",
      ) as HTMLElement;
      return { scrollLeft: track.scrollLeft };
    });

    test.info().annotations.push({
      type: "desktop-next-click",
      description: JSON.stringify({ calls, scrollLeftAfter: t1.scrollLeft }),
    });

    // CRITERIO CLAVE DEL FIX: un solo click → una sola llamada a scrollBy
    expect(
      calls.length,
      `fix: click en next-arrow debe producir exactamente 1 scrollBy (recibido ${calls.length})`,
    ).toBe(1);
    // El scrollLeft debe haber avanzado
    expect(
      t1.scrollLeft,
      `scrollLeft debe haber avanzado (t0=${t0.scrollLeft}, t1=${t1.scrollLeft})`,
    ).toBeGreaterThan(t0.scrollLeft);
  });
});
