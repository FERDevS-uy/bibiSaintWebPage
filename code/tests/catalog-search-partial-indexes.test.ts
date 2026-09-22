import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static contract for T2 (ODD martina-deactivation-fix): inactive rows must no
// longer be indexed — the two search GINs (tsvector + trigram) become partial
// WHERE active = true, replacing the full indexes from 008. No SQL harness or
// psql is available in this environment, so the migration SQL is asserted by
// reading (same style as catalog-rebuild-write-path.test.ts).
const sql = readFileSync(
  new URL(
    "../supabase/migrations/016_catalog_search_partial_indexes.sql",
    import.meta.url,
  ),
  "utf8",
);

function statementsFor(sqlText: string, name: string): string[] {
  return sqlText
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes(name));
}

test("tsvector search GIN is replaced by a partial index (WHERE active = true)", () => {
  const created = statementsFor(
    sql,
    "idx_catalog_products_search_vector_active",
  ).filter((stmt) => /CREATE\s+INDEX/i.test(stmt));
  assert.ok(
    created.length > 0,
    "016 must CREATE the partial tsvector GIN (idx_catalog_products_search_vector_active)",
  );
  for (const stmt of created) {
    assert.match(
      stmt,
      /USING\s+gin\s*\(\s*search_vector\s*\)/i,
      "partial tsvector GIN must index search_vector",
    );
    assert.match(
      stmt,
      /WHERE\s+active\s*=\s*true/i,
      "tsvector GIN must be partial WHERE active = true",
    );
  }
  const dropped = statementsFor(
    sql,
    "idx_catalog_products_search_vector",
  ).filter(
    (stmt) =>
      /DROP\s+INDEX/i.test(stmt) &&
      !stmt.includes("idx_catalog_products_search_vector_active"),
  );
  assert.ok(
    dropped.length > 0,
    "016 must DROP the old full tsvector GIN (idx_catalog_products_search_vector)",
  );
});

test("trigram search GIN is replaced by a partial index (WHERE active = true)", () => {
  const created = statementsFor(
    sql,
    "idx_catalog_products_search_text_trgm_active",
  ).filter((stmt) => /CREATE\s+INDEX/i.test(stmt));
  assert.ok(
    created.length > 0,
    "016 must CREATE the partial trigram GIN (idx_catalog_products_search_text_trgm_active)",
  );
  for (const stmt of created) {
    assert.match(
      stmt,
      /USING\s+gin\s*\(\s*search_text\s+gin_trgm_ops\s*\)/i,
      "partial trigram GIN must index search_text with gin_trgm_ops",
    );
    assert.match(
      stmt,
      /WHERE\s+active\s*=\s*true/i,
      "trigram GIN must be partial WHERE active = true",
    );
  }
  const dropped = statementsFor(
    sql,
    "idx_catalog_products_search_text_trgm",
  ).filter(
    (stmt) =>
      /DROP\s+INDEX/i.test(stmt) &&
      !stmt.includes("idx_catalog_products_search_text_trgm_active"),
  );
  assert.ok(
    dropped.length > 0,
    "016 must DROP the old full trigram GIN (idx_catalog_products_search_text_trgm)",
  );
});

test("no full (unpredicated) definition of the search GINs remains", () => {
  for (const stmt of sql.split(";")) {
    if (!/CREATE\s+INDEX/i.test(stmt)) continue;
    if (!/search_vector|search_text/i.test(stmt)) continue;
    assert.match(
      stmt,
      /WHERE\s+active\s*=\s*true/i,
      `every CREATE INDEX over search_vector/search_text must be partial, got: ${stmt.trim().slice(0, 120)}`,
    );
  }
});

test("partial search GINs build without blocking writes", () => {
  for (const stmt of sql.split(";")) {
    if (!/CREATE\s+INDEX/i.test(stmt)) continue;
    if (!/search_vector|search_text/i.test(stmt)) continue;
    assert.match(
      stmt,
      /CREATE\s+INDEX\s+CONCURRENTLY/i,
      "search GIN rebuild must use CONCURRENTLY (no write lock on catalog_products)",
    );
  }
});
