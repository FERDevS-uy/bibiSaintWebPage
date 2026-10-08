import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const source = readFileSync(new URL("../src/components/admin/ProductList.tsx", import.meta.url), "utf8");
const componentCssSource = source.match(/<style>\s*([\s\S]*?)\s*<\/style>/)?.[1];
assert.ok(componentCssSource, "ProductList must provide its actual suggestion styles");
const componentCss = componentCssSource.replace(/^\{\s*/, "").replace(/\s*\}$/, "");
assert.match(componentCss, /@media \(min-width: 1280px\)[\s\S]*?--featured-cols: repeat\(2, minmax\(0, 1fr\)\)/);

// Read only static React.CSSProperties object literals from ProductList. This intentionally
// rejects expressions rather than evaluating application code or importing the component.
function inlineStyle(name: string): string {
  const declaration = source.match(new RegExp(`const ${name}: React\\.CSSProperties\\s*=\\s*\\{([^}]*)\\}`));
  assert.ok(declaration, `missing static style constant ${name}`);
  const body = declaration[1].replace(/\s+as\s+["'](?:column|cover)["']/g, "");
  const declarations = [...body.matchAll(/([A-Za-z][\w]*)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?)/g)];
  const residue = body.replace(/([A-Za-z][\w]*)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?)/g, "").replace(/[,\s]/g, "");
  assert.equal(residue, "", `${name} must contain only static string/number declarations`);
  assert.ok(declarations.length, `${name} has no declarations`);
  return declarations.map(([, property, rawValue]) => {
    const cssProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const value = rawValue.startsWith("'") || rawValue.startsWith('"')
      ? rawValue.slice(1, -1).replace(/\\([\\"'])/g, "$1")
      : `${rawValue}px`;
    return `${cssProperty}:${value}`;
  }).join(";");
}

const names = [
  "Bota Urbana Cuero Negro", "Sandalia Trenzada de Verano con Hebilla",
  "Zapatilla Deportiva Liviana para Caminatas Largas", "Mocasín Clásico", "Bota de Lluvia",
  "Zapato Oxford", "Sandalia Plataforma", "Zapatilla Urbana", "Bota Chelsea", "Alpargata",
  "Zapato de Fiesta", "Zueco Anatómico", "Bota Montañera", "Sandalia Baja", "Mocasín de Cuero",
  "Zapatilla Running", "Zapato Escolar", "Bota con Forro", "Sandalia de Tiras", "Zapatilla Clásica",
];

const styles = Object.fromEntries(["featuredPanel", "suggestionGrid", "suggestionCard", "suggestionImage", "suggestionInfo", "suggestionName", "suggestionToggle", "featuredHint"].map((name) => [name, inlineStyle(name)]));
const cards = names.map((name, index) => `
  <label class="featured-suggestion-motion featured-panel__suggestion" style="${styles.suggestionCard};animation-delay:${Math.min(index, 8) * 35}ms">
    <img class="featured-panel__image" style="${styles.suggestionImage}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23c86'/%3E%3C/svg%3E">
    <span class="featured-panel__info" style="${styles.suggestionInfo}">
      <strong class="featured-panel__name" style="${styles.suggestionName}">${name}</strong><span class="featured-panel__rank">Puesto ${index + 1}</span>
      <span style="${styles.featuredHint}">1.234 visitas · últimos 30 días</span><span style="${styles.suggestionToggle}"><input class="featured-panel__checkbox" type="checkbox"> Sumar a destacados</span>
    </span>
  </label>`).join("");

test("20 suggestion rows remain readable and scrollable on mobile and desktop", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const disclosureMarkup = source.match(/<details className="featured-panel__disclosure">([\s\S]*?)<\/details>/)?.[1];
    assert.ok(disclosureMarkup, "actual details disclosure markup should be present");
    const summaryMarkup = disclosureMarkup.match(/<summary className="featured-panel__summary">([\s\S]*?)<\/summary>/)?.[1];
    assert.ok(summaryMarkup, "actual summary markup should be present");
    const title = summaryMarkup.match(/<h2[^>]*>(.*?)<\/h2>/)?.[1];
    assert.ok(title, "summary must contain the actual panel title");

    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>
      * { box-sizing: border-box; }
      :root { --admin-text:#222; --admin-text-secondary:#555; --admin-surface:#fff; --admin-bg:#f7f6f2; --admin-border:#bbb; --admin-accent:#735; --admin-radius:14px; --admin-radius-sm:6px; --admin-font-serif:Georgia,serif; }
      ${componentCss}
    </style><section class="featured-panel featured-v1" style="${styles.featuredPanel}"><details class="featured-panel__disclosure"><summary class="featured-panel__summary"><h2 class="v1-title">${title}</h2><svg class="featured-panel__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary><div class="featured-panel__body"><button>Guardar selección</button><label><input type="checkbox" checked> Seleccionado</label><div class="featured-panel__results" style="${styles.suggestionGrid}">${cards}</div></div></details></section>`);

    const details = page.locator("details.featured-panel__disclosure");
    const summary = page.locator("summary.featured-panel__summary");
    const results = page.locator(".featured-panel__results");
    assert.equal(await details.evaluate((element: HTMLDetailsElement) => element.open), false);
    assert.equal(await page.locator(".featured-panel__body").evaluate((body) => getComputedStyle(body).display), "grid");
    assert.equal(await results.isVisible(), false);
    const closedHeights: number[] = [];
    for (const width of [336, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      closedHeights.push(await details.evaluate((element) => element.getBoundingClientRect().height));
    }
    assert.ok(closedHeights.every((height) => height < 70), `collapsed panel should stay compact: ${closedHeights.join(", ")}`);
    const chevron = page.locator(".featured-panel__chevron");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((element: HTMLDetailsElement) => element.open), true);
    assert.equal(await results.isVisible(), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".featured-panel__chevron")!).transform.startsWith("matrix(-1, 0, 0, -1"));
    await page.locator(".featured-panel__body button").click();
    await page.locator(".featured-panel__body > label input[type=checkbox]").uncheck();
    await summary.focus();
    await page.keyboard.press("Space");
    assert.equal(await details.evaluate((element: HTMLDetailsElement) => element.open), false);
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((element: HTMLDetailsElement) => element.open), true);
    assert.equal(await page.locator(".featured-panel__body button").count(), 1);
    assert.equal(await page.locator(".featured-panel__body > label input[type=checkbox]").isChecked(), false);

    for (const width of [336, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const result = await results.evaluate((list) => {
        const rows = [...list.querySelectorAll<HTMLElement>(".featured-panel__suggestion")];
        const rect = (element: Element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        return {
          scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
          scrollWidth: list.scrollWidth, clientWidth: list.clientWidth,
          maxHeight: getComputedStyle(list).maxHeight,
          rows: rows.map((row) => {
            const image = row.querySelector("img")!;
            const checkbox = row.querySelector("input")!;
            const name = row.querySelector("strong")!;
            return { bounds: rect(row), image: rect(image), name: rect(name), checkbox: rect(checkbox), text: name.textContent };
          }),
        };
      });
      assert.equal(result.rows.length, 20);
      assert.notEqual(result.maxHeight, "none", `suggestion list must retain a bounded max-height at ${width}px`);
      assert.ok(result.scrollHeight > result.clientHeight, `expected list scrolling at ${width}px (${result.scrollHeight}/${result.clientHeight})`);
      assert.ok(result.scrollWidth <= result.clientWidth, `horizontal overflow at ${width}px`);
      assert.deepEqual(result.rows.map((row) => row.text), names);
      for (const row of result.rows) {
        assert.ok(row.bounds.height >= 64, `collapsed row ${row.text} at ${width}px: ${row.bounds.height}px`);
        assert.equal(row.image.height, 64, `thumbnail is not the actual 64px at ${width}px: ${row.image.height}px`);
        assert.ok(row.name.width > 0 && row.name.height > 0, `name has no visible bounds at ${width}px`);
        assert.ok(row.checkbox.width >= 16 && row.checkbox.height >= 16, `checkbox bounds clipped at ${width}px: ${JSON.stringify(row.checkbox)}`);
        assert.ok(row.checkbox.x >= row.bounds.x && row.checkbox.y >= row.bounds.y && row.checkbox.x + row.checkbox.width <= row.bounds.x + row.bounds.width && row.checkbox.y + row.checkbox.height <= row.bounds.y + row.bounds.height, `checkbox bounds escape card at ${width}px`);
      }
    }
  } finally {
    await browser.close();
  }
});
