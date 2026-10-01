import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routes = [
  "../src/pages/ofertas.astro",
  "../src/pages/ofertas/page/[pag].astro",
];

test("offers routes use the agreed single-line subtitle and larger heading", () => {
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /<h1>Ofertas destacadas<\/h1>/);
    assert.match(source, /Top 50 productos más baratos del catálogo/);
    assert.doesNotMatch(source, /ordenados de menor a mayor/);
    assert.match(source, /font-size:\s*clamp\(2\.2rem,\s*4vw,\s*3rem\)/);
    assert.match(source, /white-space:\s*nowrap/);
  }
});
