import assert from "node:assert/strict";
import test from "node:test";
import { isFootwearProduct } from "../src/utils/isTallBoot.ts";

test("marks every Calzado category product for footwear image framing", () => {
  assert.equal(isFootwearProduct("Malu", "", "mdt-1", "Calzado"), true);
  assert.equal(isFootwearProduct("Sandalia", "", "mdt-2", "CALZADO"), true);
});

test("recognizes footwear keywords when legacy products lack a category", () => {
  assert.equal(isFootwearProduct("Zapato cerrado", "", "legacy-1"), true);
  assert.equal(isFootwearProduct("Cartera", "Botín clásico", "legacy-2"), true);
  assert.equal(isFootwearProduct("Accesorio", "", "legacy-3", "", ["Sandalias"]), true);
});

test("keeps non-footwear products on the default cover framing", () => {
  assert.equal(isFootwearProduct("Toalla", "Algodón", "hogar-1", "Baño"), false);
  assert.equal(isFootwearProduct("Buzo", "Rústico", "ropa-1", "Ropa"), false);
});
