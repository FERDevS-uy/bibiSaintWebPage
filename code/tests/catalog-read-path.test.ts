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

test("resolveCatalogReadPath: sin env → legacy (default seguro)", () => {
  assert.equal(resolveCatalogReadPath({}), "legacy");
  assert.equal(resolveCatalogReadPath({ CATALOG_READ_MODEL: undefined }), "legacy");
});

test("resolveCatalogReadPath: 'true' exacto → readmodel", () => {
  assert.equal(resolveCatalogReadPath({ CATALOG_READ_MODEL: "true" }), "readmodel");
});

test("resolveCatalogReadPath: 'false', 'TRUE', '1', basura → legacy", () => {
  const cases: Array<{ env: { CATALOG_READ_MODEL?: string }; expected: CatalogReadPath }> = [
    { env: { CATALOG_READ_MODEL: "false" }, expected: "legacy" },
    { env: { CATALOG_READ_MODEL: "TRUE" }, expected: "legacy" },
    { env: { CATALOG_READ_MODEL: "1" }, expected: "legacy" },
    { env: { CATALOG_READ_MODEL: "true " }, expected: "legacy" },
    { env: { CATALOG_READ_MODEL: "readmodel" }, expected: "legacy" },
    { env: { CATALOG_READ_MODEL: "basura" }, expected: "legacy" },
  ];
  for (const { env, expected } of cases) {
    assert.equal(resolveCatalogReadPath(env), expected, `env=${JSON.stringify(env)}`);
  }
});

// ---------------------------------------------------------------------------
// resolveCsvFallback (opt-in estricto; nunca automático)
// ---------------------------------------------------------------------------

test("resolveCsvFallback: true solo con 'true' exacto", () => {
  assert.equal(resolveCsvFallback({ ENABLE_CSV_FALLBACK: "true" }), true);
});

test("resolveCsvFallback: undefined, 'false', 'TRUE', '1', '' → false", () => {
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