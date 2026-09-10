-- 015_catalog_products_sort_name.sql
-- Supports the public global catalog listing's stable name keyset order.
-- Partial to index only visible products, matching the active=true read path.

CREATE INDEX IF NOT EXISTS idx_catalog_products_active_sort_name_product_id
  ON public.catalog_products (sort_name, product_id)
  WHERE active = true;
