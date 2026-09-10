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

test("resolveCsvFallback: retired configuration is ignored", () => {
  const cases: Array<{ env: { ENABLE_CSV_FALLBACK?: string } }> = [
    { env: {} },
    { env: { ENABLE_CSV_FALLBACK: undefined } },
    { env: { ENABLE_CSV_FALLBACK: "false" } },
    { env: { ENABLE_CSV_FALLBACK: "TRUE" } },
    { env: { ENABLE_CSV_FALLBACK: "1" } },
    { env: { ENABLE_CSV_FALLBACK: "" } },
    { env: { ENABLE_CSV_FALLBACK: "true " } },
    { env: { ENABLE_CSV_FALLBACK: "true" } },
  ];
  for (const { env } of cases) {
    assert.equal(resolveCsvFallback(env), false, `env=${JSON.stringify(env)}`);
  }
});
