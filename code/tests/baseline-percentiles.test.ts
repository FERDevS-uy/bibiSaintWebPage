// tests/baseline-percentiles.test.ts
// TDD — Tarea 1.1 (parcial): matemática de percentiles del script de baseline,
// extraída como función pura exportada para testearla sin red ni servidor.
// Se ejecutan con: pnpm run test:unit (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { percentiles } from "../scripts/baseline-routes.mjs";

test("percentiles: arreglo vacío → NaN por cada q", () => {
  const result = percentiles([], [50, 95, 99]);
  assert.equal(result.length, 3);
  for (const v of result) assert.ok(Number.isNaN(v));
});

test("percentiles: un solo elemento → ese valor en todos los q", () => {
  assert.deepEqual(percentiles([5], [50, 95, 99]), [5, 5, 5]);
});

test("percentiles: nearest-rank sobre [1..5] → p50=3, p95=5, p99=5", () => {
  assert.deepEqual(percentiles([1, 2, 3, 4, 5], [50, 95, 99]), [3, 5, 5]);
});

test("percentiles: sobre 10 valores → p50=50, p95=100, p99=100", () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.deepEqual(percentiles(values, [50, 95, 99]), [50, 100, 100]);
});

test("percentiles: ordena internamente (entrada desordenada)", () => {
  assert.deepEqual(percentiles([5, 1, 3, 2, 4], [50]), [3]);
});

test("percentiles: q fuera de rango lanza RangeError", () => {
  assert.throws(() => percentiles([1, 2, 3], [101]), RangeError);
  assert.throws(() => percentiles([1, 2, 3], [-1]), RangeError);
});