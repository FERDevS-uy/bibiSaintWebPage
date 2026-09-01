import { execFileSync } from "node:child_process";
import test from "node:test";

const LOCAL_DB_CONTAINER = "supabase_db_code";

const integrationSql = String.raw`
\set ON_ERROR_STOP on
BEGIN;

SELECT version AS initial_version INTO TEMP TABLE integration_initial_version
FROM public.catalog_version WHERE id = 1;

-- Keep the fixture namespace isolated and deterministic.
DELETE FROM public.products WHERE id LIKE 'it-62-%' OR id = 'mdt-it-62-martina';
DELETE FROM public.catalog_products WHERE product_id LIKE 'it-62-%' OR product_id = 'mdt-it-62-martina';
DELETE FROM public.catalog_changes WHERE product_id LIKE 'it-62-%' OR product_id = 'mdt-it-62-martina';
DELETE FROM public.catalog_categories
WHERE category_name IN ('Ropa', 'Tecno', 'Hogar de Integracion');

  INSERT INTO public.products (
  id, name, description, price, img, categories, source, active, created_at, updated_at
) VALUES
  (
    'mdt-it-62-martina', 'Zapatilla Martina Integracion',
    'Botin de invierno para mujer', '$ 12.345,67',
    '["https://example.test/martina.jpg"]'::jsonb,
    '{"name":"MUJER","subcategories":[{"name":"Mujer - Botas"}]}'::jsonb,
    'manual', true, '2025-01-02T03:04:05Z', '2025-01-02T03:04:05Z'
  ),
  (
    'mdt-it-62-hombre', 'Buzo Martina Integracion',
    'Buzo de invierno para hombre', '$ 13.345,67',
    '["https://example.test/martina-hombre.jpg"]'::jsonb,
    '{"name":"HOMBRE","subcategories":[{"name":"HOMBRE - BUZOS"}]}'::jsonb,
    'manual', true, '2025-01-03T03:04:05Z', '2025-01-03T03:04:05Z'
  ),
  (
    'it-62-speaker', 'Speaker Integracion',
    'Portable audio device', '1.250',
    '["https://example.test/speaker.jpg"]'::jsonb,
    '{"name":"Tecno","subcategories":[]}'::jsonb,
    'manual', true, '2025-02-02T03:04:05Z', '2025-02-02T03:04:05Z'
  ),
  (
    'it-62-description', 'Producto Basico Integracion',
    'winterproof descripcion exclusiva', '900',
    '["https://example.test/basic.jpg"]'::jsonb,
    '{"name":"Hogar de Integracion","subcategories":[{"name":"Cocina"}]}'::jsonb,
    'manual', true, '2025-03-02T03:04:05Z', '2025-03-02T03:04:05Z'
  ),
  (
    'it-62-inactive', 'Producto Inactivo Integracion',
    'must not be publicly visible', '800', '[]'::jsonb,
    '{"name":"Hogar de Integracion","subcategories":[]}'::jsonb,
    'manual', false, '2025-04-02T03:04:05Z', '2025-04-02T03:04:05Z'
  );

INSERT INTO public.products (id, name, description, price, img, categories, source)
SELECT
  'it-62-limit-' || n,
  'Cargador Integracion ' || n,
  'bulk limit fixture',
  '1000', '[]'::jsonb,
  '{"name":"Tecno","subcategories":[]}'::jsonb,
  'manual'
FROM generate_series(1, 50) AS n;

DO $$
DECLARE
  projection public.catalog_products%ROWTYPE;
  pending_count integer;
BEGIN
  SELECT * INTO projection FROM public.catalog_products WHERE product_id = 'mdt-it-62-martina';
   IF projection.category <> 'Ropa'
      OR projection.subcategory <> 'Mujer - Botas'
     OR projection.numeric_price <> 12345.67
     OR projection.description <> 'Botin de invierno para mujer'
     OR projection.search_text NOT LIKE '%zapatilla martina%' THEN
    RAISE EXCEPTION 'trigger projection normalization failed: category=%, subcategory=%, price=%, description=%, search_text=%',
      projection.category, projection.subcategory, projection.numeric_price,
      projection.description, projection.search_text;
     END IF;

   SELECT category, subcategory INTO projection.category, projection.subcategory
   FROM public.catalog_products WHERE product_id = 'mdt-it-62-hombre';
   IF projection.category <> 'Ropa' OR projection.subcategory <> 'Hombre - Buzos' THEN
     RAISE EXCEPTION 'Hombre subcategory casing normalization failed: category=%, subcategory=%',
       projection.category, projection.subcategory;
   END IF;

   SELECT count(*) INTO pending_count
   FROM public.catalog_products
   WHERE active = true AND category = 'Ropa' AND subcategory = 'Hombre - Buzos';
   IF pending_count = 0 THEN
     RAISE EXCEPTION 'canonical read-model query returned zero Hombre - Buzos rows';
   END IF;

  SELECT subcategory INTO projection.subcategory
  FROM public.catalog_products WHERE product_id = 'it-62-speaker';
  IF projection.subcategory <> 'Audio' THEN
    RAISE EXCEPTION 'Tecno subcategory inference failed';
  END IF;

  SELECT count(*) INTO pending_count
  FROM public.catalog_changes
   WHERE (product_id LIKE 'it-62-%' OR product_id LIKE 'mdt-it-62-%') AND processed = false;
   IF pending_count <> 55 THEN
     RAISE EXCEPTION 'change queue expected 55 pending rows, got %', pending_count;
  END IF;
END $$;

UPDATE public.products
SET description = 'winterproof updated description'
WHERE id = 'it-62-description';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_products
    WHERE product_id = 'it-62-description'
      AND search_text LIKE '%winterproof updated description%'
      AND description = 'winterproof updated description'
  ) THEN
    RAISE EXCEPTION 'description update did not propagate to the read model';
  END IF;
END $$;

  SELECT public.catalog_rebuild() AS version INTO TEMP TABLE integration_versions;

DO $$
DECLARE
  category_count integer;
  zero_count integer;
  version_value bigint;
  baseline_version bigint;
  ingested timestamptz;
BEGIN
  SELECT version INTO version_value FROM public.catalog_version WHERE id = 1;
  SELECT initial_version INTO baseline_version FROM integration_initial_version;
  IF version_value <> baseline_version + 1
     OR (SELECT version FROM integration_versions) <> baseline_version + 1 THEN
    RAISE EXCEPTION 'first rebuild did not publish the next version';
  END IF;

  SELECT product_count INTO category_count
  FROM public.catalog_categories
  WHERE category_name = 'Tecno' AND subcategory_name = '';
  IF category_count <> 51 THEN
    RAISE EXCEPTION 'Tecno aggregate expected 51, got %', category_count;
  END IF;

  SELECT product_count INTO zero_count
  FROM public.catalog_categories
  WHERE category_name = 'Tecno' AND subcategory_name = 'Soportes';
  IF zero_count <> 0 THEN
    RAISE EXCEPTION 'taxonomy zero-count category was not preserved';
  END IF;

  SELECT ingested_at INTO ingested FROM public.catalog_products
  WHERE product_id = 'mdt-it-62-martina';
  IF ingested <> '2025-01-02T03:04:05Z'::timestamptz THEN
    RAISE EXCEPTION 'created_at was not materialized as ingested_at';
  END IF;

    IF EXISTS (SELECT 1 FROM public.catalog_changes WHERE (product_id LIKE 'it-62-%' OR product_id = 'mdt-it-62-martina') AND processed = false) THEN
    RAISE EXCEPTION 'rebuild did not process the captured change queue';
  END IF;
END $$;

INSERT INTO integration_versions (version) VALUES (public.catalog_rebuild());

DO $$
DECLARE
  version_value bigint;
  category_count integer;
  baseline_version bigint;
BEGIN
  SELECT version INTO version_value FROM public.catalog_version WHERE id = 1;
  SELECT initial_version INTO baseline_version FROM integration_initial_version;
  SELECT product_count INTO category_count FROM public.catalog_categories
  WHERE category_name = 'Tecno' AND subcategory_name = '';
   IF (SELECT version FROM integration_versions ORDER BY version DESC LIMIT 1) <> baseline_version + 2
      OR version_value <> baseline_version + 2 OR category_count <> 51 THEN
    RAISE EXCEPTION 'second rebuild was not idempotent';
  END IF;
END $$;

DO $$
DECLARE
  result_count integer;
BEGIN
  SELECT count(*) INTO result_count FROM public.catalog_search_products('bo', 48);
  IF result_count <> 0 THEN RAISE EXCEPTION 'short query must return zero rows'; END IF;
  SELECT count(*) INTO result_count FROM public.catalog_search_products('sapatilla', 48);
  IF result_count = 0 THEN RAISE EXCEPTION 'typo search returned no rows'; END IF;
  SELECT count(*) INTO result_count FROM public.catalog_search_products('zapatilla mujer', 48);
  IF result_count = 0 THEN RAISE EXCEPTION 'multi-word search returned no rows'; END IF;
  SELECT count(*) INTO result_count FROM public.catalog_search_products('winterproof updated', 48);
  IF result_count = 0 THEN RAISE EXCEPTION 'description search returned no rows'; END IF;
  SELECT count(*) INTO result_count FROM public.catalog_search_products('cargador integracion', 0);
  IF result_count <> 1 THEN RAISE EXCEPTION 'lower limit clamp failed'; END IF;
  SELECT count(*) INTO result_count FROM public.catalog_search_products('cargador integracion', 100);
  IF result_count > 48 THEN RAISE EXCEPTION 'upper limit clamp failed'; END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.catalog_products (product_id, name, sort_name)
    VALUES (NULL, 'invalid', 'invalid');
    RAISE EXCEPTION 'expected invalid projection insert to fail';
  EXCEPTION WHEN not_null_violation THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.catalog_products WHERE name = 'invalid') THEN
    RAISE EXCEPTION 'failed write escaped its rollback boundary';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.catalog_products'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'catalog_products RLS is disabled';
  END IF;
  IF NOT has_table_privilege('anon', 'public.catalog_products', 'SELECT') THEN
    RAISE EXCEPTION 'anon lacks catalog_products SELECT';
  END IF;
  IF has_table_privilege('anon', 'public.catalog_products', 'INSERT') THEN
    RAISE EXCEPTION 'anon unexpectedly has catalog_products INSERT';
  END IF;
  IF NOT has_function_privilege('anon', 'public.catalog_search_products(text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon lacks search RPC EXECUTE';
  END IF;
END $$;

ROLLBACK;
`;

test("catalog integration passes against the local Supabase database", () => {
  try {
    execFileSync(
      "docker",
      ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
      { input: integrationSql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (error) {
    const diagnostics = error instanceof Error && "stderr" in error
      ? String(error.stderr).trim().replace(/\s+/g, " ").slice(0, 500)
      : "";
    throw new Error(
      `Local Supabase integration unavailable or failed${diagnostics ? `: ${diagnostics}` : ""}. Start the local stack and rerun this test; no remote database is used.`,
    );
  }
});
