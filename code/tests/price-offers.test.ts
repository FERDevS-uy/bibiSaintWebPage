import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeOfferOriginalPrice } from "../src/utils/price.ts";
import { toCardProduct } from "../src/server/catalog/mappers.ts";
import { runCatalogQuery } from "../src/server/catalog/queries.ts";

const ENV = { CATALOG_READ_MODEL: "true" };

function makeSupabaseMock(rows: unknown[], version = "v1") {
  const chain: Record<string, any> = {};
  let countWithRows = false;

  chain.from = () => chain;
  chain.select = (_cols: string, opts?: unknown) => {
    if (opts && typeof opts === "object" && (opts as { count?: string }).count === "exact") {
      countWithRows = !(opts as { head?: boolean }).head;
    }
    return chain;
  };
  chain.eq = () => chain;
  chain.ilike = () => chain;
  chain.order = () => chain;
  chain.or = () => chain;
  chain.limit = () => Promise.resolve({ data: rows, error: null, count: countWithRows ? rows.length : null });
  chain.single = () => Promise.resolve({ data: { version }, error: null });

  return chain;
}

test("normalizeOfferOriginalPrice only accepts original prices above a positive current price", () => {
  assert.equal(normalizeOfferOriginalPrice("1200", "1000"), 1200);
  assert.equal(normalizeOfferOriginalPrice("0", "1000"), null);
  assert.equal(normalizeOfferOriginalPrice("900", "1000"), null);
  assert.equal(normalizeOfferOriginalPrice("1000", "1000"), null);
  assert.equal(normalizeOfferOriginalPrice("", "1000"), null);
  assert.equal(normalizeOfferOriginalPrice("not-a-price", "1000"), null);
  assert.equal(normalizeOfferOriginalPrice("1200", "0"), null);
  assert.equal(normalizeOfferOriginalPrice("1200", "not-a-price"), null);
});

test("toCardProduct does not serialize invalid originalPrice offers", () => {
  const product = toCardProduct({
    id: "p1",
    name: "Bottle",
    price: 1000,
    originalPrice: 0,
    imageUrl: "bottle.jpg",
    enOferta: true,
    category: "Tecno",
  });

  assert.equal(product.enOferta, false);
  assert.equal(product.originalPrice, null);
  assert.equal(product.price, "1000");
});

test("runCatalogQuery normalizes read-model originalPrice and enOferta", async () => {
  const rows = [
    {
      id: "valid",
      name: "Valid",
      price: 1000,
      originalPrice: 1200,
      imageUrl: "valid.jpg",
      enOferta: true,
      category: "Tecno",
      subcategory: "Audio",
      sort_name: "valid",
    },
    {
      id: "zero",
      name: "Zero",
      price: 1000,
      originalPrice: 0,
      imageUrl: "zero.jpg",
      enOferta: true,
      category: "Tecno",
      subcategory: "Audio",
      sort_name: "zero",
    },
  ];

  const result = await runCatalogQuery(
    { sort: "nombre", pageSize: 10 },
    ENV,
    makeSupabaseMock(rows),
  );

  assert.equal(result.items[0].enOferta, true);
  assert.equal(result.items[0].originalPrice, 1200);
  assert.equal(result.items[1].enOferta, false);
  assert.equal(result.items[1].originalPrice, undefined);
});

test("price cleanup migration publishes catalog version only after actual cleanup", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/013_clean_invalid_original_prices.sql", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(sql, /SELECT\s+public\.catalog_rebuild\s*\(\s*\)\s*;/i);
  assert.match(sql, /IF\s+changed_products\s*>\s*0\s+OR\s+changed_catalog_products\s*>\s*0\s+THEN/i);
  assert.match(sql, /UPDATE\s+public\.catalog_version\s+SET\s+version\s*=\s*version\s*\+\s*1/is);
});
