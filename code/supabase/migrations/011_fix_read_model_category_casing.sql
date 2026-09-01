-- 011_fix_read_model_category_casing.sql
-- Canonicaliza la proyección del read model con la misma forma que
-- src/utils/categoryNormalization.ts.
--
-- El prefijo de género debe ser Title Case ("Hombre"/"Mujer"), no el valor
-- uppercase del JSON de proveedores. La función auxiliar se comparte entre
-- el trigger y catalog_rebuild() para evitar que ambas rutas vuelvan a divergir.

CREATE OR REPLACE FUNCTION public.catalog_normalize_category(
  categories jsonb,
  product_id text,
  image jsonb,
  product_name text
)
RETURNS TABLE(category text, subcategory text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  raw_category text := trim(COALESCE(categories->>'name', ''));
  normalized_gender text;
  has_subcategories boolean :=
    jsonb_typeof(COALESCE(categories->'subcategories', '[]'::jsonb)) = 'array'
    AND jsonb_array_length(COALESCE(categories->'subcategories', '[]'::jsonb)) > 0;
  first_subcategory text;
BEGIN
  normalized_gender := CASE upper(raw_category)
    WHEN 'MUJER' THEN 'Mujer'
    WHEN 'HOMBRE' THEN 'Hombre'
    ELSE NULL
  END;

  category := CASE
    WHEN (lower(COALESCE(product_id, '')) LIKE 'mdt-%'
          OR COALESCE(image, 'null'::jsonb)::text LIKE '%martinaditrento.com%')
         AND normalized_gender IS NOT NULL
      THEN 'Ropa'
    ELSE initcap(lower(raw_category))
  END;

  IF has_subcategories THEN
    SELECT sub->>'name' INTO first_subcategory
    FROM jsonb_array_elements(categories->'subcategories') AS sub
    LIMIT 1;
  END IF;

  IF (lower(COALESCE(product_id, '')) LIKE 'mdt-%'
      OR COALESCE(image, 'null'::jsonb)::text LIKE '%martinaditrento.com%')
     AND normalized_gender IS NOT NULL THEN
    IF NOT has_subcategories THEN
      subcategory := normalized_gender;
    ELSE
      subcategory := normalized_gender || ' - ' || initcap(lower(trim(
        regexp_replace(
          COALESCE(first_subcategory, ''),
          '^(Mujer|Hombre)\s*-\s*',
          '',
          'i'
        )
      )));
    END IF;
  ELSIF NOT has_subcategories
        AND raw_category ~* '(tecno|tecnologia|tecnología)' THEN
    subcategory := CASE
      WHEN product_name ~* '(parlante|speaker|auricular|audio|mic|microfono|headset)' THEN 'Audio'
      WHEN product_name ~* '(cable|usb|tipo c|type c|hdmi|adaptador|conector|hub|cargador)' THEN 'Cables Y Conectividad'
      WHEN product_name ~* '(aro de luz|ring|lampara|led|luz)' THEN 'Iluminacion'
      WHEN product_name ~* '(camara|smart|domotica|sensor|wifi|enchufe inteligente)' THEN 'Smart Home'
      WHEN product_name ~* '(soporte|holder|base|tripode|trípode)' THEN 'Soportes'
      WHEN product_name ~* '(gadget|reloj|smartwatch|teclado|mouse|raton|ratón)' THEN 'Gadgets'
      ELSE 'Accesorios'
    END;
  ELSIF has_subcategories THEN
    subcategory := initcap(lower(trim(COALESCE(first_subcategory, ''))));
  ELSE
    subcategory := '';
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_products_trigger_fn()
RETURNS trigger
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_category text;
  normalized_subcategory text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.catalog_products SET active = false, updated_at = now()
    WHERE product_id = OLD.id;
    INSERT INTO public.catalog_changes (product_id, change_type) VALUES (OLD.id, 'delete');
    RETURN OLD;
  END IF;

  SELECT n.category, n.subcategory INTO normalized_category, normalized_subcategory
  FROM public.catalog_normalize_category(NEW.categories, NEW.id, NEW.img, NEW.name) AS n;

  INSERT INTO public.catalog_products (
    product_id, name, sort_name, numeric_price, image_url, en_oferta,
    original_price, category, subcategory, search_text, description, active,
    updated_at
  ) VALUES (
    NEW.id, NEW.name, lower(NEW.name), public.catalog_parse_price(NEW.price),
    COALESCE(NEW.img->>0, ''), NEW.en_oferta,
    public.catalog_parse_price(NEW.original_price), normalized_category,
    normalized_subcategory,
    lower(public.unaccent(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, ''))),
    COALESCE(NEW.description, ''), NEW.active, now()
  )
  ON CONFLICT (product_id) DO UPDATE SET
    name = EXCLUDED.name, sort_name = EXCLUDED.sort_name,
    numeric_price = EXCLUDED.numeric_price, image_url = EXCLUDED.image_url,
    en_oferta = EXCLUDED.en_oferta, original_price = EXCLUDED.original_price,
    category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
    search_text = EXCLUDED.search_text, description = EXCLUDED.description,
    active = EXCLUDED.active, updated_at = EXCLUDED.updated_at;

  INSERT INTO public.catalog_changes (product_id, change_type) VALUES (NEW.id, 'upsert');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.catalog_rebuild()
RETURNS bigint
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_version bigint;
  max_change_id bigint;
BEGIN
  SELECT COALESCE(max(id), 0) INTO max_change_id
  FROM public.catalog_changes WHERE processed = false;

  INSERT INTO public.catalog_products (
    product_id, name, sort_name, numeric_price, image_url, en_oferta,
    original_price, category, subcategory, search_text, description, active,
    updated_at, ingested_at
  )
  SELECT p.id, p.name, lower(p.name), public.catalog_parse_price(p.price),
    COALESCE(p.img->>0, ''), p.en_oferta, public.catalog_parse_price(p.original_price),
    n.category, n.subcategory,
    lower(public.unaccent(COALESCE(p.name, '') || ' ' || COALESCE(p.description, ''))),
    COALESCE(p.description, ''), p.active, now(),
    COALESCE(p.created_at, p.updated_at, now())
  FROM public.products p
  CROSS JOIN LATERAL public.catalog_normalize_category(p.categories, p.id, p.img, p.name) AS n
  ON CONFLICT (product_id) DO UPDATE SET
    name = EXCLUDED.name, sort_name = EXCLUDED.sort_name,
    numeric_price = EXCLUDED.numeric_price, image_url = EXCLUDED.image_url,
    en_oferta = EXCLUDED.en_oferta, original_price = EXCLUDED.original_price,
    category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
    search_text = EXCLUDED.search_text, description = EXCLUDED.description,
    active = EXCLUDED.active, updated_at = EXCLUDED.updated_at,
    ingested_at = EXCLUDED.ingested_at;

  UPDATE public.catalog_products cp SET active = false, updated_at = now()
  WHERE cp.active = true AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = cp.product_id AND p.active = true
  );

  DELETE FROM public.catalog_categories;
  INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
  SELECT category, '', count(*)::integer FROM public.catalog_products
  WHERE active = true GROUP BY category;
  INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
  SELECT category, subcategory, count(*)::integer FROM public.catalog_products
  WHERE active = true AND subcategory <> '' GROUP BY category, subcategory;
  INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
  SELECT tx.category_name, COALESCE(tx.subcategory_name, ''), 0
  FROM public.catalog_taxonomy tx WHERE tx.visible = true
  ON CONFLICT (category_name, subcategory_name) DO NOTHING;

  UPDATE public.catalog_version SET version = version + 1, published_at = now()
  WHERE id = 1 RETURNING version INTO new_version;

  IF max_change_id > 0 THEN
    UPDATE public.catalog_changes SET processed = true
    WHERE id <= max_change_id AND processed = false;
  END IF;
  RETURN new_version;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_catalog_products_sync ON public.products;
CREATE TRIGGER trg_catalog_products_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.catalog_products_trigger_fn();

-- Reproyección canónica e idempotente: además de reparar filas, publica una
-- versión nueva mediante el contrato existente de catalog_rebuild().
SELECT public.catalog_rebuild();

REVOKE ALL ON FUNCTION public.catalog_normalize_category(jsonb, text, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.catalog_products_trigger_fn() FROM public;
REVOKE ALL ON FUNCTION public.catalog_rebuild() FROM public;
