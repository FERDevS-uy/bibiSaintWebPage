-- Add Guillerminas as an available Zapatos Cerrados subcategory.
INSERT INTO public.catalog_taxonomy (category_name, subcategory_name, display_order, visible)
VALUES ('Calzado', 'Zapatos Cerrados - Guillerminas', 45, true)
ON CONFLICT (category_name, (COALESCE(subcategory_name, ''))) DO UPDATE
SET display_order = EXCLUDED.display_order,
    visible = EXCLUDED.visible;
