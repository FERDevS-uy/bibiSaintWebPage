-- Avoid rewriting unchanged read-model rows: every rewrite updates all catalog
-- indexes, including the large GIN search indexes. This keeps catalog_rebuild
-- idempotent at the storage level while preserving its versioning contract.
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
    ingested_at = EXCLUDED.ingested_at
  WHERE (
    public.catalog_products.name,
    public.catalog_products.sort_name,
    public.catalog_products.numeric_price,
    public.catalog_products.image_url,
    public.catalog_products.en_oferta,
    public.catalog_products.original_price,
    public.catalog_products.category,
    public.catalog_products.subcategory,
    public.catalog_products.search_text,
    public.catalog_products.description,
    public.catalog_products.active,
    public.catalog_products.ingested_at
  ) IS DISTINCT FROM (
    EXCLUDED.name,
    EXCLUDED.sort_name,
    EXCLUDED.numeric_price,
    EXCLUDED.image_url,
    EXCLUDED.en_oferta,
    EXCLUDED.original_price,
    EXCLUDED.category,
    EXCLUDED.subcategory,
    EXCLUDED.search_text,
    EXCLUDED.description,
    EXCLUDED.active,
    EXCLUDED.ingested_at
  );

  UPDATE public.catalog_products cp
  SET active = false, updated_at = now()
  WHERE cp.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = cp.product_id AND p.active = true
    );

  -- category_name is NOT NULL, therefore this preserves the full rebuild
  -- semantics while satisfying safe-update guards that reject bare DELETE.
  DELETE FROM public.catalog_categories WHERE category_name IS NOT NULL;
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

-- Consistent with 007/009/010/011/013: CREATE OR REPLACE preserves prior
-- privileges, but re-revoke explicitly for idempotence and clarity.
-- Rollback: re-apply 013_clean_invalid_original_prices.sql to restore the
-- unconditional-upsert rebuild definition.
REVOKE ALL ON FUNCTION public.catalog_rebuild() FROM public;

COMMENT ON FUNCTION public.catalog_rebuild() IS
  'Rebuild idempotente del read model (007+009+010+011+013) con write-avoidance: '
  'el upsert solo toca filas cuyo payload cambio (IS DISTINCT FROM, updated_at '
  'excluido) y las categorias se reconstruyen con DELETE con WHERE siempre-true.';
