// tests/catalog-read-path.test.ts
// TDD — Tarea 1.3: bandera de lectura (read model vs legacy) y fallback CSV opt-in.
// Se ejecutan con: pnpm run test:unit (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCatalogReadPath,
  resolveCsvFallback,
  type CatalogReadPath,
} from "../src/server/catalog/readPath.ts";

// ---------------------------------------------------------------------------
// resolveCatalogReadPath
// ---------------------------------------------------------------------------

test("resolveCatalogReadPath: every runtime configuration uses the canonical read model", () => {
  const cases: Array<{ env: { CATALOG_READ_MODEL?: string }; expected: CatalogReadPath }> = [
    { env: {}, expected: "readmodel" },
    { env: { CATALOG_READ_MODEL: undefined }, expected: "readmodel" },
    { env: { CATALOG_READ_MODEL: "true" }, expected: "readmodel" },
    { env: { CATALOG_READ_MODEL: "false" }, expected: "readmodel" },
    { env: { CATALOG_READ_MODEL: "TRUE" }, expected: "readmodel" },
    { env: { CATALOG_READ_MODEL: "1" }, expected: "readmodel" },
    { env: { CATALOG_READ_MODEL: "true " }, expected: "readmodel" },
    { env: { CATALOG_READ_MODEL: "readmodel" }, expected: "readmodel" },
    { env: { CATALOG_READ_MODEL: "basura" }, expected: "readmodel" },
  ];
  for (const { env, expected } of cases) {
    assert.equal(resolveCatalogReadPath(env), expected, `env=${JSON.stringify(env)}`);
  }
});

// ---------------------------------------------------------------------------
// resolveCsvFallback (opt-in estricto; nunca automático)
// ---------------------------------------------------------------------------

test("resolveCsvFallback: default-off and exact opt-in only", () => {
  assert.equal(resolveCsvFallback({ ENABLE_CSV_FALLBACK: "true" }), true);
  const cases: Array<{ env: { ENABLE_CSV_FALLBACK?: string } }> = [
    { env: {} },
    { env: { ENABLE_CSV_FALLBACK: undefined } },
    { env: { ENABLE_CSV_FALLBACK: "false" } },
    { env: { ENABLE_CSV_FALLBACK: "TRUE" } },
    { env: { ENABLE_CSV_FALLBACK: "1" } },
    { env: { ENABLE_CSV_FALLBACK: "" } },
    { env: { ENABLE_CSV_FALLBACK: "true " } },
  ];
  for (const { env } of cases) {
    assert.equal(resolveCsvFallback(env), false, `env=${JSON.stringify(env)}`);
  }
});

import {
  MAX_CSV_FALLBACK_ROWS,
  CsvFallbackLimitError,
  parseBoundedCsvFallback,
} from "../src/server/catalog/csvFallback.ts";

test("parseBoundedCsvFallback: accepts a small authorized fixture", () => {
  const result = parseBoundedCsvFallback("id,name\np1,Uno\np2,Dos", (row) => row.split(",")[0]);
  assert.deepEqual(result, ["p1", "p2"]);
});

test("parseBoundedCsvFallback: row 513 aborts before materializing a catalog", () => {
  const source = ["id", ...Array.from({ length: MAX_CSV_FALLBACK_ROWS + 1 }, (_, i) => `p${i}`)].join("\n");
  assert.throws(() => parseBoundedCsvFallback(source, (row) => row), CsvFallbackLimitError);
});
