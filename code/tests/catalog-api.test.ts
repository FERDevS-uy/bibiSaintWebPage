// tests/catalog-api.test.ts
// TDD — Tarea 3.2: capa HTTP del pipeline de lectura de catálogo.
// Se ejecutan con: pnpm run test:unit (node --experimental-strip-types --test)
//
// Testea la lógica pura de parsing de query params → CatalogPageRequest, el
// mapeo CatalogError → status HTTP y la construcción del árbol de categorías.
// (El handler es una capa fina sobre runCatalogQuery; la lógica de query ya
// está cubierta en catalog-queries.test.ts.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { CatalogError } from "../src/server/catalog/contracts.ts";
import {
  parseCatalogPageRequest,
  catalogErrorToStatus,
  catalogReadEnv,
  buildCategoryTree,
  type ParsedCatalogRequest,
} from "../src/server/catalog/http.ts";
import { resolveCatalogReadPath, resolveCsvFallback } from "../src/server/catalog/readPath.ts";

// ---------------------------------------------------------------------------
// parseCatalogPageRequest
// ---------------------------------------------------------------------------

test("parseCatalogPageRequest: defaults — sort nombre, sin filtros", () => {
  const req = parseCatalogPageRequest(new URL("http://x/api/catalog/products"));
  assert.deepEqual(req, { sort: "nombre" });
});

test("parseCatalogPageRequest: sort explícito", () => {
  const req = parseCatalogPageRequest(new URL("http://x/?sort=precio"));
  assert.equal(req.sort, "precio");
});

test("parseCatalogPageRequest: category/subcategory/cursor", () => {
  const req = parseCatalogPageRequest(
    new URL("http://x/?category=Tecno&subcategory=Audio&cursor=abc123"),
  );
  assert.deepEqual(req, {
    sort: "nombre",
    category: "Tecno",
    subcategory: "Audio",
    cursor: "abc123",
  });
});

test("parseCatalogPageRequest: pageSize numérico válido", () => {
  const req = parseCatalogPageRequest(new URL("http://x/?pageSize=24"));
  assert.equal(req.pageSize, 24);
});

test("parseCatalogPageRequest: pageSize inválido (no numérico) → INVALID_PAGE_SIZE", () => {
  assert.throws(
    () => parseCatalogPageRequest(new URL("http://x/?pageSize=abc")),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_PAGE_SIZE",
  );
});

test("parseCatalogPageRequest: pageSize <= 0 → INVALID_PAGE_SIZE", () => {
  assert.throws(
    () => parseCatalogPageRequest(new URL("http://x/?pageSize=0")),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_PAGE_SIZE",
  );
  assert.throws(
    () => parseCatalogPageRequest(new URL("http://x/?pageSize=-5")),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_PAGE_SIZE",
  );
});

test("parseCatalogPageRequest: enOferta true/false", () => {
  assert.equal(
    parseCatalogPageRequest(new URL("http://x/?enOferta=true")).enOferta,
    true,
  );
  assert.equal(
    parseCatalogPageRequest(new URL("http://x/?enOferta=false")).enOferta,
    false,
  );
});

test("parseCatalogPageRequest: enOferta inválido → INVALID_PAGE_SIZE", () => {
  assert.throws(
    () => parseCatalogPageRequest(new URL("http://x/?enOferta=1")),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_PAGE_SIZE",
  );
});

test("parseCatalogPageRequest: combinación completa", () => {
  const req = parseCatalogPageRequest(
    new URL("http://x/?category=Tecno&enOferta=true&pageSize=12&sort=precio&cursor=zz"),
  );
  const expected: ParsedCatalogRequest = {
    sort: "precio",
    category: "Tecno",
    enOferta: true,
    pageSize: 12,
    cursor: "zz",
  };
  assert.deepEqual(req, expected);
});

// ---------------------------------------------------------------------------
// catalogErrorToStatus
// ---------------------------------------------------------------------------

test("catalogErrorToStatus: parámetros inválidos → 400", () => {
  assert.equal(catalogErrorToStatus(new CatalogError("INVALID_CURSOR", "x")), 400);
  assert.equal(catalogErrorToStatus(new CatalogError("INVALID_PAGE_SIZE", "x")), 400);
});

test("catalogErrorToStatus: cursor incompatible → 409", () => {
  assert.equal(catalogErrorToStatus(new CatalogError("VERSION_MISMATCH", "x")), 409);
  assert.equal(catalogErrorToStatus(new CatalogError("FILTER_MISMATCH", "x")), 409);
});

test("catalogErrorToStatus: fallo backend → 502", () => {
  assert.equal(catalogErrorToStatus(new CatalogError("UPSTREAM_ERROR", "x")), 502);
});

// ---------------------------------------------------------------------------
// catalogReadEnv
// ---------------------------------------------------------------------------

test("catalogReadEnv: propaga CATALOG_READ_MODEL y ENABLE_CSV_FALLBACK desde process.env", () => {
  const previousReadModel = process.env.CATALOG_READ_MODEL;
  const previousCsvFallback = process.env.ENABLE_CSV_FALLBACK;
  try {
    process.env.CATALOG_READ_MODEL = "false";
    process.env.ENABLE_CSV_FALLBACK = "true";
    assert.deepEqual(catalogReadEnv(), {
      CATALOG_READ_MODEL: "false",
      ENABLE_CSV_FALLBACK: "true",
    });
  } finally {
    if (previousReadModel === undefined) delete process.env.CATALOG_READ_MODEL;
    else process.env.CATALOG_READ_MODEL = previousReadModel;
    if (previousCsvFallback === undefined) delete process.env.ENABLE_CSV_FALLBACK;
    else process.env.ENABLE_CSV_FALLBACK = previousCsvFallback;
  }
});

test("catalogReadEnv: prioriza env runtime sobre import.meta/process.env", () => {
  const previousReadModel = process.env.CATALOG_READ_MODEL;
  const previousCsvFallback = process.env.ENABLE_CSV_FALLBACK;
  try {
    process.env.CATALOG_READ_MODEL = "true";
    process.env.ENABLE_CSV_FALLBACK = "false";
    assert.deepEqual(
      catalogReadEnv({ CATALOG_READ_MODEL: "false", ENABLE_CSV_FALLBACK: "true" }),
      {
        CATALOG_READ_MODEL: "false",
        ENABLE_CSV_FALLBACK: "true",
      },
    );
  } finally {
    if (previousReadModel === undefined) delete process.env.CATALOG_READ_MODEL;
    else process.env.CATALOG_READ_MODEL = previousReadModel;
    if (previousCsvFallback === undefined) delete process.env.ENABLE_CSV_FALLBACK;
    else process.env.ENABLE_CSV_FALLBACK = previousCsvFallback;
  }
});

test("catalog runtime configuration enables CSV only with the explicit operator flag", () => {
  const env = catalogReadEnv({ CATALOG_READ_MODEL: "false", ENABLE_CSV_FALLBACK: "true" });
  assert.equal(resolveCatalogReadPath(env), "readmodel");
  assert.equal(resolveCsvFallback(env), true);
});

test("catalogErrorToStatus: a missing product is 404 and upstream remains retryable", () => {
  assert.equal(catalogErrorToStatus(new CatalogError("NOT_FOUND", "missing")), 404);
  assert.equal(catalogErrorToStatus(new CatalogError("UPSTREAM_ERROR", "retry")), 502);
});

// ---------------------------------------------------------------------------
// buildCategoryTree
// ---------------------------------------------------------------------------

test("buildCategoryTree: fusiona taxonomía + conteos, incluye conteo cero", () => {
  const taxonomy = [
    { category_name: "Tecno", subcategory_name: null, display_order: 0, visible: true },
    { category_name: "Tecno", subcategory_name: "Audio", display_order: 2, visible: true },
    { category_name: "Tecno", subcategory_name: "Accesorios", display_order: 1, visible: true },
  ];
  const counts = [
    { category_name: "Tecno", subcategory_name: "", product_count: 3 },
    { category_name: "Tecno", subcategory_name: "Audio", product_count: 2 },
    // Accesorios sin fila → conteo 0
  ];
  const tree = buildCategoryTree(taxonomy, counts);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, "Tecno");
  assert.equal(tree[0].count, 3);
  // Subcategorías ordenadas por display_order (Accesorios=1 antes que Audio=2)
  assert.deepEqual(
    tree[0].subcategories.map((s) => s.name),
    ["Accesorios", "Audio"],
  );
  assert.equal(tree[0].subcategories[0].count, 0); // conteo cero incluido
  assert.equal(tree[0].subcategories[1].count, 2);
});

test("buildCategoryTree: respeta display_order y filtra no visibles", () => {
  const taxonomy = [
    { category_name: "B", subcategory_name: null, display_order: 2, visible: true },
    { category_name: "A", subcategory_name: null, display_order: 1, visible: true },
    { category_name: "Oculta", subcategory_name: null, display_order: 0, visible: false },
  ];
  const tree = buildCategoryTree(taxonomy, []);
  assert.deepEqual(tree.map((n) => n.name), ["A", "B"]);
});

test("buildCategoryTree: categoría sin entrada a nivel categoría se crea desde subcategoría", () => {
  const taxonomy = [
    { category_name: "Tecno", subcategory_name: "Audio", display_order: 1, visible: true },
  ];
  const counts = [
    { category_name: "Tecno", subcategory_name: "Audio", product_count: 4 },
  ];
  const tree = buildCategoryTree(taxonomy, counts);
  // Nota: la categoría se crea pero su conteo a nivel categoría es 0 (no hay fila '').
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, "Tecno");
  assert.equal(tree[0].count, 0);
  assert.equal(tree[0].subcategories.length, 1);
  assert.equal(tree[0].subcategories[0].name, "Audio");
  assert.equal(tree[0].subcategories[0].count, 4);
});
