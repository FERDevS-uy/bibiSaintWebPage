-- 009_catalog_ingested_at.sql
-- Novedades con ingested_at: timestamp de ingestión real para el orden "recientes".
-- Change: scalable-catalog-read-pipeline — Fase 2 (P0).
--
-- SEMÁNTICA (fix de regresión, no cambio silencioso):
--   La semántica original de "Novedades" es "productos realmente recientes/nuevos".
--   El orden legacy previo (reverse() sobre lista ordenada alfabéticamente) era una
--   REGRESIÓN FUNCIONAL: mostraba reverse-alfabético, no recencia real.
--   Esta migración materializa `ingested_at` = created_at real (fallback updated_at)
--   para que el read model ordene "recientes" por recencia real.
--
-- Aditiva, no destructiva. Rollback = DROP COLUMN ingested_at (y DROP del trigger).

-- ============================================================
-- 1) Columna ingested_at
-- ============================================================
ALTER TABLE public.catalog_products ADD COLUMN IF NOT EXISTS ingested_at timestamptz;

COMMENT ON COLUMN public.catalog_products.ingested_at IS
  'Timestamp de ingestión real del producto (created_at del source, fallback updated_at). '
  'Ordena "recientes" por recencia real, no por orden alfabético.';

-- ============================================================
-- 2) Índice para orden "recientes" (ingested_at DESC, desempate product_id)
--    Parcial WHERE active = true (solo productos visibles).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_catalog_products_ingested_at
  ON public.catalog_products (ingested_at DESC, product_id)
  WHERE active = true;

-- ============================================================
-- 3) Trigger: ingested_at = COALESCE(NEW.ingested_at, now())
--    BEFORE INSERT OR UPDATE: si el writer no provee ingested_at, usa now().
--    catalog_rebuild() provee ingested_at = created_at real (sección 5), por lo
--    que el trigger conserva la recencia real y no la resetea a now().
-- ============================================================
CREATE OR REPLACE FUNCTION public.catalog_products_ingested_at_fn()
RETURNS trigger AS $$
BEGIN
  NEW.ingested_at := COALESCE(NEW.ingested_at, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_catalog_products_ingested_at ON public.catalog_products;
CREATE TRIGGER trg_catalog_products_ingested_at
  BEFORE INSERT OR UPDATE ON public.catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.catalog_products_ingested_at_fn();

-- ============================================================
-- 4) Backfill determinista de filas existentes
--    ingested_at = COALESCE(products.created_at, products.updated_at, now())
--    (recencia real; updated_at como fallback para filas sin created_at).
-- ============================================================
UPDATE public.catalog_products cp
SET ingested_at = COALESCE(
  (SELECT p.created_at FROM public.products p WHERE p.id = cp.product_id),
  cp.updated_at,
  now()
)
WHERE cp.ingested_at IS NULL;

-- ============================================================
-- 5) Redefinir catalog_rebuild() para materializar ingested_at real
--    (misma lógica que 007 + ingested_at = COALESCE(p.created_at, p.updated_at, now())).
--    Necesario: sin esto, el trigger (sección 3) setearía ingested_at = now()
--    en cada reconstrucción, perdiendo la recencia real.
-- ============================================================
CREATE OR REPLACE FUNCTION public.catalog_rebuild()
RETURNS bigint AS $$
DECLARE
  new_version   bigint;
  max_change_id bigint;
BEGIN
  SELECT COALESCE(max(id), 0) INTO max_change_id
  FROM public.catalog_changes
  WHERE processed = false;

  -- 1) Reconstruir catalog_products con normalización Martina/Tecno + ingested_at real
  INSERT INTO public.catalog_products (
    product_id, name, sort_name, numeric_price, image_url,
    en_oferta, original_price, category, subcategory, search_text, active, updated_at, ingested_at
  )
  SELECT
    p.id,
    p.name,
    lower(p.name),
    public.catalog_parse_price(p.price),
    COALESCE(p.img->>0, ''),
    p.en_oferta,
    public.catalog_parse_price(p.original_price),
    CASE
      WHEN (p.id LIKE 'mdt-%' OR p.img::text LIKE '%martinaditrento.com%')
           AND upper(trim(COALESCE(p.categories->>'name', ''))) IN ('MUJER', 'HOMBRE')
      THEN 'Ropa'
      ELSE initcap(lower(trim(COALESCE(p.categories->>'name', ''))))
    END,
    CASE
      WHEN (p.id LIKE 'mdt-%' OR p.img::text LIKE '%martinaditrento.com%')
           AND upper(trim(COALESCE(p.categories->>'name', ''))) IN ('MUJER', 'HOMBRE')
      THEN
        CASE
          WHEN jsonb_array_length(COALESCE(p.categories->'subcategories', '[]'::jsonb)) = 0
          THEN upper(trim(p.categories->>'name'))
          ELSE
            (SELECT upper(trim(p.categories->>'name')) || ' - ' || initcap(lower(
              regexp_replace(sub->>'name', '^(Mujer|Hombre)\s*-\s*', '', 'i')
            ))
            FROM jsonb_array_elements(p.categories->'subcategories') AS sub
            LIMIT 1)
        END
      WHEN jsonb_array_length(COALESCE(p.categories->'subcategories', '[]'::jsonb)) = 0
           AND trim(COALESCE(p.categories->>'name', '')) ~* '(tecno|tecnologia|tecnología)'
      THEN
        CASE
          WHEN p.name ~* '(parlante|speaker|auricular|audio|mic|microfono|headset)'
            THEN 'Audio'
          WHEN p.name ~* '(cable|usb|tipo c|type c|hdmi|adaptador|conector|hub|cargador)'
            THEN 'Cables Y Conectividad'
          WHEN p.name ~* '(aro de luz|ring|lampara|led|luz)'
            THEN 'Iluminacion'
          WHEN p.name ~* '(camara|smart|domotica|sensor|wifi|enchufe inteligente)'
            THEN 'Smart Home'
          WHEN p.name ~* '(soporte|holder|base|tripode|trípode)'
            THEN 'Soportes'
          WHEN p.name ~* '(gadget|reloj|smartwatch|teclado|mouse|raton|ratón)'
            THEN 'Gadgets'
          ELSE 'Accesorios'
        END
      WHEN jsonb_array_length(COALESCE(p.categories->'subcategories', '[]'::jsonb)) > 0
      THEN initcap(lower(trim(p.categories->'subcategories'->0->>'name')))
      ELSE ''
    END,
    lower(public.unaccent(COALESCE(p.name, ''))),
    p.active,
    now(),
    COALESCE(p.created_at, p.updated_at, now())
  FROM public.products p
  ON CONFLICT (product_id) DO UPDATE SET
    name           = EXCLUDED.name,
    sort_name      = EXCLUDED.sort_name,
    numeric_price  = EXCLUDED.numeric_price,
    image_url      = EXCLUDED.image_url,
    en_oferta      = EXCLUDED.en_oferta,
    original_price = EXCLUDED.original_price,
    category       = EXCLUDED.category,
    subcategory    = EXCLUDED.subcategory,
    search_text    = EXCLUDED.search_text,
    active         = EXCLUDED.active,
    updated_at     = EXCLUDED.updated_at,
    ingested_at    = EXCLUDED.ingested_at;

  -- 2) Marcar inactivos productos que ya no están en products o están desactivados
  UPDATE public.catalog_products cp
  SET active = false, updated_at = now()
  WHERE cp.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = cp.product_id AND p.active = true
    );

  -- 3) Reconstruir catalog_categories (conteos por categoría y subcategoría)
  DELETE FROM public.catalog_categories;

  INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
  SELECT category, '' AS subcategory_name, count(*)::integer
  FROM public.catalog_products
  WHERE active = true
  GROUP BY category;

  INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
  SELECT category, subcategory, count(*)::integer
  FROM public.catalog_products
  WHERE active = true AND subcategory <> ''
  GROUP BY category, subcategory;

  -- 4) Incluir categorías de taxonomía visible con conteo cero
  INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
  SELECT tx.category_name, COALESCE(tx.subcategory_name, ''), 0
  FROM public.catalog_taxonomy tx
  WHERE tx.visible = true
  ON CONFLICT (category_name, subcategory_name) DO NOTHING;

  -- 5) Publicar nueva versión atómicamente
  UPDATE public.catalog_version
  SET version = version + 1, published_at = now()
  WHERE id = 1
  RETURNING version INTO new_version;

  -- 6) Marcar como procesados solo los cambios capturados antes de la reconstrucción
  IF max_change_id > 0 THEN
    UPDATE public.catalog_changes
    SET processed = true
    WHERE id <= max_change_id AND processed = false;
  END IF;

  RETURN new_version;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.catalog_rebuild() FROM public;
