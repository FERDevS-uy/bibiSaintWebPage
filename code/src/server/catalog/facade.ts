// src/server/catalog/facade.ts
// Facade unificada de lectura de catálogo (Fase 3 — scalable-catalog-read-pipeline).
//
// PAGE → FACADE → READ MODEL (runCatalogQuery / RPC) | LEGACY (loadProducts/...)
//
// Las páginas SSR consumen SOLO esta facade: no conocen la bandera
// CATALOG_READ_MODEL ni el provider usado. Cada método resuelve la ruta con
// resolveCatalogReadPath(env), delega a la estrategia correspondiente y
// registra telemetría (recordLegacyFallback) en la rama legacy.
//
// Contrato unificado: cada método devuelve el MISMO tipo en ambos modos.
// En modo legacy la paginación es por números de página ([pag]): nextCursor
// siempre null, `page` = página solicitada, `total` = tamaño del universo
// (coherente en todas las páginas: loadProducts + filtros + slice).

import type { CatalogCardProjection, CatalogPageRequest } from "./contracts.ts";
import { CatalogError, clampPageSize } from "./contracts.ts";
import { resolveCatalogReadPath, resolveCsvFallback } from "./readPath.ts";
import { runCatalogQuery } from "./queries.ts";
import {
  observeCatalogQuery,
  type CatalogQueryTelemetry,
} from "./queryTelemetry.ts";
import { recordLegacyFallback } from "./legacyTelemetry.ts";
import {
  loadProducts,
  loadCategoryProducts as legacyLoadCategoryProducts,
  loadRelatedProducts as legacyLoadRelatedProducts,
} from "@utils/loadProducts";
import { normalizeOfferOriginalPrice, parsePrice } from "@utils/price";
import { getDisplaySubcategories } from "@utils/categoryNormalization";
import type Product from "../../types/product";

// ---------------------------------------------------------------------------
// Tipos públicos de la facade
// ---------------------------------------------------------------------------

/** Request de página de catálogo con filtro de oferta y número de página. */
export interface CatalogPageFacadeRequest extends CatalogPageRequest {
  enOferta?: boolean;
  /** Página 1-based. En read model se ignora (keyset por cursor); en legacy se usa para el slice. */
  page?: number;
}

/** Resultado paginado unificado (ambos modos). */
export interface CatalogPageResult {
  items: CatalogCardProjection[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  /** Página actual (1-based). En read model siempre 1 (el cursor avanza). */
  page: number;
}

/** Resultado de la home (carousels). */
export interface FeaturedProductsResult {
  novedades: CatalogCardProjection[];
  destacados: CatalogCardProjection[];
  ofertas: CatalogCardProjection[];
}

interface FeaturedCacheEntry {
  key: string;
  value: FeaturedProductsResult;
  expiresAt: number;
}

/** Resultado de grilla de categoría (index). */
export interface CategoryProductsResult {
  items: CatalogCardProjection[];
  /** Cursor opaco para la página siguiente en read model; null en legacy. */
  nextCursor: string | null;
  total: number;
}

/** Resultado de búsqueda (top-N por ranking, sin cursor). */
export interface SearchProductsResult {
  items: CatalogCardProjection[];
  nextCursor: null;
  hasMore: false;
}

export interface CatalogFacadeOptions {
  telemetry?: CatalogQueryTelemetry;
}

/** Cliente Supabase mínimo para la RPC de búsqueda. */
interface SearchSupabase {
  rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }>;
}

type SupabaseSource<T> = T | (() => T);

const FEATURED_CACHE_TTL_MS = 20_000;
let featuredCache: FeaturedCacheEntry | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ¿Está activo el read model? Las páginas preguntan a la facade, no al flag. */
type CatalogFacadeEnv = { CATALOG_READ_MODEL?: string; ENABLE_CSV_FALLBACK?: string };

export function isReadModel(env: CatalogFacadeEnv): boolean {
  return resolveCatalogReadPath(env) === "readmodel";
}

function csvFallbackOptions(env: CatalogFacadeEnv): { csvFallback: boolean } {
  return { csvFallback: resolveCsvFallback(env) };
}

function resolveSupabase<T>(source: SupabaseSource<T>): T {
  return typeof source === "function" ? (source as () => T)() : source;
}

/** Proyección legacy (Product) → CatalogCardProjection. */
function toCatalogProjection(p: Product): CatalogCardProjection {
  const price = parsePrice(p.price);
  const originalPrice = normalizeOfferOriginalPrice(p.originalPrice, price);
  return {
    id: p.id,
    name: p.name,
    price,
    originalPrice: originalPrice ?? undefined,
    imageUrl: p.img[0] ?? "",
    enOferta: Boolean(p.enOferta) && originalPrice !== null,
    category: p.categories?.name ?? "",
    subcategory: getDisplaySubcategories(p).join("|"),
  };
}

/** Ordena el universo legacy según el sort del request (mismo criterio que las páginas). */
function sortLegacyUniverse(universe: Product[], sort: string): Product[] {
  const s = (sort ?? "").toLowerCase();
  if (s === "precio" || s === "price") {
    return [...universe]
      .map((p) => ({ p, n: parsePrice(p.price) }))
      .filter(({ n }) => Number.isFinite(n) && n > 0)
      .sort((a, b) =>
        a.n !== b.n ? a.n - b.n : a.p.name.localeCompare(b.p.name, "es", { sensitivity: "base" }),
      )
      .map(({ p }) => p);
  }
  if (s === "recientes") {
    return [...universe].sort((a, b) => {
      const ta = Date.parse(a.createdAt ?? a.updatedAt ?? "");
      const tb = Date.parse(b.createdAt ?? b.updatedAt ?? "");
      if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
      if (Number.isFinite(ta)) return -1;
      if (Number.isFinite(tb)) return 1;
      return 0;
    });
  }
  return universe; // ya viene ordenado por nombre (fetchProducts/CSV)
}

/** Carousels de ofertas: enOferta con fallback a no-oferta si faltan (mín 4). */
function buildOfertas(todos: CatalogCardProjection[]): CatalogCardProjection[] {
  let ofertas = todos.filter((p) => p.enOferta);
  if (ofertas.length < 4) {
    const fallbacks = todos.filter((p) => !p.enOferta).slice(0, 8 - ofertas.length);
    ofertas = [...ofertas, ...fallbacks];
  } else {
    ofertas = ofertas.slice(0, 8);
  }
  return ofertas;
}

// ---------------------------------------------------------------------------
// loadCatalogPage — listados paginados (page/[pag], ofertas, categorías)
// ---------------------------------------------------------------------------

export async function loadCatalogPage(
  request: CatalogPageFacadeRequest,
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<CatalogPageResult> {
  if (isReadModel(env)) {
    const res = await runCatalogQuery(request, env, resolveSupabase(supabase), {
      telemetry: options?.telemetry,
    });
    return {
      items: res.items,
      nextCursor: res.nextCursor,
      hasMore: res.hasMore,
      total: res.total,
      page: 1,
    };
  }
  return legacyCatalogPage(request, env);
}

async function legacyCatalogPage(
  request: CatalogPageFacadeRequest,
  env: CatalogFacadeEnv,
): Promise<CatalogPageResult> {
  recordLegacyFallback({
    route: "catalog",
    category: request.category ?? "all",
    reason: "legacy-path",
  });

  const page = Math.max(1, Math.floor(request.page ?? 1));
  const pageSize = clampPageSize(request.pageSize);

  // Categoría/subcategoría: delega en loadCategoryProducts (RPC fast path o
  // scan legacy) que ya devuelve slice + total exacto.
  if (request.category) {
    const res = await legacyLoadCategoryProducts({
      category: request.category,
      subcategory: request.subcategory,
      page,
      pageSize,
      ...csvFallbackOptions(env),
    });
    return {
      items: res.products.map(toCatalogProjection),
      nextCursor: null,
      hasMore: page * pageSize < res.total,
      total: res.total,
      page,
    };
  }

  // Listado general: universo completo + filtros + orden + slice por página.
  let universe = await loadProducts(csvFallbackOptions(env));
  if (request.enOferta === true) {
    universe = universe.filter((p) => Boolean(p.enOferta));
  }
  universe = sortLegacyUniverse(universe, request.sort);

  const total = universe.length;
  const start = (page - 1) * pageSize;
  return {
    items: universe.slice(start, start + pageSize).map(toCatalogProjection),
    nextCursor: null,
    hasMore: page * pageSize < total,
    total,
    page,
  };
}

// ---------------------------------------------------------------------------
// loadCategoryProducts — grillas de categoría (index)
// ---------------------------------------------------------------------------

export async function loadCategoryProducts(
  options: { category: string; subcategory?: string; page: number; pageSize: number },
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  facadeOptions?: CatalogFacadeOptions,
): Promise<CategoryProductsResult> {
  if (isReadModel(env)) {
    const client = resolveSupabase(supabase);
    const res = await runCatalogQuery(
      {
        category: options.category,
        subcategory: options.subcategory,
        sort: "nombre",
        pageSize: options.pageSize,
      },
      env,
      client,
      { telemetry: facadeOptions?.telemetry },
    );
    return { items: res.items, nextCursor: res.nextCursor, total: res.total };
  }

  recordLegacyFallback({ route: "catalog", category: options.category, reason: "legacy-path" });
  const res = await legacyLoadCategoryProducts({ ...options, ...csvFallbackOptions(env) });
  return { items: res.products.map(toCatalogProjection), nextCursor: null, total: res.total };
}

// ---------------------------------------------------------------------------
// searchProducts — búsqueda top-N (sugerencias y listado)
// ---------------------------------------------------------------------------

/** Fila de la RPC `catalog_search_products` (008). */
interface SearchRow {
  product_id: string;
  name: string;
  numeric_price: number;
  original_price?: number | null;
  image_url: string;
  en_oferta: boolean;
  category: string;
  subcategory?: string;
}

/**
 * Búsqueda de productos con paridad de campos entre modos:
 * - readmodel: RPC `catalog_search_products` (híbrida tsvector + pg_trgm sobre
 *   name + description, ver migración 010). Lanza `CatalogError` UPSTREAM_ERROR
 *   si la RPC falla.
 * - legacy: `loadProducts()` + filtro substring sobre name/description
 *   (misma semántica que el endpoint previo), slice top-N.
 *
 * Ambos modos devuelven `SearchProductsResult` (mismo tipo).
 */
export async function searchProducts(
  query: string,
  limit: number,
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<SearchSupabase>,
  options?: CatalogFacadeOptions,
): Promise<SearchProductsResult> {
  if (isReadModel(env)) {
    const { data, error } = await observeCatalogQuery<{ data: unknown; error: unknown }>(
      options?.telemetry,
      "catalog_search",
      async () => await resolveSupabase(supabase).rpc("catalog_search_products", {
        p_query: query,
        p_limit: limit,
      }),
    );
    if (error) {
      throw new CatalogError("UPSTREAM_ERROR", "Error de búsqueda en el read model");
    }
    const items = ((data ?? []) as SearchRow[]).map((row) => {
      const price = Number(row.numeric_price);
      const originalPrice = normalizeOfferOriginalPrice(row.original_price, price);
      return {
        id: row.product_id,
        name: row.name,
        price,
        originalPrice: originalPrice ?? undefined,
        imageUrl: row.image_url,
        enOferta: Boolean(row.en_oferta) && originalPrice !== null,
        category: row.category,
        subcategory: row.subcategory || undefined,
      };
    });
    return { items, nextCursor: null, hasMore: false };
  }

  recordLegacyFallback({ route: "catalog", category: "search", reason: "legacy-path" });
  const products = await loadProducts(csvFallbackOptions(env));
  const ql = query.toLowerCase();
  const filtered = query
    ? products
        .filter(
          (p) =>
            (p.name || "").toLowerCase().includes(ql) ||
            (p.description || "").toLowerCase().includes(ql),
        )
        .slice(0, limit)
    : [];
  return { items: filtered.map(toCatalogProjection), nextCursor: null, hasMore: false };
}

// ---------------------------------------------------------------------------
// loadFeaturedProducts — home (novedades, destacados, ofertas)
// ---------------------------------------------------------------------------

export async function loadFeaturedProducts(
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<FeaturedProductsResult> {
  const cacheKey = `${isReadModel(env) ? "readmodel" : "legacy"}:${resolveCsvFallback(env) ? "csv-on" : "csv-off"}`;
  const now = Date.now();
  if (featuredCache && featuredCache.key === cacheKey && featuredCache.expiresAt > now) {
    return featuredCache.value;
  }

  if (isReadModel(env)) {
    const client = resolveSupabase(supabase);
    // Ambas consultas son independientes: ejecutarlas en paralelo reduce TTFB de home.
    const [recentesRes, todosRes] = await Promise.all([
      runCatalogQuery(
        { sort: "recientes", pageSize: 8 },
        env,
        client,
        { includeTotal: false, telemetry: options?.telemetry },
      ),
      runCatalogQuery(
        { sort: "nombre", pageSize: 16 },
        env,
        client,
        { includeTotal: false, telemetry: options?.telemetry },
      ),
    ]);

      const result = {
        novedades: recentesRes.items.slice(0, 8),
      destacados: todosRes.items.slice(0, 8),
      ofertas: buildOfertas(todosRes.items),
    };
    featuredCache = {
      key: cacheKey,
      value: result,
      expiresAt: now + FEATURED_CACHE_TTL_MS,
    };
    return result;
  }

  recordLegacyFallback({ route: "catalog", category: "all", reason: "legacy-path" });
  const todosLosProductos = await loadProducts(csvFallbackOptions(env));
  const porRecencia = sortLegacyUniverse(todosLosProductos, "recientes");
  const todos = todosLosProductos.map(toCatalogProjection);
  const result = {
    novedades: porRecencia.slice(0, 8).map(toCatalogProjection),
    destacados: todos.slice(0, 8),
    ofertas: buildOfertas(todos),
  };
  featuredCache = {
    key: cacheKey,
    value: result,
    expiresAt: now + FEATURED_CACHE_TTL_MS,
  };
  return result;
}

// ---------------------------------------------------------------------------
// loadRelatedProducts — relacionados de producto
// ---------------------------------------------------------------------------

interface RelatedRow {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  imageUrl: string;
  enOferta: boolean;
  category: string;
  subcategory?: string;
}

export async function loadRelatedProducts(
  relatedIds: string[],
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<CatalogCardProjection[]> {
  if (relatedIds.length === 0) return [];

  if (isReadModel(env)) {
    const { data, error } = await observeCatalogQuery<{ data: unknown; error: unknown }>(
      options?.telemetry,
      "catalog_related_products",
      async () => await resolveSupabase(supabase)
        .from("catalog_products")
        .select(
          "id:product_id, name, price:numeric_price, originalPrice:original_price, imageUrl:image_url, enOferta:en_oferta, category, subcategory",
        )
        .in("product_id", relatedIds)
        .eq("active", true)
        .limit(10),
    );
    if (error) return [];
    return ((data ?? []) as RelatedRow[]).map((row) => {
      const price = Number(row.price);
      const originalPrice = normalizeOfferOriginalPrice(row.originalPrice, price);
      return {
        id: row.id,
        name: row.name,
        price,
        originalPrice: originalPrice ?? undefined,
        imageUrl: row.imageUrl,
        enOferta: Boolean(row.enOferta) && originalPrice !== null,
        category: row.category,
        subcategory: row.subcategory || undefined,
      };
    });
  }

  recordLegacyFallback({ route: "product", category: "all", reason: "legacy-path" });
  const products = await legacyLoadRelatedProducts(relatedIds, csvFallbackOptions(env));
  return products.map(toCatalogProjection);
}
