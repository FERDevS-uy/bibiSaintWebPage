-- 006_fix_bano_cortinas_subcategory.sql
-- Fix de datos: asignar subcategoría "Cortinas de baño" a 7 productos de Baño
-- que tenían subcategoría vacía pero son cortinas de baño.
--
-- Contexto: La grilla /categories/Baño/Cortinas De Baño mostraba solo 2 productos
-- porque 8 productos de Baño con "cortina" en el nombre tenían subcategoría vacía.
-- Se excluyó explícitamente "Forro De Cortina 180x180" (id 235) porque es un forro,
-- no una cortina.
--
-- Fecha: 2026-08-27
-- Autor: DBA agent (Bibi Saint)

-- UPDATE aplicado (7 filas):
UPDATE public.products
SET categories = jsonb_build_object(
    'name', 'Baño',
    'count', 0,
    'subcategories', '[{"name": "Cortinas de baño", "count": 0}]'::jsonb
),
updated_at = now()
WHERE id IN (
    '225',                                    -- Cortina Bukara 180 x 180
    '229',                                    -- Cortina Bukara Lisa C/transparencia
    '230',                                    -- Cortina Home Class Jacq Dobby 180 x 180
    '231',                                    -- Cortina Jacq Hc
    '234',                                    -- Cortina Mic. Home Class 180 x 180
    '236',                                    -- Cortina 1 PaÑo Mic Monstruos S/pack
    'alo-68b1e991b8dd439aaddfb2c3'           -- Protector Cortina Baño
)
AND categories->>'name' = 'Baño'
AND active = true;

-- ROLLBACK (si es necesario revertir):
-- UPDATE public.products
-- SET categories = jsonb_build_object(
--     'name', 'Baño',
--     'subcategories', '[]'::jsonb
-- ),
-- updated_at = now()
-- WHERE id IN (
--     '225', '229', '230', '231', '234', '236',
--     'alo-68b1e991b8dd439aaddfb2c3'
-- )
-- AND categories->>'name' = 'Baño'
-- AND active = true;

-- Verificación POST (debe mostrar 10 filas: 9 con subcat, 1 sin):
-- SELECT id, name, active,
--        categories->>'name' AS category,
--        jsonb_array_length(COALESCE(categories->'subcategories', '[]'::jsonb)) AS subcat_count
-- FROM public.products
-- WHERE categories->>'name' = 'Baño'
--   AND name ILIKE '%cortina%'
-- ORDER BY id;
--
-- Resultado esperado:
-- - 225, 229, 230, 231, 234, 236, alo-...b2c3: subcat_count = 1
-- - 235 (Forro): subcat_count = 0
-- - alo-...b320, alo-...d7a (Alondra): subcat_count = 1
