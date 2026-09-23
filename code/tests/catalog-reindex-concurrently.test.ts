import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../supabase/migrations/20260922192159_reindex_catalog_products_concurrently.sql",
    import.meta.url,
  ),
  "utf8",
);

test("catalog index remediation uses a concurrent table reindex", () => {
  assert.match(
    sql,
    /REINDEX\s+TABLE\s+CONCURRENTLY\s+public\.catalog_products\s*;/i,
  );
});
