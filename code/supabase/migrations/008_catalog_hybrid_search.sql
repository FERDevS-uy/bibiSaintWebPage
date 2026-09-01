-- 008_catalog_hybrid_search.sql
-- Búsqueda híbrida (full-text tsvector + trigramas pg_trgm) sobre catalog_products.
-- Change: scalable-catalog-read-pipeline — Grupo 3 (tarea 3.4).
--
-- Aditiva: NO altera migraciones 001–007. Solo añade columna, trigger,
-- índices y RPC a catalog_products (tabla del read model creada en 007).
--
-- Dependencias: 007 (catalog_products, search_text, extensión unaccent).
--
-- Ejecutar vía `supabase db push` o `supabase db reset`.
-- Fecha: 2026-08-30
-- Autor: DBA agent (Bibi Saint)

-- ============================================================
-- 0) Extensión: pg_trgm (trigramas para similitud fuzzy)
--     007 ya crea unaccent; pg_trgm es necesaria para los
--     índices gin_trgm_ops y la función similarity().
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1) Columna search_vector tsvector en catalog_products
--    Materializa el tsvector para búsqueda full-text.
--    Se popula vía trigger (sección 2) y se mantiene sincronizada
--    con search_text ante cada INSERT/UPDATE.
-- ============================================================

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- ============================================================
-- 2) Trigger: popula search_vector antes de INSERT/UPDATE
--    sobre catalog_products. Aditivo — NO modifica el trigger
--    de 007 (trg_catalog_products_sync en products).
--
--    Formula: to_tsvector('spanish', unaccent(search_text))
--    search_text ya está normalizado (lower+unaccent) por 007,
--    pero se aplica unaccent nuevamente por idempotencia y
--    consistencia con la configuración 'spanish'.
--
--    Cascada de triggers (cross-table, misma transacción):
--      products INSERT/UPDATE
--        → trg_catalog_products_sync (007, SECURITY DEFINER)
--          → catalog_products INSERT/UPDATE (set search_text)
--            → trg_catalog_products_search_vector (este trigger)
--              → set search_vector
-- ============================================================

CREATE OR REPLACE FUNCTION public.catalog_products_search_vector_fn()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('spanish', public.unaccent(COALESCE(NEW.search_text, '')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_catalog_products_search_vector ON public.catalog_products;
CREATE TRIGGER trg_catalog_products_search_vector
  BEFORE INSERT OR UPDATE ON public.catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.catalog_products_search_vector_fn();

-- ============================================================
-- 3) Backfill: popula search_vector para filas existentes.
--    El trigger mantiene la columna sincronizada en adelante.
--    También dispara el trigger BEFORE UPDATE (mismo valor).
-- ============================================================

UPDATE public.catalog_products
SET search_vector = to_tsvector('spanish', public.unaccent(COALESCE(search_text, '')));

-- ============================================================
-- 4) Índices GIN (búsqueda full-text + trigramas)
--    Full index (no parcial) — el filtro active=true se aplica
--    en la RPC. El planner combina index scan + filter.
--    Para catálogos muy grandes (>100k), considerar índices
--    parciales WHERE active = true como optimización futura.
-- ============================================================

-- 4a) GIN sobre tsvector: búsqueda full-text con ranking
CREATE INDEX IF NOT EXISTS idx_catalog_products_search_vector
  ON public.catalog_products USING gin (search_vector);

-- 4b) GIN sobre trigramas: similitud fuzzy (typos, variantes)
--     Habilita el operador % (similarity > threshold) y
--     búsquedas KNN por distancia de trigramas.
CREATE INDEX IF NOT EXISTS idx_catalog_products_search_text_trgm
  ON public.catalog_products USING gin (search_text gin_trgm_ops);

-- ============================================================
-- 5) RPC: búsqueda híbrida (full-text + trigramas)
--     RETURNS TABLE con las columnas de CatalogCardProjection
--     (contracts.ts L29-38) + score para ordenamiento.
--
--     Política:
--     - p_limit clampeado a 1..48 (default 48).
--     - < 3 caracteres (post-trim) → 0 filas (documentado).
--       Razón: queries tan cortas generan demasiados falsos
--       positivos y tsqueries vacías por stopwords.
--     - websearch_to_tsquery: sin interpolación de texto de
--       usuario (parámetro PL/pgSQL, no string dinámico).
--     - Ranking determinista: ts_rank_cd * 0.7 + similarity * 0.3.
--     - Orden final: score DESC, sort_name ASC, product_id ASC.
--     - Filtro: active = true (excluye inactivos).
--     - Ejecutable por anon/authenticated (lectura pública).
-- ============================================================

CREATE OR REPLACE FUNCTION public.catalog_search_products(
  p_query text,
  p_limit integer DEFAULT 48
)
RETURNS TABLE (
  product_id     text,
  name           text,
  numeric_price  numeric,
  original_price numeric,
  image_url      text,
  en_oferta      boolean,
  category       text,
  subcategory    text,
  score          real
)
STABLE
LANGUAGE plpgsql
AS $$
DECLARE
  clamped_limit    integer;
  normalized_query text;
  tsq              tsquery;
BEGIN
  -- Clamar límite a 1..48
  clamped_limit := greatest(1, least(COALESCE(p_limit, 48), 48));

  -- Normalizar query para similitud (misma normalización que search_text)
  normalized_query := lower(public.unaccent(trim(COALESCE(p_query, ''))));

  -- Rechazar queries de < 3 caracteres → 0 filas
  IF length(normalized_query) < 3 THEN
    RETURN;
  END IF;

  -- Construir tsquery con prefix matching (seguro, sin interpolación)
  -- websearch_to_tsquery no soporta operador prefix (:*). En su lugar:
  -- 1) Normalizar (lower + unaccent + trim) → normalized_query
  -- 2) Split por whitespace, strip non-alphanumeric, append ':*'
  -- 3) Join con ' & ' → string seguro para to_tsquery
  -- Ejemplo: "zapat" → "zapat:*" → tsquery 'zapat':* → match 'zapatill'
  DECLARE
    prefix_tsquery_str text;
  BEGIN
    SELECT string_agg(regexp_replace(word, '[^a-z0-9]', '', 'g') || ':*', ' & ')
    INTO prefix_tsquery_str
    FROM regexp_split_to_table(normalized_query, '\s+') AS word
    WHERE length(regexp_replace(word, '[^a-z0-9]', '', 'g')) > 0;

    IF prefix_tsquery_str IS NULL OR prefix_tsquery_str = '' THEN
      -- Query vacía o solo caracteres especiales → 0 filas
      RETURN;
    END IF;

    tsq := to_tsquery('spanish', prefix_tsquery_str);
  EXCEPTION WHEN OTHERS THEN
    -- tsquery inválido (input patológico) → 0 filas
    RETURN;
  END;

  -- Búsqueda híbrida: full-text match OR trigram similarity
  -- El WHERE combina ambos índices GIN vía BitmapOr (el planner
  -- elige el plan más eficiente según selectividad).
  --
  -- Threshold trigram: set_limit(0.1) en lugar del default 0.3
  -- Razón: typos como "sapatilla" tienen similarity 0.184 < 0.3.
  -- set_limit() afecta el operador % para esta transacción (scoped).
  -- El GIN trgm index se usa con % (no con similarity() explícito).
  PERFORM set_limit(0.1);

  RETURN QUERY
  SELECT
    cp.product_id,
    cp.name,
    cp.numeric_price,
    cp.original_price,
    cp.image_url,
    cp.en_oferta,
    cp.category,
    cp.subcategory,
    (ts_rank_cd(cp.search_vector, tsq) * 0.7 +
     similarity(cp.search_text, normalized_query) * 0.3)::real AS score
  FROM public.catalog_products cp
  WHERE cp.active = true
    AND (
      cp.search_vector @@ tsq
      OR cp.search_text % normalized_query
    )
  ORDER BY score DESC, cp.sort_name ASC, cp.product_id ASC
  LIMIT clamped_limit;
END;
$$;

-- ============================================================
-- 6) Permisos (consistente con 007: lectura pública, writes service_role)
--    La RPC es de lectura pública → EXECUTE a anon/authenticated.
--    Se revoca de public para evitar ejecución por roles no autorizados
--    (defensa en profundidad; service_role ejecuta siempre).
-- ============================================================

REVOKE ALL ON FUNCTION public.catalog_search_products(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.catalog_search_products(text, integer) TO anon, authenticated;

-- También revocar EXECUTE de la función trigger (defensa en profundidad,
-- consistente con 007 que revoca catalog_products_trigger_fn y catalog_rebuild)
REVOKE ALL ON FUNCTION public.catalog_products_search_vector_fn() FROM public;

-- ============================================================
-- 7) Permisos de lectura sobre tablas del read model
--    007 creó las tablas pero no otorgó SELECT a anon/authenticated.
--    La RPC catalog_search_products NO es SECURITY DEFINER (correcto),
--    por lo que el rol llamador necesita SELECT directo sobre las tablas.
--    Aditivo — no altera 007 ni otras migraciones.
-- ============================================================

GRANT SELECT ON public.catalog_products TO anon, authenticated;
GRANT SELECT ON public.catalog_categories TO anon, authenticated;
GRANT SELECT ON public.catalog_taxonomy TO anon, authenticated;
GRANT SELECT ON public.catalog_version TO anon, authenticated;

-- ============================================================
-- 8) Documentación
-- ============================================================

COMMENT ON FUNCTION public.catalog_search_products(text, integer) IS
  'Búsqueda híbrida de catálogo (full-text tsvector + trigramas pg_trgm). '
  'Retorna proyección CatalogCardProjection + score. '
  'Queries < 3 chars (post-trim) → 0 filas. Límite clampeado a 1..48. '
  'Ranking: ts_rank_cd * 0.7 + similarity * 0.3. '
  'Orden determinista: score DESC, sort_name ASC, product_id ASC. '
  'Ejecutable por anon/authenticated (lectura pública).';
