import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260929170347_secure_catalog_source_writes.sql", import.meta.url),
  "utf8",
);
const migrationScript = readFileSync(new URL("../scripts/migrateToSupabase.mjs", import.meta.url), "utf8");
const sourceTables = ["products", "product_images", "product_related", "scraper_diffs"];
const publicCatalogTables = ["products", "product_images", "product_related"];

test("source-table mutation privileges are revoked through PUBLIC and client roles", () => {
  for (const table of sourceTables) {
    assert.match(
      migration,
      new RegExp(`REVOKE\\s+ALL(?:\\s+PRIVILEGES)?\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated`, "i"),
      `${table} must revoke every direct and inherited privilege from public clients`,
    );
  }
});

test("public reads are limited to catalog tables and scraper_diffs is private", () => {
  for (const table of publicCatalogTables) {
    assert.match(migration, new RegExp(`GRANT\\s+SELECT\\s+ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+anon\\s*,\\s*authenticated`, "i"));
  }
  assert.match(
    migration,
    /REVOKE\s+SELECT\s+ON\s+TABLE\s+public\.scraper_diffs\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.doesNotMatch(migration, /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.scraper_diffs\s+TO\s+anon\s*,\s*authenticated/i);
});

test("service_role has explicit read and write privileges on every source table", () => {
  for (const table of sourceTables) {
    assert.match(
      migration,
      new RegExp(`GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+service_role`, "i"),
    );
  }
});

test("migration removes admin FOR ALL policies without recreating client write policies", () => {
  for (const table of sourceTables) {
    assert.match(migration, new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+[\\"']${table}_admin_all[\\"']\\s+ON\\s+public\\.${table}`, "i"));
    assert.doesNotMatch(migration, new RegExp(`CREATE\\s+POLICY[\\s\\S]*?ON\\s+public\\.${table}\\s+FOR\\s+ALL`, "i"));
    assert.match(migration, new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"));
  }
  for (const table of publicCatalogTables) {
    assert.doesNotMatch(migration, new RegExp(`DROP\\s+POLICY[\\s\\S]*?${table}_select_public`, "i"), "public SELECT policy must not be dropped");
  }
});

test("catalog_rebuild is executable only by service_role", () => {
  assert.match(migration, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.catalog_rebuild\s*\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(migration, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.catalog_rebuild\s*\(\)\s+TO\s+service_role/i);
});

test("migration script requires service-role credentials and has no anon fallback", () => {
  assert.match(migrationScript, /const\s+SUPABASE_KEY\s*=\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY\s*\|\|\s*""/);
  assert.doesNotMatch(migrationScript, /SUPABASE_SERVICE_ROLE_KEY\s*\|\|\s*process\.env\.SUPABASE_ANON_KEY/);
});
