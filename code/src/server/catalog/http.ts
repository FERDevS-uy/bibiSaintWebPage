// src/server/catalog/http.ts
// Capa HTTP del pipeline de lectura de catálogo (read model).
// Tarea 3.2 — scalable-catalog-read-pipeline — Grupo 3.
//
// Módulo Worker-friendly: sin APIs de Node, sin dependencias externas aparte
// de los contratos internos. Contiene la lógica pura de parsing de query
// params → CatalogPageRequest y el mapeo CatalogError → status HTTP, ambas
// testables sin Supabase (TDD). Los endpoints de `src/pages/api/catalog/`
// delegan aquí y en `runCatalogQuery` (3.1).

import { CatalogError, type CatalogPageRequest } from "./contracts.ts";

/** Request de página con el filtro opcional `enOferta` (no está en el contrato base). */
export interface ParsedCatalogRequest extends CatalogPageRequest {
  enOferta?: boolean;
}

/**
 * Parsea los query params de una URL a un `CatalogPageRequest` (más `enOferta`).
 *
 * Reglas:
 * - `sort` default "nombre"; cualquier valor se acepta (buildOrderByClause lo
 *   normaliza: solo "precio"/"price" cambian el orden).
 * - `category`, `subcategory`, `cursor` opcionales (string).
 * - `pageSize`: si está presente debe ser un número entero > 0; si no → 400
 *   (INVALID_PAGE_SIZE). Los valores fuera de rango los acota `clampPageSize`
 *   dentro de `runCatalogQuery`.
 * - `enOferta`: "true"/"false" → boolean; cualquier otro valor → 400.
 *
 * Lanza `CatalogError` con código `INVALID_PAGE_SIZE` ante parámetros inválidos
 * (ambos casos se mapean a 400 en la capa HTTP).
 */
export function parseCatalogPageRequest(url: URL): ParsedCatalogRequest {
  const params = url.searchParams;
  const request: ParsedCatalogRequest = { sort: params.get("sort") ?? "nombre" };

  const category = params.get("category");
  if (category) request.category = category;

  const subcategory = params.get("subcategory");
  if (subcategory) request.subcategory = subcategory;

  const cursor = params.get("cursor");
  if (cursor) request.cursor = cursor;

  const pageSizeRaw = params.get("pageSize");
  if (pageSizeRaw !== null) {
    const n = Number(pageSizeRaw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new CatalogError("INVALID_PAGE_SIZE", "pageSize inválido");
    }
    request.pageSize = n;
  }

  const enOfertaRaw = params.get("enOferta");
  if (enOfertaRaw !== null) {
    if (enOfertaRaw === "true") request.enOferta = true;
    else if (enOfertaRaw === "false") request.enOferta = false;
    else {
      throw new CatalogError("INVALID_PAGE_SIZE", "enOferta inválido");
    }
  }

  return request;
}

/**
 * Mapea un `CatalogError` a su status HTTP.
 * - INVALID_CURSOR / INVALID_PAGE_SIZE → 400 (parámetros inválidos).
 * - VERSION_MISMATCH / FILTER_MISMATCH → 409 (cursor incompatible).
 * - UPSTREAM_ERROR → 502 (fallo del backend).
 * - Cualquier otro → 500.
 */
export function catalogErrorToStatus(err: CatalogError): number {
  switch (err.code) {
    case "INVALID_CURSOR":
    case "INVALID_PAGE_SIZE":
      return 400;
    case "VERSION_MISMATCH":
    case "FILTER_MISMATCH":
      return 409;
    case "UPSTREAM_ERROR":
      return 502;
    default:
      return 500;
  }
}

/**
 * Lee las banderas de lectura del entorno. Los valores runtime y process.env
 * definidos tienen precedencia; import.meta.env queda como fallback de build.
 * Devuelve `{ CATALOG_READ_MODEL, ENABLE_CSV_FALLBACK }` listo para la facade.
 */
type CatalogRuntimeEnv = Record<string, string | undefined> | undefined;

export function catalogReadEnv(
  runtimeEnv?: CatalogRuntimeEnv,
): { CATALOG_READ_MODEL?: string; ENABLE_CSV_FALLBACK?: string } {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  const catalogReadModel =
    runtimeEnv?.CATALOG_READ_MODEL ??
    processEnv?.CATALOG_READ_MODEL ??
    metaEnv?.CATALOG_READ_MODEL;
  const csvFallback =
    runtimeEnv?.ENABLE_CSV_FALLBACK ??
    processEnv?.ENABLE_CSV_FALLBACK ??
    metaEnv?.ENABLE_CSV_FALLBACK;
  return { CATALOG_READ_MODEL: catalogReadModel, ENABLE_CSV_FALLBACK: csvFallback };
}

// ---------------------------------------------------------------------------
// Categorías / subcategorías (endpoint categories.ts)
// ---------------------------------------------------------------------------

/** Nodo de categoría con sus subcategorías y conteos (incluye conteo cero). */
export interface CatalogCategoryNode {
  name: string;
  count: number;
  subcategories: Array<{ name: string; count: number }>;
}

/** Fila de `catalog_taxonomy` (fuente de verdad de orden/visibilidad). */
export interface TaxonomyEntry {
  category_name: string;
  subcategory_name: string | null;
  display_order: number;
  visible: boolean;
}

/** Fila de `catalog_categories` (conteos precalculados). */
export interface CategoryCountRow {
  category_name: string;
  subcategory_name: string;
  product_count: number;
}

/**
 * Construye el árbol de categorías/subcategorías fusionando la taxonomía
 * (fuente de orden y visibilidad, incluye categorías con conteo cero) con los
 * conteos precalculados de `catalog_categories`.
 *
 * - Solo entradas `visible=true` de la taxonomía.
 * - Orden por `display_order` ascendente.
 * - `subcategory_name = NULL` en taxonomía → entrada a nivel categoría.
 * - Conteo por defecto 0 si no hay fila en `catalog_categories` (categoría
 *   con conteo cero incluida).
 *
 * Función pura, testable sin Supabase.
 */
export function buildCategoryTree(
  taxonomy: TaxonomyEntry[],
  counts: CategoryCountRow[],
): CatalogCategoryNode[] {
  const countMap = new Map<string, number>();
  for (const c of counts) {
    countMap.set(`${c.category_name}\u0000${c.subcategory_name}`, c.product_count);
  }
  const getCount = (cat: string, sub: string | null): number =>
    countMap.get(`${cat}\u0000${sub ?? ""}`) ?? 0;

  const nodes: CatalogCategoryNode[] = [];
  const nodeByCat = new Map<string, CatalogCategoryNode>();

  const sorted = [...taxonomy].sort((a, b) => a.display_order - b.display_order);

  for (const entry of sorted) {
    if (!entry.visible) continue;

    if (entry.subcategory_name === null) {
      const node: CatalogCategoryNode = {
        name: entry.category_name,
        count: getCount(entry.category_name, ""),
        subcategories: [],
      };
      nodes.push(node);
      nodeByCat.set(entry.category_name, node);
    } else {
      let node = nodeByCat.get(entry.category_name);
      if (!node) {
        node = {
          name: entry.category_name,
          count: getCount(entry.category_name, ""),
          subcategories: [],
        };
        nodes.push(node);
        nodeByCat.set(entry.category_name, node);
      }
      node.subcategories.push({
        name: entry.subcategory_name,
        count: getCount(entry.category_name, entry.subcategory_name),
      });
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Re-exports de Cache Edge (Tarea 4.1 - 4.5)
// ---------------------------------------------------------------------------

export {
  withEdgeCache,
  getCatalogCacheHeaders,
  resolveCatalogVersion,
  bumpCatalogVersion,
  invalidateEdgeCatalogVersion,
  buildVersionedCacheKey,
  logCatalogCacheTelemetry,
  getEdgeCacheMetrics,
  resetEdgeCacheMetrics,
  DEFAULT_CACHE_POLICY,
  type CatalogCacheEnv,
  type CatalogRouteType,
  type CacheHeaderOptions,
  type EdgeCacheTelemetryEvent,
  type EdgeCacheMetrics,
  type WithEdgeCacheOptions,
} from "./edgeCache.ts";

