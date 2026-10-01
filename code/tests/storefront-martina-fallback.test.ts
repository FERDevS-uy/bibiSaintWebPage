import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Martina verification timeout leaves every static size selectable for cart", () => {
  const source = readFileSync(
    new URL("../src/client/productDetail/liveStock/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /catch\s*\(error\)\s*\{[^}]*setStatus\([^}]*\);\s*\}/s);
  assert.doesNotMatch(source, /catch\s*\([^)]*\)\s*\{[^}]*requiresSizeSelection\s*=\s*false/s);
});

test("Header keeps mobile search drawer access and native titles without category movement animation", () => {
  const source = readFileSync(
    new URL("../src/layouts/Header.astro", import.meta.url),
    "utf8",
  );
  assert.match(source, /id="mobileSearchBtn"/);
  assert.match(source, /mobileSearchBtn\.addEventListener\("click"/);
  assert.match(source, /astroNavMenu\.click\(\)/);
  assert.match(source, /\.search__container\.sideBar input/);
  assert.match(source, /sidebarInput\.focus\(\)/);
  assert.match(source, /title=\{sub\.name\}/);
  assert.match(source, /title=\{groupData\.group\}/);
  const scopedStyles = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const globalStyles = source.match(/<style is:global>([\s\S]*?)<\/style>/)?.[1] ?? "";
  assert.match(scopedStyles, /\.mobileSearchBtn\s*\{[^}]*display:\s*none/s);
  const mobileSearchRule = globalStyles.match(/@media screen and \(max-width:\s*999px\)([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(mobileSearchRule, /header \.navMenu \.mobileSearchBtn\s*\{\s*display:\s*flex/s);
  assert.doesNotMatch(source, /scroll-truncated-category-label|updateTruncatedCategoryLabels|bindTruncatedCategoryLabelHover|--label-scroll-distance|is-truncated/);
});

test("campaign metadata validation cannot reject a product lookup when the campaign code is usable", () => {
  const source = readFileSync(
    new URL("../src/pages/api/martina/product-price.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /const campaignCode = String\(configPayload\?\.code/);
  assert.match(source, /fetchMartinaProductById\(numeric, campaignCode/);
  assert.match(source, /campaignMetadataWarning/);
  assert.doesNotMatch(source, /const campaign = parseCampaign\(configRaw\)/);
});
