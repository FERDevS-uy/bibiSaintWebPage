-- 007_catalog_read_model.sql
-- Read model del pipeline de lectura escalable de catálogo.
-- Change: scalable-catalog-read-pipeline — Grupo 2 (tareas 2.1–2.6).
--
-- Idempotente y aditiva: NO altera tablas existentes (products, product_images,
-- product_related, scraper_diffs, admin_profiles, preview_tokens).
-- Solo CREATE de objetos nuevos. Seguro de re-ejecutar.
--
-- Ejecutar desde el SQL Editor de Supabase o vía `supabase db push`.
-- Fecha: 2026-08-29
-- Autor: DBA agent (Bibi Saint)

-- ============================================================
-- 0) Extensión: unaccent (normalización de texto para búsqueda)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ============================================================
-- 1) Función auxiliar: parseo de precio text → numeric
--    Maneja formatos: "$ 1.234,56" (sudamericano), "1250", "$ 1.250", "1234,56".
--    Retorna 0 ante entrada nula, vacía o inválida.
-- ============================================================

CREATE OR REPLACE FUNCTION public.catalog_parse_price(raw text)
RETURNS numeric AS $$
DECLARE
  cleaned text;
BEGIN
  IF raw IS NULL OR trim(raw) = '' THEN
    RETURN 0;
  END IF;
  cleaned := trim(raw);

  -- Formato sudamericano con miles y decimal: 1.234,56 / 12.345,67
  IF cleaned ~ '\d+\.\d{3}.*,.*' THEN
    cleaned := replace(replace(cleaned, '.', ''), ',', '.');
  -- Coma como separador decimal simple: 1234,56
  ELSIF cleaned ~ ',' THEN
    cleaned := replace(cleaned, ',', '.');
  END IF;

  -- Conservar solo dígitos y puntos
  cleaned := regexp_replace(cleaned, '[^0-9.]', '', 'g');

  -- Heurística: si quedó "N.NNN" (1-3 dígitos, punto, exactamente 3 dígitos)
  -- sin más puntos, el punto era separador de miles → eliminarlo.
  IF cleaned ~ '^\d{1,3}\.\d{3}$' THEN
    cleaned := replace(cleaned, '.', '');
  END IF;

  RETURN COALESCE(cleaned::numeric, 0);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 2) catalog_products — proyección de lectura normalizada
--    Replica la normalización de categoryNormalization.ts:
--      - Martina + género → categoría "Ropa", subcategorías prefijadas
--      - Tecno sin subcategorías → inferencia por regex del nombre
--      - Resto → TitleCase de categorías JSONB
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_products (
  product_id     text PRIMARY KEY,
  name           text NOT NULL,
  sort_name      text NOT NULL,             -- lower(name) para orden estable
  numeric_price  numeric NOT NULL DEFAULT 0,
  image_url      text NOT NULL DEFAULT '',
  en_oferta      boolean NOT NULL DEFAULT false,
  original_price numeric,                   -- reservado para futura columna source
  category       text NOT NULL DEFAULT '',   -- display category (normalizado)
  subcategory    text NOT NULL DEFAULT '',   -- display subcategory (normalizado)
  search_text    text NOT NULL DEFAULT '',   -- texto normalizado (lower+unaccent) para búsqueda (task 3.4)
  active         boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_products IS
  'Proyección de lectura normalizada de products. Normalización Martina/Tecno materializada. '
  'Writes solo via service role, función de reconstrucción o trigger en products.';

-- ============================================================
-- 3) catalog_categories — conteos agregados por categoría/subcategoría
--    PK compuesta: (category_name, subcategory_name).
--    subcategory_name = '' representa el nivel categoría (agregado total).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_categories (
  category_name    text NOT NULL,
  subcategory_name text NOT NULL DEFAULT '',
  product_count    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (category_name, subcategory_name)
);

COMMENT ON TABLE public.catalog_categories IS
  'Conteos precalculados de productos activos por categoría y subcategoría display. '
  'Se reconstruye por lote desde catalog_products. Incluye categorías de taxonomía con conteo cero.';

-- ============================================================
-- 4) catalog_taxonomy — taxonomía visible configurable
--    Define qué categorías/subcategorías muestra la UI, incluyendo
--    categorías con conteo cero (ej: subcategorías Tecno sin productos).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_taxonomy (
  id               smallserial PRIMARY KEY,
  category_name    text NOT NULL,
  subcategory_name text,                      -- NULL = entrada a nivel categoría
  display_order    integer NOT NULL DEFAULT 0,
  visible          boolean NOT NULL DEFAULT true
);

-- Índice único funcional: reemplaza la restricción UNIQUE que no admite expresiones
CREATE UNIQUE INDEX IF NOT EXISTS udx_catalog_taxonomy_category_subcategory
  ON public.catalog_taxonomy (category_name, COALESCE(subcategory_name, ''));

COMMENT ON TABLE public.catalog_taxonomy IS
  'Taxonomía visible de categorías y subcategorías. Fuente de verdad para orden, '
  'visibilidad y categorías con conteo cero. No se deriva únicamente de productos existentes.';

-- ============================================================
-- 5) catalog_changes — cola de cambios pendientes
--    El trigger en products inserta filas; el proceso asíncrono
--    las lee, reconstruye agregados y las marca procesadas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_changes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  text NOT NULL,
  change_type text NOT NULL DEFAULT 'upsert'
                CHECK (change_type IN ('upsert', 'deactivate', 'delete')),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  processed   boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.catalog_changes IS
  'Cola de cambios individuales desde trigger en products. '
  'El proceso asíncrono por lote lee, reconstruye agregados y marca procesados.';

-- Índice parcial para cola pendiente (solo filas no procesadas, ordenadas por id)
CREATE INDEX IF NOT EXISTS idx_catalog_changes_pending
  ON public.catalog_changes (id)
  WHERE processed = false;

-- ============================================================
-- 6) catalog_version — versión atómica del catálogo (singleton)
--    Se incrementa en cada reconstrucción completa. Los cursores
--    opacos incluyen esta versión para invalidación.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_version (
  id           int PRIMARY KEY CHECK (id = 1),
  version      bigint NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_version IS
  'Versión lógica del catálogo (singleton). Se incrementa atómicamente en cada '
  'reconstrucción completa. Los cursores opacos incluyen esta versión para invalidación.';

-- Fila inicial (singleton)
INSERT INTO public.catalog_version (id, version, published_at)
VALUES (1, 0, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7) Índices parciales compuestos (task 2.2)
--    Todos parciales WHERE active = true (solo productos visibles).
--    Column order: igualdad primero, orden/range después, desempate al final.
-- ============================================================

-- Listado por categoría/subcategoría con orden alfabético + desempate por product_id
CREATE INDEX IF NOT EXISTS idx_catalog_products_category_sort
  ON public.catalog_products (category, subcategory, sort_name, product_id)
  WHERE active = true;

-- Ofertas/precio: orden por precio numérico + desempate
CREATE INDEX IF NOT EXISTS idx_catalog_products_price_sort
  ON public.catalog_products (numeric_price, sort_name, product_id)
  WHERE active = true;

-- Ofertas activas: filtrar en_oferta=true con orden por precio
CREATE INDEX IF NOT EXISTS idx_catalog_products_oferta_price
  ON public.catalog_products (en_oferta, numeric_price, sort_name, product_id)
  WHERE active = true AND en_oferta = true;

-- ============================================================
-- 8) Seed taxonomía Tecno (task 2.5)
--    Orden: Accesorios, Audio, Iluminacion, Smart Home,
--           Cables Y Conectividad, Gadgets, Soportes.
--    visible=true, count 0 permitido (se agrega en catalog_categories
--    durante la reconstrucción si no hay productos).
-- ============================================================

INSERT INTO public.catalog_taxonomy (category_name, subcategory_name, display_order, visible)
VALUES
  ('Tecno', NULL,                      0, true),
  ('Tecno', 'Accesorios',             1, true),
  ('Tecno', 'Audio',                  2, true),
  ('Tecno', 'Iluminacion',            3, true),
  ('Tecno', 'Smart Home',             4, true),
  ('Tecno', 'Cables Y Conectividad',  5, true),
  ('Tecno', 'Gadgets',                6, true),
  ('Tecno', 'Soportes',               7, true)
ON CONFLICT (category_name, (COALESCE(subcategory_name, ''))) DO NOTHING;

-- ============================================================
-- 9) Trigger en products (task 2.6)
--    Liviano: O(1) por fila. Upsert de la proyección individual
--    + registro en cola de cambios. Agregados, búsqueda y versión
--    quedan al proceso asíncrono por lote (catalog_rebuild).
--
--    SECURITY DEFINER: el trigger escribe en tablas con RLS que
--    solo permiten SELECT público. Necesita correr como postgres
--    para poder INSERT/UPDATE en catalog_products y catalog_changes.
--
--    NOTA: la lógica de normalización (CASE category/subcategory)
--    debe mantenerse en sincronía con catalog_rebuild() (sección 10).
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
      en_oferta, original_price, category, subcategory, search_text, active, updated_at
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
      -- search_text: nombre normalizado para búsqueda (task 3.4)
      lower(public.unaccent(COALESCE(NEW.name, ''))),
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
      active         = EXCLUDED.active,
      updated_at     = EXCLUDED.updated_at;

    INSERT INTO public.catalog_changes (product_id, change_type)
    VALUES (NEW.id, 'upsert');
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_catalog_products_sync ON public.products;
CREATE TRIGGER trg_catalog_products_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.catalog_products_trigger_fn();

-- ============================================================
-- 10) Función de reconstrucción idempotente (task 2.3)
--     Normalización Martina/Tecno materializada + agregados +
--     publicación atómica de versión.
--
--     Idempotente: INSERT ... ON CONFLICT DO UPDATE para productos;
--     DELETE + INSERT para categorías (atómico en la transacción);
--     ON CONFLICT DO NOTHING para taxonomía con conteo cero.
--
--     Retorna la nueva versión del catálogo.
--
--     NOTA: la lógica de normalización (CASE category/subcategory)
--     debe mantenerse en sincronía con el trigger (sección 9).
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

  -- 1) Reconstruir catalog_products con normalización Martina/Tecno
  INSERT INTO public.catalog_products (
    product_id, name, sort_name, numeric_price, image_url,
    en_oferta, original_price, category, subcategory, search_text, active, updated_at
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
    lower(public.unaccent(COALESCE(p.name, ''))),
    p.active,
    now()
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
    updated_at     = EXCLUDED.updated_at;

  -- 2) Marcar inactivos productos que ya no están en products o están desactivados
  UPDATE public.catalog_products cp
  SET active = false, updated_at = now()
  WHERE cp.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = cp.product_id AND p.active = true
    );

  -- 3) Reconstruir catalog_categories (conteos por categoría y subcategoría)
  --    DELETE + INSERT es atómico dentro de la transacción (otras sesiones
  --    ven el estado anterior hasta el commit).
  DELETE FROM public.catalog_categories;

  -- Conteos a nivel categoría
  INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
  SELECT category, '' AS subcategory_name, count(*)::integer
  FROM public.catalog_products
  WHERE active = true
  GROUP BY category;

  -- Conteos por (categoría, subcategoría)
  INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
  SELECT category, subcategory, count(*)::integer
  FROM public.catalog_products
  WHERE active = true AND subcategory <> ''
  GROUP BY category, subcategory;

  -- 4) Incluir categorías de taxonomía visible con conteo cero
  --    (garantiza que subcategorías Tecno aparezcan aunque no tengan productos)
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
-- 11) RLS — solo lectura pública (task 2.1)
--     Tablas del read model: SELECT público (anon + authenticated).
--     Writes: solo service_role (reconstrucción, trigger SECURITY DEFINER).
--     catalog_changes: solo service_role (no lectura pública).
-- ============================================================

-- Habilitar RLS en todas las tablas nuevas
ALTER TABLE public.catalog_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_taxonomy  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_changes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_version   ENABLE ROW LEVEL SECURITY;

-- catalog_products: SELECT público solo activos
DROP POLICY IF EXISTS "catalog_products_select_public" ON public.catalog_products;
CREATE POLICY "catalog_products_select_public"
  ON public.catalog_products FOR SELECT
  USING (active = true);

-- catalog_categories: SELECT público total
DROP POLICY IF EXISTS "catalog_categories_select_public" ON public.catalog_categories;
CREATE POLICY "catalog_categories_select_public"
  ON public.catalog_categories FOR SELECT
  USING (true);

-- catalog_taxonomy: SELECT público total
DROP POLICY IF EXISTS "catalog_taxonomy_select_public" ON public.catalog_taxonomy;
CREATE POLICY "catalog_taxonomy_select_public"
  ON public.catalog_taxonomy FOR SELECT
  USING (true);

-- catalog_version: SELECT público, writes solo service_role
DROP POLICY IF EXISTS "catalog_version_select_public" ON public.catalog_version;
CREATE POLICY "catalog_version_select_public"
  ON public.catalog_version FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "catalog_version_service_role_write" ON public.catalog_version;
CREATE POLICY "catalog_version_service_role_write"
  ON public.catalog_version FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- catalog_changes: solo service_role (no exposición pública)
DROP POLICY IF EXISTS "catalog_changes_service_role_all" ON public.catalog_changes;
CREATE POLICY "catalog_changes_service_role_all"
  ON public.catalog_changes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 12) Restricciones de ejecución (seguridad defensiva)
--     Revocar EXECUTE público en funciones internas del trigger
--     para evitar escalada de privilegios por llamada directa.
-- ============================================================

REVOKE ALL ON FUNCTION public.catalog_products_trigger_fn() FROM public;
REVOKE ALL ON FUNCTION public.catalog_rebuild() FROM public;
