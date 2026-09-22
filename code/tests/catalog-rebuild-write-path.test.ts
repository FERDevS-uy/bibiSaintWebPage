import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static contract for T2 (ODD martina-apply-and-catalog-bloat): the write-path
// migration must keep catalog_rebuild() idempotent at the storage level without
// a bare DELETE and without rewriting unchanged rows. No SQL harness or psql is
// available in this environment, so the migration SQL is asserted by reading.
const sql = readFileSync(
  new URL(
    "../supabase/migrations/20260922164652_optimize_catalog_rebuild_write_path.sql",
    import.meta.url,
  ),
  "utf8",
);

test("catalog rebuild has no bare DELETE on categories, keeps an always-true WHERE", () => {
  assert.doesNotMatch(
    sql,
    /DELETE\s+FROM\s+public\.catalog_categories\s*;/i,
    "bare DELETE without WHERE must not come back",
  );
  assert.match(
    sql,
    /DELETE\s+FROM\s+public\.catalog_categories\s+WHERE\s+category_name\s+IS\s+NOT\s+NULL\s*;/i,
    "full-rebuild semantics preserved with an always-true WHERE (category_name is NOT NULL)",
  );
});

test("catalog rebuild upsert skips unchanged rows, excluding updated_at from the guard", () => {
  const guard = sql.match(
    /WHERE\s*\([\s\S]*?\)\s*IS\s+DISTINCT\s+FROM\s*\([\s\S]*?\)/i,
  );
  assert.ok(guard, "upsert must be guarded by IS DISTINCT FROM");
  assert.doesNotMatch(
    guard[0],
    /updated_at/i,
    "updated_at must stay out of the guard so an unchanged rebuild touches nothing",
  );
  assert.match(
    sql,
    /updated_at\s*=\s*EXCLUDED\.updated_at/i,
    "updated_at still refreshes when the payload actually changes",
  );
});

test("catalog rebuild keeps the function revoked from public", () => {
  assert.match(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.catalog_rebuild\s*\(\s*\)\s+FROM\s+public/i,
  );
});
