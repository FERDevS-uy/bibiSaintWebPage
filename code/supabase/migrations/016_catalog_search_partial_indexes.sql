-- pg-delta: transaction=false
-- 016_catalog_search_partial_indexes.sql
-- Vuelve parciales (WHERE active = true) los dos GIN de búsqueda del read model.
--
-- Change: odd/martina-deactivation-fix — T2.
-- Dependencia: 008 (creó idx_catalog_products_search_vector y
-- idx_catalog_products_search_text_trgm como índices FULL).
--
-- Por qué: los dos GIN full indexan también las filas inactivas (~600).
-- La RPC catalog_search_products (008) ya filtra cp.active = true, predicado
-- que implica el del índice parcial, por lo que el planner puede usar los
-- parciales (BitmapOr de ambos GIN, como antes). Sin cambios en la RPC ni en RLS.
-- Los B-tree del read model (007/009/015) YA son parciales; no se tocan.
--
-- Estrategia (reemplazo sin downtime): crear los parciales con nombre nuevo
-- (CONCURRENTLY, sin bloquear escrituras) y luego dar de baja los full de 008.
-- Estado final: solo quedan GIN parciales sobre search_vector / search_text.
--
-- Cómo aplicar (IMPORTANTE — leer antes de correr):
--   CREATE/DROP INDEX CONCURRENTLY NO corre dentro de un bloque de transacción.
--   El runner de migraciones (`supabase db push`) puede envolver este archivo
--   en una transacción y fallar con "cannot run inside a transaction block".
--   Si eso ocurre, aplicar manualmente con psql fuera de transacción,
--   corriendo cada sentencia CONCURRENTLY por separado, en el orden del archivo.
--   Solo local; SIN DDL en producción sin autorización remota explícita
--   (ver odd/tasks/martina-deactivation-fix.md, restricción T2).
--
-- Rollback: DROP IF EXISTS de los parciales + re-correr el §4 de 008
-- (definiciones full). No hay cambio de columnas, triggers ni RPC que revertir.
--
-- Aditiva sobre historia append-only: NO modifica 008 ni otras migraciones.

-- ============================================================
-- 1) GIN tsvector parcial (reemplaza al full de 008 §4a)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_catalog_products_search_vector_active
  ON public.catalog_products USING gin (search_vector)
  WHERE active = true;

-- ============================================================
-- 2) GIN trigramas parcial (reemplaza al full de 008 §4b)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_catalog_products_search_text_trgm_active
  ON public.catalog_products USING gin (search_text gin_trgm_ops)
  WHERE active = true;

-- ============================================================
-- 3) Baja de los full de 008 (ya innecesarios: los parciales cubren
--    todas las lecturas, que siempre filtran active = true).
--    CONCURRENTLY para no bloquear escrituras concurrentes.
-- ============================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_catalog_products_search_vector;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_catalog_products_search_text_trgm;
