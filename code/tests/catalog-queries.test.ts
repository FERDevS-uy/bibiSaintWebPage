// tests/catalog-queries.test.ts
// TDD — Tarea 3.1: consulta de productos con keyset pagination sobre el read model.
// Se ejecutan con: pnpm run test:unit (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CatalogError,
  encodeCursor,
  decodeCursor,
  filterFingerprint,
  type CursorPayload,
} from "../src/server/catalog/contracts.ts";
import {
  buildOrderByClause,
  buildFilterRecord,
  decodeCursorForOrder,
  buildCursorCondition,
  runCatalogQuery,
  type CatalogQueryRequest,
} from "../src/server/catalog/queries.ts";
import { createCatalogQueryTelemetry } from "../src/server/catalog/queryTelemetry.ts";

const ENV = { CATALOG_READ_MODEL: "true" };

// ---------------------------------------------------------------------------
// buildOrderByClause
// ---------------------------------------------------------------------------

test("buildOrderByClause: nombre/vacío/desconocido → sort_name; precio → numeric_price", () => {
  assert.equal(buildOrderByClause("nombre"), "sort_name ASC, product_id ASC");
  assert.equal(buildOrderByClause("name"), "sort_name ASC, product_id ASC");
  assert.equal(buildOrderByClause(""), "sort_name ASC, product_id ASC");
  assert.equal(buildOrderByClause("basura"), "sort_name ASC, product_id ASC");
  assert.equal(buildOrderByClause("precio"), "numeric_price ASC, sort_name ASC, product_id ASC");
  assert.equal(buildOrderByClause("price"), "numeric_price ASC, sort_name ASC, product_id ASC");
});

// ---------------------------------------------------------------------------
// buildFilterRecord (fingerprint de filtros activos)
// ---------------------------------------------------------------------------

test("buildFilterRecord: enOferta se normaliza a string; undefined se excluye", () => {
  assert.deepEqual(buildFilterRecord({ sort: "nombre" }), {});
  assert.deepEqual(buildFilterRecord({ sort: "nombre", enOferta: true }), {
    enOferta: "true",
  });
  assert.deepEqual(buildFilterRecord({ sort: "nombre", enOferta: false }), {
    enOferta: "false",
  });
  assert.deepEqual(
    buildFilterRecord({ sort: "nombre", category: "Tecno", subcategory: "Audio" }),
    { category: "Tecno", subcategory: "Audio" },
  );
  assert.deepEqual(buildFilterRecord({ sort: "nombre", query: " Bota " }), {
    query: " Bota ",
  });
});

// ---------------------------------------------------------------------------
// buildCursorCondition (tupla keyset, nunca OFFSET)
// ---------------------------------------------------------------------------

test("buildCursorCondition: orden por nombre → tupla (sort_name, product_id)", () => {
  const cond = buildCursorCondition({ sortValue: "zapatilla", productId: "p1" });
  assert.equal(cond.orderBy, "sort_name ASC, product_id ASC");
  assert.equal(
    cond.orFilter,
    'sort_name.gt."zapatilla",and(sort_name.eq."zapatilla",product_id.gt."p1")',
  );
});

test("buildCursorCondition: orden por precio → tupla (numeric_price, sort_name, product_id)", () => {
  const cond = buildCursorCondition({
    sortValue: "zapatilla",
    priceValue: 100,
    productId: "p1",
  });
  assert.equal(cond.orderBy, "numeric_price ASC, sort_name ASC, product_id ASC");
  assert.equal(
    cond.orFilter,
    'numeric_price.gt.100,and(numeric_price.eq.100,sort_name.gt."zapatilla"),' +
      'and(numeric_price.eq.100,sort_name.eq."zapatilla",product_id.gt."p1")',
  );
});

test("buildCursorCondition: escapa comillas en valores de texto", () => {
  const cond = buildCursorCondition({ sortValue: 'a"b', productId: 'p"1' });
  assert.ok(cond.orFilter.includes('sort_name.gt."a\\"b"'));
  assert.ok(cond.orFilter.includes('product_id.gt."p\\"1"'));
});

// ---------------------------------------------------------------------------
// decodeCursorForOrder (validación de versión y fingerprint)
// ---------------------------------------------------------------------------

test("decodeCursorForOrder: cursor válido por nombre → sortValue/productId", () => {
  const filters = { category: "Tecno" };
  const f = filterFingerprint(filters);
  const payload: CursorPayload = { s: "zapatilla", p: "p1", f, v: "v1" };
  const decoded = decodeCursorForOrder(
    payload,
    "sort_name ASC, product_id ASC",
    filters,
    "v1",
  );
  assert.deepEqual(decoded, { sortValue: "zapatilla", productId: "p1" });
});

test("decodeCursorForOrder: cursor válido por precio → priceValue/sortValue/productId", () => {
  const filters = { enOferta: "true" };
  const f = filterFingerprint(filters);
  const payload: CursorPayload = { s: "100\u0001zapatilla", p: "p1", f, v: "v1" };
  const decoded = decodeCursorForOrder(
    payload,
    "numeric_price ASC, sort_name ASC, product_id ASC",
    filters,
    "v1",
  );
  assert.deepEqual(decoded, { sortValue: "zapatilla", priceValue: 100, productId: "p1" });
});

test("decodeCursorForOrder: versión distinta → VERSION_MISMATCH (409)", () => {
  const filters = {};
  const f = filterFingerprint(filters);
  const payload: CursorPayload = { s: "zapatilla", p: "p1", f, v: "v1" };
  assert.throws(
    () => decodeCursorForOrder(payload, "sort_name ASC, product_id ASC", filters, "v2"),
    (err: unknown) => err instanceof CatalogError && err.code === "VERSION_MISMATCH",
  );
});

test("decodeCursorForOrder: fingerprint distinto → FILTER_MISMATCH", () => {
  const f = filterFingerprint({ category: "Tecno" });
  const payload: CursorPayload = { s: "zapatilla", p: "p1", f, v: "v1" };
  assert.throws(
    () =>
      decodeCursorForOrder(
        payload,
        "sort_name ASC, product_id ASC",
        { category: "Ropa" },
        "v1",
      ),
    (err: unknown) => err instanceof CatalogError && err.code === "FILTER_MISMATCH",
  );
});

test("decodeCursorForOrder: cursor de precio malformado → INVALID_CURSOR", () => {
  const filters = { enOferta: "true" };
  const f = filterFingerprint(filters);
  const payload: CursorPayload = { s: "sin-separador", p: "p1", f, v: "v1" };
  assert.throws(
    () =>
      decodeCursorForOrder(
        payload,
        "numeric_price ASC, sort_name ASC, product_id ASC",
        filters,
        "v1",
      ),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_CURSOR",
  );
});

// ---------------------------------------------------------------------------
// runCatalogQuery — mock del cliente Supabase
// ---------------------------------------------------------------------------

/** Construye un mock de Supabase que registra la consulta construida. */
function makeSupabaseMock(rows: unknown[], version = "v1", totalCount = rows.length) {
  const calls: Array<Record<string, unknown>> = [];
  const chain: Record<string, any> = {};
  let countWithRows = false;

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
    return chain;
  };

  chain.from = (table: string) => {
    calls.push({ method: "from", args: [table] });
    return chain;
  };
  chain.select = (cols: string, opts?: unknown) => {
    calls.push({ method: "select", args: [cols, opts] });
    if (opts && typeof opts === "object" && (opts as { count?: string }).count === "exact") {
      countWithRows = !(opts as { head?: boolean }).head;
    }
    // Query de COUNT (head:true): el chain se vuelve thenable y resuelve
    // { count, data, error } como el cliente real de Supabase.
    if (opts && typeof opts === "object" && (opts as { head?: boolean }).head) {
      return Object.assign(chain, {
        then(resolve: (v: unknown) => void) {
          resolve({ count: totalCount, data: [], error: null });
        },
      });
    }
    return chain;
  };
  chain.eq = (col: string, val: unknown) => record("eq", col, val);
  chain.ilike = (col: string, val: unknown) => record("ilike", col, val);
  chain.order = (col: string, opts: unknown) => record("order", col, opts);
  chain.or = (filter: string) => record("or", filter);
  chain.limit = (n: number) => {
    calls.push({ method: "limit", args: [n] });
    return Promise.resolve({ data: rows, error: null, count: countWithRows ? totalCount : null });
  };
  chain.single = () =>
    Promise.resolve({ data: { version }, error: null });

  return { chain, calls };
}

test("runCatalogQuery: primer request sin cursor → sin condición or, limit+1, hasMore", async () => {
  const rows = [
    { id: "p1", name: "A", price: 10, imageUrl: "a.jpg", enOferta: false, category: "Tecno", subcategory: "Audio", sort_name: "a" },
    { id: "p2", name: "B", price: 20, imageUrl: "b.jpg", enOferta: false, category: "Tecno", subcategory: "Audio", sort_name: "b" },
    { id: "p3", name: "C", price: 30, imageUrl: "c.jpg", enOferta: false, category: "Tecno", subcategory: "Audio", sort_name: "c" },
  ];
  const { chain, calls } = makeSupabaseMock(rows);
  const res = await runCatalogQuery({ sort: "nombre", pageSize: 2 }, ENV, chain);

  assert.equal(res.items.length, 2);
  assert.equal(res.hasMore, true);
  assert.ok(res.nextCursor);
  assert.equal(res.version, "v1");
  assert.equal(res.total, 3);

  const froms = calls.filter((c) => c.method === "from").map((c) => c.args[0]);
  assert.ok(froms.includes("catalog_products"));
  assert.ok(!froms.includes("products"), "nunca debe consultar products");
  assert.ok(!calls.some((c) => c.method === "or"), "sin cursor no debe haber condición or");
  const limit = calls.find((c) => c.method === "limit");
  assert.equal(limit?.args[0], 3); // limit + 1
});

test("runCatalogQuery: primera página combina filas y COUNT exacto en un SELECT", async () => {
  const { chain, calls } = makeSupabaseMock([], "v1", 42);
  const res = await runCatalogQuery({ sort: "nombre", category: "Ropa" }, ENV, chain);

  const exactSelects = calls.filter(
    (call) => call.method === "select" && (call.args[1] as { count?: string } | undefined)?.count === "exact",
  );
  assert.equal(exactSelects.length, 1);
  assert.equal(res.total, 42);
});

test("runCatalogQuery: proyección mínima (nunca select *)", async () => {
  const { chain, calls } = makeSupabaseMock([]);
  await runCatalogQuery({ sort: "nombre" }, ENV, chain);
  // El primer select es la validación de versión del read model ("version");
  // el select de la consulta de productos es el que proyecta las columnas.
  const selects = calls.filter((c) => c.method === "select").map((c) => String(c.args[0]));
  const productSelect = selects.find((s) => s.includes("id:product_id"));
  assert.ok(productSelect, "debe existir un select de la consulta de productos");
  assert.ok(!productSelect.includes("*"), "no debe usar select(*)");
  assert.ok(productSelect.includes("id:product_id"));
  assert.ok(productSelect.includes("price:numeric_price"));
});

test("runCatalogQuery: filtros category/subcategory/enOferta se aplican", async () => {
  const { chain, calls } = makeSupabaseMock([]);
  await runCatalogQuery(
    { sort: "nombre", category: "Tecno", subcategory: "Audio", enOferta: true },
    ENV,
    chain,
  );
  const eqs = calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(eqs.some(([col, v]) => col === "category" && v === "Tecno"));
  assert.ok(eqs.some(([col, v]) => col === "subcategory" && v === "Audio"));
  assert.ok(eqs.some(([col, v]) => col === "en_oferta" && v === true));
  assert.ok(eqs.some(([col, v]) => col === "active" && v === true));
});

test("runCatalogQuery: Ropa gender parent filters exact value and prefixed children", async () => {
  const rows = [
    { id: "parent", name: "Hombre", price: 10, imageUrl: "parent.jpg", enOferta: false, category: "Ropa", subcategory: "Hombre", sort_name: "hombre" },
    { id: "child", name: "Remera", price: 20, imageUrl: "child.jpg", enOferta: false, category: "Ropa", subcategory: "Hombre - Remeras", sort_name: "remera" },
  ];
  const { chain, calls } = makeSupabaseMock(rows, "v1", 2);
  await runCatalogQuery(
    { sort: "nombre", category: "Ropa", subcategory: "Hombre" },
    ENV,
    chain,
  );

  const ors = calls.filter((c) => c.method === "or").map((c) => c.args[0]);
  assert.equal(ors.length, 1, "first-page rows and exact count share one filtered SELECT");
  for (const filter of ors) {
    assert.equal(filter, 'subcategory.eq."Hombre",subcategory.like."Hombre - %"');
  }
  const eqs = calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(eqs.some(([col, value]) => col === "category" && value === "Ropa"));
  assert.ok(!eqs.some(([col]) => col === "subcategory"), "group routes must not use exact equality");
  const result = await runCatalogQuery(
    { sort: "nombre", category: "Ropa", subcategory: "Hombre", pageSize: 1 },
    ENV,
    makeSupabaseMock(rows, "v1", 2).chain,
  );
  assert.equal(decodeCursor(result.nextCursor!).f, filterFingerprint({ category: "Ropa", subcategory: "group:Hombre" }));
});

test("runCatalogQuery: concrete Ropa subcategory remains an exact equality filter", async () => {
  const { chain, calls } = makeSupabaseMock([]);
  await runCatalogQuery(
    { sort: "nombre", category: "Ropa", subcategory: "Hombre - Remeras" },
    ENV,
    chain,
  );

  const subcategoryEqs = calls
    .filter((c) => c.method === "eq" && c.args[0] === "subcategory")
    .map((c) => c.args[1]);
  assert.deepEqual(subcategoryEqs, ["Hombre - Remeras"]);
  assert.equal(calls.filter((c) => c.method === "or").length, 0);
});

test("runCatalogQuery: query de búsqueda participa en filtro y fingerprint del cursor", async () => {
  const rows = [
    { id: "p1", name: "Bota A", price: 10, imageUrl: "a.jpg", enOferta: false, category: "Calzado", sort_name: "bota a" },
    { id: "p2", name: "Bota B", price: 20, imageUrl: "b.jpg", enOferta: false, category: "Calzado", sort_name: "bota b" },
    { id: "p3", name: "Bota C", price: 30, imageUrl: "c.jpg", enOferta: false, category: "Calzado", sort_name: "bota c" },
  ];
  const { chain, calls } = makeSupabaseMock(rows);
  const res = await runCatalogQuery({ sort: "nombre", query: "bota", pageSize: 2 }, ENV, chain);

  assert.ok(calls.some((c) => c.method === "ilike" && c.args[0] === "name" && c.args[1] === "%bota%"));
  assert.ok(res.nextCursor);
  const decoded = decodeCursor(res.nextCursor);
  assert.equal(decoded.f, filterFingerprint({ query: "bota" }));
});

test("runCatalogQuery: orden por nombre → order sort_name + product_id", async () => {
  const { chain, calls } = makeSupabaseMock([]);
  await runCatalogQuery({ sort: "nombre" }, ENV, chain);
  const orders = calls.filter((c) => c.method === "order").map((c) => c.args[0]);
  assert.deepEqual(orders, ["sort_name", "product_id"]);
});

test("runCatalogQuery: orden por precio → order numeric_price + sort_name + product_id", async () => {
  const { chain, calls } = makeSupabaseMock([]);
  await runCatalogQuery({ sort: "precio" }, ENV, chain);
  const orders = calls.filter((c) => c.method === "order").map((c) => c.args[0]);
  assert.deepEqual(orders, ["numeric_price", "sort_name", "product_id"]);
});

test("runCatalogQuery: con cursor aplica condición or (desempate por product_id)", async () => {
  const filters = { category: "Tecno" };
  const f = filterFingerprint(filters);
  const cursor = encodeCursor({ s: "zapatilla", p: "p1", f, v: "v1" });
  const { chain, calls } = makeSupabaseMock([]);
  await runCatalogQuery({ sort: "nombre", category: "Tecno", cursor }, ENV, chain);
  const ors = calls.filter((c) => c.method === "or").map((c) => c.args[0]);
  assert.equal(ors.length, 1);
  assert.ok(ors[0].includes('sort_name.gt."zapatilla"'));
  assert.ok(ors[0].includes('product_id.gt."p1"'));
});

test("runCatalogQuery: cursor incompatible (versión distinta) → VERSION_MISMATCH", async () => {
  const filters = {};
  const f = filterFingerprint(filters);
  const cursor = encodeCursor({ s: "zapatilla", p: "p1", f, v: "v0" }); // versión vieja
  const { chain } = makeSupabaseMock([], "v1");
  await assert.rejects(
    () => runCatalogQuery({ sort: "nombre", cursor }, ENV, chain),
    (err: unknown) => err instanceof CatalogError && err.code === "VERSION_MISMATCH",
  );
});

test("runCatalogQuery: cursor incompatible (filtros distintos) → FILTER_MISMATCH", async () => {
  const f = filterFingerprint({ category: "Tecno" });
  const cursor = encodeCursor({ s: "zapatilla", p: "p1", f, v: "v1" });
  const { chain } = makeSupabaseMock([], "v1");
  await assert.rejects(
    () => runCatalogQuery({ sort: "nombre", category: "Ropa", cursor }, ENV, chain),
    (err: unknown) => err instanceof CatalogError && err.code === "FILTER_MISMATCH",
  );
});

test("runCatalogQuery: clampPageSize — limit <1 y >48", async () => {
  const { chain, calls } = makeSupabaseMock([]);
  await runCatalogQuery({ sort: "nombre", pageSize: 0 }, ENV, chain);
  let limit = calls.find((c) => c.method === "limit");
  assert.equal(limit?.args[0], 13); // default 12 + 1

  const { chain: c2, calls: calls2 } = makeSupabaseMock([]);
  await runCatalogQuery({ sort: "nombre", pageSize: 100 }, ENV, c2);
  limit = calls2.find((c) => c.method === "limit");
  assert.equal(limit?.args[0], 49); // max 48 + 1
});

test("runCatalogQuery: error Supabase → CatalogError UPSTREAM_ERROR", async () => {
  const chain: any = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    or: () => chain,
    single: () => Promise.resolve({ data: { version: "v1" }, error: null }),
    limit: () => Promise.resolve({ data: null, error: { message: "boom" } }),
  };
  await assert.rejects(
    () => runCatalogQuery({ sort: "nombre" }, ENV, chain),
    (err: unknown) => err instanceof CatalogError && err.code === "UPSTREAM_ERROR",
  );
});

test("runCatalogQuery: read model deshabilitado → UPSTREAM_ERROR", async () => {
  const { chain } = makeSupabaseMock([]);
  await assert.rejects(
    () => runCatalogQuery({ sort: "nombre" }, { CATALOG_READ_MODEL: "false" }, chain),
    (err: unknown) => err instanceof CatalogError && err.code === "UPSTREAM_ERROR",
  );
});

test("runCatalogQuery: round-trip encode/decode del nextCursor", async () => {
  const rows = [
    { id: "p1", name: "A", price: 10, imageUrl: "a.jpg", enOferta: false, category: "Tecno", subcategory: "Audio", sort_name: "a" },
    { id: "p2", name: "B", price: 20, imageUrl: "b.jpg", enOferta: false, category: "Tecno", subcategory: "Audio", sort_name: "b" },
    { id: "p3", name: "C", price: 30, imageUrl: "c.jpg", enOferta: false, category: "Tecno", subcategory: "Audio", sort_name: "c" },
  ];
  const { chain } = makeSupabaseMock(rows);
  const res = await runCatalogQuery({ sort: "nombre", pageSize: 2 }, ENV, chain);
  assert.ok(res.nextCursor);
  const decoded = decodeCursor(res.nextCursor);
  assert.equal(decoded.s, "b");
  assert.equal(decoded.p, "p2");
  assert.equal(decoded.v, "v1");
});

test("runCatalogQuery: correlates version and product SQL calls to the route", async () => {
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (message: string) => logs.push(message);

  try {
    const telemetry = createCatalogQueryTelemetry("api-products", "request-query-1");
    const { chain } = makeSupabaseMock([
      {
        id: "p1",
        name: "A",
        price: 10,
        imageUrl: "a.jpg",
        enOferta: false,
        category: "Tecno",
        sort_name: "a",
      },
    ]);
    await runCatalogQuery({ sort: "nombre", pageSize: 1 }, ENV, chain, { telemetry });
  } finally {
    console.info = originalInfo;
  }

  const events = logs.map((message) => JSON.parse(message));
  assert.deepEqual(events.map((event) => event.operation).sort(), [
    "catalog_products_page",
    "catalog_version",
  ]);
  assert.ok(events.every((event) => event.route === "api-products"));
  assert.ok(events.every((event) => event.request_id === "request-query-1"));
  assert.ok(events.every((event) => event.query_count === 1));
});

test("runCatalogQuery: correlates the count query on cursor pages", async () => {
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (message: string) => logs.push(message);

  try {
    const telemetry = createCatalogQueryTelemetry("category-page", "request-query-2");
    const cursor = encodeCursor({
      s: "a",
      p: "p0",
      f: filterFingerprint({}),
      v: "v1",
    });
    const { chain } = makeSupabaseMock([
      {
        id: "p1",
        name: "B",
        price: 10,
        imageUrl: "b.jpg",
        enOferta: false,
        category: "Tecno",
        sort_name: "b",
      },
    ]);
    await runCatalogQuery(
      { sort: "nombre", cursor, pageSize: 1 },
      ENV,
      chain,
      { telemetry },
    );
  } finally {
    console.info = originalInfo;
  }

  const events = logs.map((message) => JSON.parse(message));
  assert.deepEqual(events.map((event) => event.operation).sort(), [
    "catalog_products_count",
    "catalog_products_page",
    "catalog_version",
  ]);
  assert.ok(events.every((event) => event.route === "category-page"));
  assert.ok(events.every((event) => event.request_id === "request-query-2"));
  assert.ok(events.every((event) => event.query_count === 1));
});
