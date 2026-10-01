import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Martina live check keeps unknown availability distinct from explicit out of stock", () => {
  const source = readFileSync(
    new URL(
      "../src/client/productDetail/liveStock/martina.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /typeof data\?\.inStock !== "boolean"/);
  assert.match(source, /if \(data\.inStock === false\)/);
  assert.match(source, /setSizeRequirement\(!shouldSkipSize\)/);
  assert.match(source, /hasExplicitNoSize\(allRawSizes\)/);
});

test("live-check button keeps fixed dimensions and status copy below it", () => {
  const source = readFileSync(
    new URL(
      "../src/components/producto/ProductInfoPanel.astro",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /\.checkStockBtn\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(source, /\.checkStockBtn\s*\{[^}]*flex:\s*none/s);
  assert.match(source, /\.checkStockBtn\s*\{[^}]*height:\s*40px/s);
  assert.doesNotMatch(source, /\.checkStockBtn\s*\{[^}]*flex:\s*0\s+0\s+190px/s);
  assert.doesNotMatch(
    source,
    /\.runtimeStockCheck\s*\{[^}]*flex-direction:\s*row/s,
  );
});
