-- Organiza Calzado con grupos visibles y elimina el markup por defecto de Kai Deco.
-- El menú representa el segundo nivel mediante etiquetas "Grupo - Hoja".

ALTER TABLE public.provider_catalog_settings
  ADD COLUMN IF NOT EXISTS markup numeric(5,3);

COMMENT ON COLUMN public.provider_catalog_settings.markup IS
  'Profit markup multiplier per provider (e.g. 1.22 = +22%). NULL falls back to the code default.';

INSERT INTO public.provider_catalog_settings (provider_key, enabled, markup)
VALUES ('kaideco', true, 1.000)
ON CONFLICT (provider_key) DO UPDATE
SET markup = EXCLUDED.markup,
    updated_at = now();

-- Taxonomía completa, incluso cuando una hoja todavía no tenga productos.
INSERT INTO public.catalog_taxonomy (category_name, subcategory_name, display_order, visible)
VALUES
  ('Calzado', NULL, 0, true),
  ('Calzado', 'Botas - Botas Altas', 10, true),
  ('Calzado', 'Botas - Botas Cortas', 11, true),
  ('Calzado', 'Botas - Botas Urbanas', 12, true),
  ('Calzado', 'Botas - Bucaneras', 13, true),
  ('Calzado', 'Botas - Texanas', 14, true),
  ('Calzado', 'Botines - Botines Clásicos', 20, true),
  ('Calzado', 'Botines - Botines Urbanos', 21, true),
  ('Calzado', 'Botines - Botines Con Taco', 22, true),
  ('Calzado', 'Botines - Botines Chelsea', 23, true),
  ('Calzado', 'Botines - Borcegos', 24, true),
  ('Calzado', 'Suecos - Suecos Clásicos', 30, true),
  ('Calzado', 'Suecos - Suecos Con Taco', 31, true),
  ('Calzado', 'Suecos - Suecos Con Hebilla', 32, true),
  ('Calzado', 'Zapatos Cerrados - Zapatos Clásicos', 40, true),
  ('Calzado', 'Zapatos Cerrados - Zapatos Acordonados', 41, true),
  ('Calzado', 'Zapatos Cerrados - Mocasines', 42, true),
  ('Calzado', 'Zapatos Cerrados - Chatitas', 43, true),
  ('Calzado', 'Zapatos Cerrados - Stilettos', 44, true),
  ('Calzado', 'Sandalias - Sandalias Planas', 50, true),
  ('Calzado', 'Sandalias - Sandalias Con Taco', 51, true),
  ('Calzado', 'Sandalias - Sandalias Con Taco Forrado', 52, true),
  ('Calzado', 'Sandalias - Sandalias Con Plataforma', 53, true),
  ('Calzado', 'Deportivos - Deportivos Urbanos', 60, true),
  ('Calzado', 'Deportivos - Deportivos Casual', 61, true),
  ('Calzado', 'Deportivos - Deportivos Con Plataforma', 62, true),
  ('Calzado', 'Accesorios - Cintos', 70, true),
  ('Calzado', 'Accesorios - Estribos', 71, true),
  ('Calzado', 'Accesorios - Polainas', 72, true)
ON CONFLICT (category_name, (COALESCE(subcategory_name, ''))) DO UPDATE
SET display_order = EXCLUDED.display_order,
    visible = EXCLUDED.visible;

-- Reclasifica las familias existentes sin perder ningún producto.
WITH classified AS (
  SELECT
    id,
    CASE
      WHEN lower(coalesce(categories->>'name', '')) = 'botines'
        OR name ~* '(bot[ií]n|chelsea|borcego)'
      THEN CASE
        WHEN name ~* 'chelsea' THEN 'Botines - Botines Chelsea'
        WHEN name ~* 'borcego' THEN 'Botines - Borcegos'
        WHEN name ~* 'taco' THEN 'Botines - Botines Con Taco'
        ELSE 'Botines - Botines Urbanos'
      END
      WHEN name ~* 'mocasi' THEN 'Zapatos Cerrados - Mocasines'
      WHEN name ~* 'texan' THEN 'Botas - Texanas'
      WHEN name ~* '(corta|tobillo)' THEN 'Botas - Botas Cortas'
      WHEN name ~* '(larga|caña media)' THEN 'Botas - Botas Altas'
      ELSE 'Botas - Botas Urbanas'
    END AS subcategory_name
  FROM public.products
  WHERE lower(coalesce(categories->>'name', '')) IN ('botas', 'botines')
)
UPDATE public.products AS p
SET categories = jsonb_build_object(
  'name', 'Calzado',
  'count', 0,
  'subcategories', jsonb_build_array(jsonb_build_object('name', c.subcategory_name, 'count', 0))
)
FROM classified AS c
WHERE p.id = c.id;

-- La RPC pública sigue leyendo el origen; incorpora las hojas configuradas de
-- Calzado para que las categorías con cero productos también aparezcan.
CREATE OR REPLACE FUNCTION public.get_category_counts()
RETURNS TABLE(name text, count bigint, subcategories jsonb)
LANGUAGE sql
STABLE
AS $$
WITH category_counts AS (
  SELECT p.categories->>'name' AS category_name, count(*)::bigint AS category_count
  FROM public.products AS p
  WHERE p.active = true AND p.categories->>'name' IS NOT NULL
  GROUP BY p.categories->>'name'
), source_subcategories AS (
  SELECT p.categories->>'name' AS category_name, sub->>'name' AS subcategory_name,
         count(*)::bigint AS product_count
  FROM public.products AS p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.categories->'subcategories') = 'array'
      THEN p.categories->'subcategories' ELSE '[]'::jsonb END
  ) AS sub
  WHERE p.active = true AND p.categories->>'name' IS NOT NULL AND sub->>'name' IS NOT NULL
  GROUP BY p.categories->>'name', sub->>'name'
)
SELECT
  cc.category_name AS name,
  cc.category_count AS count,
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('name', leaf.subcategory_name, 'count', leaf.product_count)
                       ORDER BY leaf.subcategory_name)
      FROM (
        SELECT tx.subcategory_name, COALESCE(ss.product_count, 0)::bigint AS product_count
        FROM public.catalog_taxonomy AS tx
        LEFT JOIN source_subcategories AS ss
          ON ss.category_name = tx.category_name AND ss.subcategory_name = tx.subcategory_name
        WHERE cc.category_name = 'Calzado'
          AND tx.category_name = 'Calzado'
          AND tx.visible = true
          AND tx.subcategory_name IS NOT NULL
        UNION ALL
        SELECT ss.subcategory_name, ss.product_count
        FROM source_subcategories AS ss
        WHERE cc.category_name <> 'Calzado' AND ss.category_name = cc.category_name
      ) AS leaf
    ),
    '[]'::jsonb
  ) AS subcategories
FROM category_counts AS cc
ORDER BY cc.category_name;
$$;

SELECT public.catalog_rebuild();
