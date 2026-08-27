-- 005_performance_indexes.sql
-- Índices de performance para las queries más frecuentes del catálogo
-- (fetchProducts, fetchCategoryProducts, fetchProductById, fetchRelatedProducts)
-- y versionado de la RPC get_category_counts (hasta ahora solo en SQL Editor).
--
-- Fecha: 2026-08-27
-- Volumen actual: ~1000-1500 filas. Lock de CREATE INDEX es trivial a este volumen.
--
-- NOTA: NO se usa CONCURRENTLY porque las migraciones de Supabase corren dentro
-- de una transacción y CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de
-- un bloque transaccional. Con ~1500 filas el lock exclusivo dura milisegundos.
-- Si el volumen crece a decenas de miles, considerar ejecutar los CREATE INDEX
-- CONCURRENTLY manualmente desde el SQL Editor fuera de una transacción.
-- Idempotente: seguro de re-ejecutar.

-- ============================================================
-- 1) ÍNDICES DE PERFORMANCE
-- ============================================================

-- 1a) Compuesto (active, name): cubre fetchProducts() que hace
--     WHERE active = true ORDER BY name.
--     También cubre queries que filtran solo por active (leading column),
--     por lo que idx_products_active (001) se vuelve redundante.
create index if not exists idx_products_active_name
  on public.products (active, name);

-- 1b) Compuesto parcial para fetchCategoryProducts():
--     WHERE active = true AND categories->>'name' = ? ORDER BY name
--     El WHERE active filtra al índice parcial; las columnas indexadas
--     son (categories->>'name', name) para cubrir filter + sort en un solo scan.
create index if not exists idx_products_category_active
  on public.products ((categories->>'name'), name)
  where active = true;

-- 1c) GIN sobre categories con jsonb_path_ops: cubre las queries de
--     contención (.contains) usadas para filtrar por subcategoría:
--     WHERE categories @> '{"subcategories":[{"name":"..."}]}'
--     jsonb_path_ops es más compacto y rápido que el operador default
--     cuando solo se necesita @> (contención) y no ?/?|/?&.
create index if not exists idx_products_categories_gin
  on public.products using gin (categories jsonb_path_ops);

-- ============================================================
-- 2) DROP DEL ÍNDICE REDUNDANTE
-- ============================================================

-- idx_products_active (creado en 001) es un índice simple sobre (active).
-- El nuevo idx_products_active_name tiene active como leading column,
-- por lo que cualquier query que filtre solo por active puede usar el
-- índice compuesto igualmente (Postgres usa el prefix de un B-tree).
-- Mantener ambos sería waste de espacio y write amplification.
drop index if exists idx_products_active;

-- ============================================================
-- 3) RPC get_category_counts — VERSIONADO (endurecida)
-- ============================================================
-- Esta función existía solo en el SQL Editor (creada manualmente, sin migración).
-- Se reconstruye aquí a partir del consumo en src/server/products.ts:fetchCategoryCounts().
--
-- El consumidor espera filas con esta forma:
--   { name | category_name, count | product_count, subcategories: [{name, count}] }
--
-- Se usan alias de columna que matchean exactamente los nombres que el código
-- intenta primero (row.name, row.count, row.subcategories).
--
-- VERSIÓN ENDURECIDA según expert review — tolera subcategories ausente/inválida.
-- Usa jsonb_typeof() + CASE para evitar crash si categories->'subcategories'
-- no es un array (null, objeto, string, etc.). También filtra sub->>'name' IS NOT NULL.

create or replace function public.get_category_counts()
returns table (
  name          text,
  count         bigint,
  subcategories jsonb
)
language sql
stable
as $$
with category_counts as (
  select
    p.categories->>'name' as cat_name,
    count(*)::bigint as cat_count
  from public.products p
  where p.active = true
    and p.categories->>'name' is not null
  group by p.categories->>'name'
)
select
  cc.cat_name as name,
  cc.cat_count as count,
  coalesce(sc.subs, '[]'::jsonb) as subcategories
from category_counts cc
left join lateral (
  select jsonb_agg(
    jsonb_build_object('name', sub_name, 'count', sub_cnt)
    order by sub_name
  ) as subs
  from (
    select
      sub->>'name' as sub_name,
      count(*)::bigint as sub_cnt
    from public.products p2
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(p2.categories->'subcategories') = 'array'
          then p2.categories->'subcategories'
        else '[]'::jsonb
      end
    ) as sub
    where p2.active = true
      and p2.categories->>'name' = cc.cat_name
      and sub->>'name' is not null
    group by sub->>'name'
  ) sub_counts
) sc on true
order by cc.cat_name;
$$;

comment on function public.get_category_counts() is
  'Versionada desde SQL Editor — reconstruida del consumo en products.ts:fetchCategoryCounts(). '
  'Versión endurecida: tolera subcategories ausente/inválida (jsonb_typeof check). '
  'Devuelve (name, count, subcategories) de productos activos.';
