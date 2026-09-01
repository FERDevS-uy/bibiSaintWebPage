// tests/catalog-contracts.test.ts
// TDD — Tarea 1.2: contratos TypeScript/HTTP del pipeline de lectura de catálogo.
// Se ejecutan con: pnpm run test:unit (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CatalogError,
  encodeCursor,
  decodeCursor,
  filterFingerprint,
  clampPageSize,
  assertCursorCompatible,
  type CursorPayload,
} from "../src/server/catalog/contracts.ts";

// ---------------------------------------------------------------------------
// Cursor opaco: roundtrip
// ---------------------------------------------------------------------------

test("encodeCursor/decodeCursor: roundtrip conserva el payload (incluye Unicode)", () => {
  const payload: CursorPayload = {
    s: "precio",
    p: "prod-ñ-1",
    f: "a1b2c3d4",
    v: "v42",
  };
  const encoded = encodeCursor(payload);
  assert.equal(typeof encoded, "string");
  assert.ok(encoded.length > 0);
  // base64url: solo caracteres URL-safe, sin padding
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCursor(encoded), payload);
});

test("encodeCursor: es determinista (mismo payload → mismo cursor)", () => {
  const payload: CursorPayload = { s: "name", p: "p1", f: "f1", v: "v1" };
  assert.equal(encodeCursor(payload), encodeCursor(payload));
});

// ---------------------------------------------------------------------------
// Cursor corrupto → INVALID_CURSOR
// ---------------------------------------------------------------------------

test("decodeCursor: base64url inválido lanza CatalogError INVALID_CURSOR", () => {
  assert.throws(
    () => decodeCursor("!!!no-es-base64!!!"),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_CURSOR",
  );
});

test("decodeCursor: cadena vacía lanza INVALID_CURSOR", () => {
  assert.throws(
    () => decodeCursor(""),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_CURSOR",
  );
});

test("decodeCursor: base64 válido pero JSON inválido lanza INVALID_CURSOR", () => {
  const raw = Buffer.from("esto no es json").toString("base64url");
  assert.throws(
    () => decodeCursor(raw),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_CURSOR",
  );
});

test("decodeCursor: JSON válido con campos faltantes lanza INVALID_CURSOR", () => {
  const raw = Buffer.from(JSON.stringify({ s: "name" })).toString("base64url");
  assert.throws(
    () => decodeCursor(raw),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_CURSOR",
  );
});

test("decodeCursor: JSON válido con campos vacíos lanza INVALID_CURSOR", () => {
  const raw = Buffer.from(JSON.stringify({ s: "", p: "", f: "", v: "" })).toString("base64url");
  assert.throws(
    () => decodeCursor(raw),
    (err: unknown) => err instanceof CatalogError && err.code === "INVALID_CURSOR",
  );
});

// ---------------------------------------------------------------------------
// filterFingerprint: determinista e insensible a orden/normalización
// ---------------------------------------------------------------------------

test("filterFingerprint: insensible al orden de claves y a trim+lowercase", () => {
  const a = filterFingerprint({ category: "Tecno", subcategory: "  Auriculares " });
  const b = filterFingerprint({ subcategory: "auriculares", category: "tecno" });
  assert.equal(a, b);
});

test("filterFingerprint: valores undefined se excluyen ({} === {category: undefined})", () => {
  assert.equal(filterFingerprint({}), filterFingerprint({ category: undefined }));
});

test("filterFingerprint: valores distintos producen fingerprints distintos", () => {
  assert.notEqual(filterFingerprint({ category: "Tecno" }), filterFingerprint({ category: "Ropa" }));
});

test("filterFingerprint: determinista y en formato hex de 8 chars", () => {
  const filters = { category: "Cama", subcategory: "Colchones", query: "king" };
  const first = filterFingerprint(filters);
  assert.equal(first, filterFingerprint(filters));
  assert.match(first, /^[0-9a-f]{8}$/);
});

// ---------------------------------------------------------------------------
// clampPageSize
// ---------------------------------------------------------------------------

test("clampPageSize: NaN, 0, negativos y undefined → default (12)", () => {
  assert.equal(clampPageSize(Number.NaN), 12);
  assert.equal(clampPageSize(0), 12);
  assert.equal(clampPageSize(-5), 12);
  assert.equal(clampPageSize(undefined), 12);
});

test("clampPageSize: valores sobre el máximo → max (48)", () => {
  assert.equal(clampPageSize(100), 48);
  assert.equal(clampPageSize(49), 48);
  assert.equal(clampPageSize(48), 48);
});

test("clampPageSize: valores válidos se conservan (enteros)", () => {
  assert.equal(clampPageSize(12), 12);
  assert.equal(clampPageSize(1), 1);
  assert.equal(clampPageSize(12.9), 12);
});

test("clampPageSize: respeta max y def personalizados", () => {
  assert.equal(clampPageSize(100, 24, 6), 24);
  assert.equal(clampPageSize(undefined, 24, 6), 6);
  assert.equal(clampPageSize(-1, 24, 6), 6);
});

// ---------------------------------------------------------------------------
// assertCursorCompatible
// ---------------------------------------------------------------------------

test("assertCursorCompatible: fingerprint y versión coincidentes no lanzan", () => {
  const f = filterFingerprint({ category: "Tecno" });
  const payload: CursorPayload = { s: "name", p: "p1", f, v: "v1" };
  assert.doesNotThrow(() => assertCursorCompatible(payload, { category: "Tecno" }, "v1"));
});

test("assertCursorCompatible: fingerprint distinto → FILTER_MISMATCH", () => {
  const f = filterFingerprint({ category: "Tecno" });
  const payload: CursorPayload = { s: "name", p: "p1", f, v: "v1" };
  assert.throws(
    () => assertCursorCompatible(payload, { category: "Ropa" }, "v1"),
    (err: unknown) => err instanceof CatalogError && err.code === "FILTER_MISMATCH",
  );
});

test("assertCursorCompatible: versión distinta → VERSION_MISMATCH", () => {
  const f = filterFingerprint({ category: "Tecno" });
  const payload: CursorPayload = { s: "name", p: "p1", f, v: "v1" };
  assert.throws(
    () => assertCursorCompatible(payload, { category: "Tecno" }, "v2"),
    (err: unknown) => err instanceof CatalogError && err.code === "VERSION_MISMATCH",
  );
});