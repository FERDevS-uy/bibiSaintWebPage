import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderFeaturedProductRows, chooseFeaturedProducts } from "../src/server/featuredProducts.ts";

test("catalog records follow persisted editorial order and omit unavailable IDs", () => {
  const rows = [
    { id: "p1", name: "One", image_url: "1.jpg" },
    { id: "p2", name: "Two", image_url: "2.jpg" },
  ];
  assert.deepEqual(orderFeaturedProductRows(["p2", "missing", "p1"], rows), [rows[1], rows[0]]);
});

test("empty editorial selection preserves the existing storefront fallback", () => {
  const fallback = [{ id: "fallback" }];
  assert.equal(chooseFeaturedProducts([], fallback), fallback);
  const editorial = [{ id: "chosen" }];
  assert.equal(chooseFeaturedProducts(editorial, fallback), editorial);
});

test("storefront facade sources editorial IDs separately from its legacy catalog fallback", () => {
  const source = readFileSync(new URL("../src/server/catalog/facade.ts", import.meta.url), "utf8");
  assert.match(source, /from\("featured_products"\)/);
  assert.match(source, /chooseFeaturedProducts\(editorial, all\.items\.slice\(0, 8\)\)/);
});
