-- 010_catalog_search_description.sql
-- Paridad de búsqueda en descripción (Fase 5 — scalable-catalog-read-pipeline).
--
-- PROBLEMA: el camino legacy busca en name + description
-- (api/search-products.ts legacy: `p.name.includes(q) || p.description.includes(q)`),
-- pero el read model solo indexa `name` (search_text = lower(unaccent(name)) en 007,
-- search_vector = to_tsvector(search_text) en 008). Resultado: productos que solo
-- matchean por descripción no aparecen en el read model.
--
-- SOLUCIÓN (aditiva, no destructiva):
--   1) Columna `description` en catalog_products (espejo de products.description).
--   2) Redefinir catalog_products_trigger_fn() (007) y catalog_rebuild() (007+009)
--      para poblar `description` e incluirla en `search_text`.
--   3) Backfill: description desde products + search_text + search_vector
--      (el trigger trg_catalog_products_search_vector de 008 se dispara en el
--      UPDATE y reconstruye search_vector desde el nuevo search_text).
--
-- El search_vector (008) y la RPC catalog_search_products (008) NO cambian:
-- ambos consumen search_text, que ahora incluye description. La búsqueda
-- full-text (tsvector) y la trigram (pg_trgm) cubren description automáticamente.
--
-- Rollback: DROP COLUMN description + re-ejecutar 007/008/009 (o restaurar las
-- funciones previas). No altera migraciones 001–009.
--
-- Fecha: 2026-08-30
-- Autor: Implementer agent (Bibi Saint)

-- ============================================================
-- 1) Columna description en catalog_products
-- ============================================================
ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.catalog_products.description IS
  'Descripción del producto (espejo de products.description). Incluida en '
  'search_text/search_vector para paridad de búsqueda con el camino legacy '
  '(name + description).';

-- ============================================================
-- 2) Redefinir catalog_products_trigger_fn() (007) con description
--    Misma lógica que 007 + columna description + search_text con name + description.
--    SECURITY DEFINER: escribe en tablas con RLS de solo lectura pública.
-- ============================================================
CREATE OR REPLACE FUNCTION public.catalog_products_trigger_fn()
RETURNS trigger
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Soft-delete en read model + registrar en cola
    UPDATE public.catalog_products
    SET active = false, updated_at = now()
    WHERE product_id = OLD.id;

    INSERT INTO public.catalog_changes (product_id, change_type)
    VALUES (OLD.id, 'delete');
    RETURN OLD;

  ELSE
    -- INSERT o UPDATE: upsert de proyección individual O(1)
    INSERT INTO public.catalog_products (
      product_id, name, sort_name, numeric_price, image_url,
      en_oferta, original_price, category, subcategory, search_text,
      description, active, updated_at
    )
    VALUES (
      NEW.id,
      NEW.name,
      lower(NEW.name),
      public.catalog_parse_price(NEW.price),
      COALESCE(NEW.img->>0, ''),
      NEW.en_oferta,
      public.catalog_parse_price(NEW.original_price),
      -- --- Normalización categoría (replica getDisplayCategoryName) ---
      CASE
        WHEN (NEW.id LIKE 'mdt-%' OR NEW.img::text LIKE '%martinaditrento.com%')
             AND upper(trim(COALESCE(NEW.categories->>'name', ''))) IN ('MUJER', 'HOMBRE')
        THEN 'Ropa'
        ELSE initcap(lower(trim(COALESCE(NEW.categories->>'name', ''))))
      END,
      -- --- Normalización subcategoría (replica getDisplaySubcategories) ---
      CASE
        -- Martina con género: subcategorías prefijadas con género
        WHEN (NEW.id LIKE 'mdt-%' OR NEW.img::text LIKE '%martinaditrento.com%')
             AND upper(trim(COALESCE(NEW.categories->>'name', ''))) IN ('MUJER', 'HOMBRE')
        THEN
          CASE
            WHEN jsonb_array_length(COALESCE(NEW.categories->'subcategories', '[]'::jsonb)) = 0
            THEN upper(trim(NEW.categories->>'name'))  -- género como subcategoría
            ELSE
              (SELECT upper(trim(NEW.categories->>'name')) || ' - ' || initcap(lower(
                regexp_replace(sub->>'name', '^(Mujer|Hombre)\s*-\s*', '', 'i')
              ))
              FROM jsonb_array_elements(NEW.categories->'subcategories') AS sub
              LIMIT 1)
          END
        -- Tecno sin subcategorías: inferir del nombre del producto
        WHEN jsonb_array_length(COALESCE(NEW.categories->'subcategories', '[]'::jsonb)) = 0
             AND trim(COALESCE(NEW.categories->>'name', '')) ~* '(tecno|tecnologia|tecnología)'
        THEN
          CASE
            WHEN NEW.name ~* '(parlante|speaker|auricular|audio|mic|microfono|headset)'
              THEN 'Audio'
            WHEN NEW.name ~* '(cable|usb|tipo c|type c|hdmi|adaptador|conector|hub|cargador)'
              THEN 'Cables Y Conectividad'
            WHEN NEW.name ~* '(aro de luz|ring|lampara|led|luz)'
              THEN 'Iluminacion'
            WHEN NEW.name ~* '(camara|smart|domotica|sensor|wifi|enchufe inteligente)'
              THEN 'Smart Home'
            WHEN NEW.name ~* '(soporte|holder|base|tripode|trípode)'
              THEN 'Soportes'
            WHEN NEW.name ~* '(gadget|reloj|smartwatch|teclado|mouse|raton|ratón)'
              THEN 'Gadgets'
            ELSE 'Accesorios'
          END
        -- Caso normal: primera subcategoría del JSONB, TitleCase
        WHEN jsonb_array_length(COALESCE(NEW.categories->'subcategories', '[]'::jsonb)) > 0
        THEN initcap(lower(trim(NEW.categories->'subcategories'->0->>'name')))
        ELSE ''
      END,
      -- search_text: nombre + descripción normalizados para búsqueda (paridad legacy)
      lower(public.unaccent(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, ''))),
      COALESCE(NEW.description, ''),
      NEW.active,
      now()
    )
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
      description    = EXCLUDED.description,
      active         = EXCLUDED.active,
      updated_at     = EXCLUDED.updated_at;

    INSERT INTO public.catalog_changes (product_id, change_type)
    VALUES (NEW.id, 'upsert');
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3) Redefinir catalog_rebuild() (007 + 009) con description
--    Misma lógica que 009 (incluye ingested_at) + columna description +
--    search_text con name + description.
-- ============================================================
CREATE OR REPLACE FUNCTION public.catalog_rebuild()
RETURNS bigint AS $$
DECLARE
  new_version   bigint;
  max_change_id bigint;
BEGIN
  -- Capturar el ID máximo de cambios pendientes antes de reconstruir
  -- (para no marcar como procesados los que lleguen durante la reconstrucción)
  SELECT COALESCE(max(id), 0) INTO max_change_id
  FROM public.catalog_changes
  WHERE processed = false;

  -- 1) Reconstruir catalog_products con normalización Martina/Tecno + ingested_at + description
  INSERT INTO public.catalog_products (
    product_id, name, sort_name, numeric_price, image_url,
    en_oferta, original_price, category, subcategory, search_text,
    description, active, updated_at, ingested_at
  )
  SELECT
    p.id,
    p.name,
    lower(p.name),
    public.catalog_parse_price(p.price),
    COALESCE(p.img->>0, ''),
    p.en_oferta,
    public.catalog_parse_price(p.original_price),
    -- --- Normalización categoría (replica getDisplayCategoryName) ---
    CASE
      WHEN (p.id LIKE 'mdt-%' OR p.img::text LIKE '%martinaditrento.com%')
           AND upper(trim(COALESCE(p.categories->>'name', ''))) IN ('MUJER', 'HOMBRE')
      THEN 'Ropa'
      ELSE initcap(lower(trim(COALESCE(p.categories->>'name', ''))))
    END,
    -- --- Normalización subcategoría (replica getDisplaySubcategories) ---
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
    -- search_text: nombre + descripción normalizados para búsqueda (paridad legacy)
    lower(public.unaccent(COALESCE(p.name, '') || ' ' || COALESCE(p.description, ''))),
    COALESCE(p.description, ''),
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
    description    = EXCLUDED.description,
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

-- ============================================================
-- 4) Backfill de filas existentes
--    description desde products + search_text con name + description.
--    El trigger trg_catalog_products_search_vector (008) se dispara en el
--    UPDATE y reconstruye search_vector desde el nuevo search_text.
--    El trigger trg_catalog_products_ingested_at (009) conserva ingested_at
--    (COALESCE(NEW.ingested_at, now()) — no se resetea porque no va en el SET).
-- ============================================================
UPDATE public.catalog_products cp
SET description = COALESCE(p.description, ''),
    search_text = lower(public.unaccent(
      COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')
    ))
FROM public.products p
WHERE cp.product_id = p.id;

-- ============================================================
-- 5) Restricciones de ejecución (defensa en profundidad, consistente con 007/009)
--    CREATE OR REPLACE conserva los privilegios previos (REVOKE de 007/009),
--    pero se re-revoca explícitamente por idempotencia y claridad.
-- ============================================================
REVOKE ALL ON FUNCTION public.catalog_products_trigger_fn() FROM public;
REVOKE ALL ON FUNCTION public.catalog_rebuild() FROM public;

-- ============================================================
-- 6) Documentación
-- ============================================================
COMMENT ON FUNCTION public.catalog_products_trigger_fn() IS
  'Trigger de sync products → catalog_products (007) + description en search_text '
  '(010): paridad de búsqueda name + description con el camino legacy.';

COMMENT ON FUNCTION public.catalog_rebuild() IS
  'Reconstrucción idempotente del read model (007+009) + description en search_text '
  '(010): paridad de búsqueda name + description con el camino legacy.';