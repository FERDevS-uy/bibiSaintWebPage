-- Keep source writes on the trusted server path. RLS still governs client reads.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_related ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_diffs ENABLE ROW LEVEL SECURITY;

-- Clear every inherited/direct client privilege, then restore only catalog reads.
REVOKE ALL PRIVILEGES ON TABLE public.products FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.product_images FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.product_images TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_images TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.product_related FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.product_related TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_related TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.scraper_diffs FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.scraper_diffs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scraper_diffs TO service_role;

-- Remove legacy admin write policies: table mutation is server-only, including
-- for admin users. Existing public SELECT policies on catalog tables are kept.
DROP POLICY IF EXISTS "products_admin_all" ON public.products;
DROP POLICY IF EXISTS "product_images_admin_all" ON public.product_images;
DROP POLICY IF EXISTS "product_related_admin_all" ON public.product_related;
DROP POLICY IF EXISTS "scraper_diffs_admin_all" ON public.scraper_diffs;

-- CREATE OR REPLACE retains ACLs; make the RPC server-only explicitly.
REVOKE ALL ON FUNCTION public.catalog_rebuild() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_rebuild() TO service_role;
