import assert from "node:assert/strict";
import test from "node:test";
import { presentSizes } from "../src/client/productDetail/sizeNorm.ts";

test("preserves the real numeric sizes for footwear", () => {
  assert.deepEqual(presentSizes(["40", "38", "40", "42"], "numeric"), ["38", "40", "42"]);
});

test("keeps apparel normalization separate from footwear presentation", () => {
  assert.deepEqual(presentSizes(["40", "42", "44"], "apparel"), ["S", "M", "L"]);
});
