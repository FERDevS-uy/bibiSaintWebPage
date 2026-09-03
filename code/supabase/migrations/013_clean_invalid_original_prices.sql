-- 013_clean_invalid_original_prices.sql
-- Conservatively remove invalid crossed-out prices.
--
-- Offer presentation is valid only when both prices are numeric/finite, the
-- current price is > 0, and original_price > price. `catalog_parse_price()` is
-- used instead of direct casts so textual garbage is tolerated safely.

CREATE OR REPLACE FUNCTION public.catalog_valid_original_price(raw_original text, raw_price text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw_original IS NULL OR trim(raw_original) = '' THEN NULL
    WHEN public.catalog_parse_price(raw_price) <= 0 THEN NULL
    WHEN public.catalog_parse_price(raw_original) <= public.catalog_parse_price(raw_price) THEN NULL
    ELSE public.catalog_parse_price(raw_original)
  END;
$$;

DO $$
DECLARE
  changed_products bigint := 0;
  changed_catalog_products bigint := 0;
  max_change_id bigint := 0;
BEGIN
  WITH cleaned AS (
    UPDATE public.products
    SET
      original_price = NULL,
      en_oferta = false
    WHERE
      (
        en_oferta = true
        AND (
          original_price IS NULL
          OR trim(original_price) = ''
          OR public.catalog_valid_original_price(original_price, price) IS NULL
        )
      )
      OR (
        original_price IS NOT NULL
        AND (
          trim(original_price) = ''
          OR public.catalog_valid_original_price(original_price, price) IS NULL
        )
      )
      AND (original_price IS DISTINCT FROM NULL OR en_oferta IS DISTINCT FROM false)
    RETURNING 1
  )
  SELECT count(*) INTO changed_products FROM cleaned;

  -- Keep the read model coherent without calling catalog_rebuild(), because the
  -- existing rebuild contract always publishes a new catalog_version. The row
  -- trigger above normally updates touched products; this targeted pass also
  -- repairs any stale projection rows while remaining a no-op on rerun.
  WITH cleaned_catalog AS (
    UPDATE public.catalog_products cp
    SET
      original_price = NULL,
      en_oferta = false,
      updated_at = now()
    FROM public.products p
    WHERE
      cp.product_id = p.id
      AND public.catalog_valid_original_price(p.original_price, p.price) IS NULL
      AND (cp.original_price IS DISTINCT FROM NULL OR cp.en_oferta IS DISTINCT FROM false)
    RETURNING 1
  )
  SELECT count(*) INTO changed_catalog_products FROM cleaned_catalog;

  IF changed_products > 0 OR changed_catalog_products > 0 THEN
    SELECT COALESCE(max(id), 0) INTO max_change_id
    FROM public.catalog_changes
    WHERE processed = false;

    UPDATE public.catalog_version
    SET version = version + 1, published_at = now()
    WHERE id = 1;

    IF max_change_id > 0 THEN
      UPDATE public.catalog_changes
      SET processed = true
      WHERE id <= max_change_id AND processed = false;
    END IF;
  END IF;
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
  valid_original_price numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.catalog_products SET active = false, updated_at = now()
    WHERE product_id = OLD.id;
    INSERT INTO public.catalog_changes (product_id, change_type) VALUES (OLD.id, 'delete');
    RETURN OLD;
  END IF;

  SELECT n.category, n.subcategory INTO normalized_category, normalized_subcategory
  FROM public.catalog_normalize_category(NEW.categories, NEW.id, NEW.img, NEW.name) AS n;

  valid_original_price := public.catalog_valid_original_price(NEW.original_price, NEW.price);

  INSERT INTO public.catalog_products (
    product_id, name, sort_name, numeric_price, image_url, en_oferta,
    original_price, category, subcategory, search_text, description, active,
    updated_at
  ) VALUES (
    NEW.id, NEW.name, lower(NEW.name), public.catalog_parse_price(NEW.price),
    COALESCE(NEW.img->>0, ''), (NEW.en_oferta AND valid_original_price IS NOT NULL),
    valid_original_price, normalized_category,
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
    COALESCE(p.img->>0, ''),
    (p.en_oferta AND public.catalog_valid_original_price(p.original_price, p.price) IS NOT NULL),
    public.catalog_valid_original_price(p.original_price, p.price),
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

-- Do not call catalog_rebuild() here: that contract republishes catalog_version
-- unconditionally. The cleanup block above only publishes when product or read
-- model rows actually changed, so rerunning this migration is state-idempotent.

REVOKE ALL ON FUNCTION public.catalog_valid_original_price(text, text) FROM public;
REVOKE ALL ON FUNCTION public.catalog_products_trigger_fn() FROM public;
REVOKE ALL ON FUNCTION public.catalog_rebuild() FROM public;
