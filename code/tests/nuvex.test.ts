// tests/nuvex.test.ts
// Tests unitarios de las funciones puras del sync de Nuvex (parser + seguridad).
// Se ejecutan con el test runner nativo de Node:
//   node --experimental-strip-types --test tests/nuvex.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidNuvexUrl,
  isValidNuvexImageUrl,
  nuvexAbsolute,
  NUVEX_LIMITS,
} from "../src/server/providers/nuvex/security.ts";
import { parseNuvexProductHtml } from "../src/server/providers/nuvex/parser.ts";
import {
  buildPlan,
  matchByName,
  type NuvexExistingProduct,
} from "../src/server/providers/nuvex/planner.ts";
import type { ProductRow } from "../src/server/providers/utils.ts";

function mkProduct(id: string, name: string, price: string, enOferta = false): ProductRow {
  return {
    id,
    name,
    description: "",
    price,
    img: [],
    categories: { name: "Tecno", count: 0, subcategories: [] },
    payment_link: [{ id: "0", url: `https://nuvex.uy/x?id=${id}` }],
    relacionados: [],
    en_oferta: enOferta,
    original_price: null,
    colors: [],
    source: "scraper",
    active: true,
    auto_update_price: false,
    external_id: id,
  };
}

function mkExisting(id: string, name: string, price: string): NuvexExistingProduct {
  return { id, name, price, en_oferta: false, original_price: null, img: [] };
}

// ---------------------------------------------------------------------------
// 7.8 SSRF / URLs
// ---------------------------------------------------------------------------

test("isValidNuvexUrl: permite https://nuvex.uy", () => {
  assert.equal(isValidNuvexUrl("https://nuvex.uy/index.php?route=product/product&product_id=477"), true);
  assert.equal(isValidNuvexUrl("https://sub.nuvex.uy/x"), true);
});

test("isValidNuvexUrl: rechaza host ajeno, http e IP privada", () => {
  assert.equal(isValidNuvexUrl("https://evil.com/x"), false);
  assert.equal(isValidNuvexUrl("http://nuvex.uy/x"), false);
  assert.equal(isValidNuvexUrl("https://127.0.0.1/x"), false);
  assert.equal(isValidNuvexUrl("https://192.168.1.1/x"), false);
  assert.equal(isValidNuvexUrl("https://localhost/x"), false);
});

test("isValidNuvexImageUrl: solo hosts de imágenes https", () => {
  assert.equal(isValidNuvexImageUrl("https://nuvex.uy/image/catalog/x.png"), true);
  assert.equal(isValidNuvexImageUrl("https://evil.com/x.png"), false);
  assert.equal(isValidNuvexImageUrl("http://nuvex.uy/x.png"), false);
});

test("nuvexAbsolute: resuelve rutas relativas solo si el host es nuvex.uy", () => {
  assert.equal(
    nuvexAbsolute("index.php?route=product/category&path=3"),
    "https://nuvex.uy/index.php?route=product/category&path=3",
  );
  assert.equal(nuvexAbsolute("//evil.com/x"), "");
});

test("nuvexAbsolute: promueve http:// de nuvex.uy a https y rechaza http ajeno", () => {
  assert.equal(
    nuvexAbsolute("http://nuvex.uy/index.php?route=product/category&path=4"),
    "https://nuvex.uy/index.php?route=product/category&path=4",
  );
  assert.equal(nuvexAbsolute("http://evil.com/x"), "");
});

test("NUVEX_LIMITS: límites fail-closed configurados", () => {
  assert.ok(NUVEX_LIMITS.maxProducts > 0);
  assert.ok(NUVEX_LIMITS.deadlineMs > 0);
  assert.ok(NUVEX_LIMITS.maxBytesPerResponse > 0);
  assert.ok(NUVEX_LIMITS.concurrency >= 1);
  assert.ok(NUVEX_LIMITS.maxDeactivations > 0);
});

// ---------------------------------------------------------------------------
// 7.1 Parser: producto 477 con/sin precio
// ---------------------------------------------------------------------------

function detailHtml({ price = true }: { price?: boolean }): string {
  const priceBlock = price
    ? `<ul class="list-unstyled"><li>Marca</li><h2>$1.000</h2></ul>`
    : ``;
  return `<html><body>
<h1>VELADORA COCODRILO CON MÚSICA</h1>
<div id="tab-description"><p>Cocodrilo de peluche.</p></div>
${priceBlock}
<ul class="thumbnails">
<li><a class="thumbnail" href="https://nuvex.uy/image/cache/catalog/CATEGORIAS/TECNO/2026/CAMP%207/7730784164881-500x500.png">x</a></li>
</ul>
</body></html>`;
}

test("parser: producto con precio aplica markup ×1.4", () => {
  const d = parseNuvexProductHtml(
    detailHtml({ price: true }),
    "https://nuvex.uy/index.php?route=product/product&path=3&product_id=477",
    "Tecno",
  );
  assert.ok(d);
  assert.equal(d.id, "477");
  assert.equal(d.name, "VELADORA COCODRILO CON MÚSICA");
  assert.equal(d.price, "1.400"); // 1.000 × 1.4
  assert.ok(d.images.length > 0);
});

test("parser: producto sin precio deja price vacío (advertencia), sin inventar precio", () => {
  const d = parseNuvexProductHtml(
    detailHtml({ price: false }),
    "https://nuvex.uy/index.php?route=product/product&path=3&product_id=477",
    "Tecno",
  );
  assert.ok(d);
  assert.equal(d.id, "477");
  assert.equal(d.price, ""); // precio faltante -> vacío
});

// ---------------------------------------------------------------------------
// 7.2 Planner: nuevo / actualizado / sin cambios / ausente / match por nombre / empate
// ---------------------------------------------------------------------------

test("planner: clasifica create, update (con motivo), unchanged, absent", async () => {
  const products = [
    mkProduct("477", "VELADORA COCODRILO", "1400"), // update: 1200 -> 1400
    mkProduct("999", "NUEVO PRODUCTO", "500"), // create
    mkProduct("600", "SIN CAMBIOS", "700"), // unchanged
  ];
  const existingList = [
    mkExisting("477", "VELADORA COCODRILO", "1200"),
    mkExisting("600", "SIN CAMBIOS", "700"),
    mkExisting("500", "AUSENTE AHORA", "300"), // absent
  ];
  const existing = new Map(existingList.map((e) => [e.id, e]));
  const { items, summary } = await buildPlan(products, existing, existingList);

  assert.equal(summary.create, 1);
  assert.equal(summary.update, 1);
  assert.equal(summary.unchanged, 1);
  assert.equal(summary.absent, 1);

  const upd = items.find((i) => i.id === "477");
  assert.equal(upd?.action, "update");
  assert.equal(upd?.priceReason, "aumento_proveedor");
  assert.equal(upd?.matchedBy, "id");

  const abs = items.find((i) => i.id === "500");
  assert.equal(abs?.action, "absent");
});

test("planner: match por nombre marca coincidencia inferida; empate se rechaza", async () => {
  // Empate: dos candidatos con el mismo nombre -> rechazado
  const tied = matchByName("Alargador", [
    { id: "132", name: "Alargador Zapatilla" },
    { id: "133", name: "Alargador Zapatilla" },
  ]);
  assert.equal(tied, null);

  // Match único
  const single = matchByName("Alargador Zapatilla Con Puertos Celular", [
    { id: "132", name: "Alargador Zapatilla Con Puertos Celular" },
  ]);
  assert.ok(single);
  assert.equal(single.id, "132");
});

test("planner: precio faltante en existente -> unchanged + warning (no sobrescribe)", async () => {
  const products = [mkProduct("477", "VELADORA COCODRILO", "")]; // sin precio
  const existingList = [mkExisting("477", "VELADORA COCODRILO", "1200")];
  const existing = new Map(existingList.map((e) => [e.id, e]));
  const { items, summary } = await buildPlan(products, existing, existingList);

  const item = items.find((i) => i.id === "477");
  assert.equal(item?.action, "unchanged");
  assert.equal(item?.priceReason, "precio_faltante");
  assert.equal(summary.warnings, 1);
});