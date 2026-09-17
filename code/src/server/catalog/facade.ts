import type { CatalogCardProjection, CatalogPageRequest } from "./contracts.ts";
import { normalizeOfferOriginalPrice } from "@utils/price";
import { runCatalogQuery } from "./queries.ts";
import {
  observeCatalogQuery,
  type CatalogQueryTelemetry,
} from "./queryTelemetry.ts";
import {
  getCatalogKvCache,
  putCatalogKvCache,
  resolveCatalogVersion,
  type CatalogCacheEnv,
} from "./edgeCache.ts";

export interface CatalogPageFacadeRequest extends CatalogPageRequest {
  enOferta?: boolean;
  page?: number;
}
export interface CatalogPageResult {
  items: CatalogCardProjection[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
  total: number;
  page: number;
  version: string;
}
export interface FeaturedProductsResult {
  novedades: CatalogCardProjection[];
  destacados: CatalogCardProjection[];
  ofertas: CatalogCardProjection[];
}
export interface CategoryProductsResult {
  items: CatalogCardProjection[];
  nextCursor: string | null;
  total: number;
}
export interface SearchProductsResult {
  items: CatalogCardProjection[];
  nextCursor: null;
  hasMore: false;
  version?: string;
  total?: number;
}
export interface CatalogFacadeOptions {
  telemetry?: CatalogQueryTelemetry;
}
type SupabaseSource<T> = T | (() => T);
type CatalogFacadeEnv = { CATALOG_KV?: CatalogCacheEnv["CATALOG_KV"] };
interface SearchSupabase {
  rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }>;
}
interface FeaturedCacheEntry {
  key: string;
  value: FeaturedProductsResult;
  expiresAt: number;
}
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

const FEATURED_CACHE_TTL_MS = 20_000;
let featuredCache: FeaturedCacheEntry | null = null;
function resolveSupabase<T>(source: SupabaseSource<T>): T {
  return typeof source === "function" ? (source as () => T)() : source;
}
function buildOfertas(items: CatalogCardProjection[]): CatalogCardProjection[] {
  const offers = items.filter((item) => item.enOferta);
  return offers.length >= 4
    ? offers.slice(0, 8)
    : [
        ...offers,
        ...items.filter((item) => !item.enOferta).slice(0, 8 - offers.length),
      ];
}

export async function loadCatalogPage(
  request: CatalogPageFacadeRequest,
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<CatalogPageResult> {
  const result = await runCatalogQuery(
    request,
    env,
    resolveSupabase(supabase),
    { telemetry: options?.telemetry },
  );
  return {
    items: result.items,
    nextCursor: result.nextCursor,
    previousCursor: result.previousCursor,
    hasMore: result.hasMore,
    total: result.total,
    page: 1,
    version: result.version,
  };
}

export async function loadCategoryProducts(
  options: {
    category: string;
    subcategory?: string;
    page: number;
    pageSize: number;
  },
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  facadeOptions?: CatalogFacadeOptions,
): Promise<CategoryProductsResult> {
  const result = await runCatalogQuery(
    {
      category: options.category,
      subcategory: options.subcategory,
      sort: "nombre",
      pageSize: options.pageSize,
    },
    env,
    resolveSupabase(supabase),
    { telemetry: facadeOptions?.telemetry },
  );
  return {
    items: result.items,
    nextCursor: result.nextCursor,
    total: result.total,
  };
}

export async function searchProducts(
  query: string,
  limit: number,
  _env: CatalogFacadeEnv,
  supabase: SupabaseSource<SearchSupabase>,
  options?: CatalogFacadeOptions,
): Promise<SearchProductsResult> {
  const { data, error } = await observeCatalogQuery<{
    data: unknown;
    error: unknown;
  }>(
    options?.telemetry,
    "catalog_search",
    async () =>
      await resolveSupabase(supabase).rpc("catalog_search_products", {
        p_query: query,
        p_limit: limit,
      }),
  );
  if (error) throw new Error("Error de búsqueda en el read model");
  const items = ((data ?? []) as SearchRow[]).map((row) => {
    const price = Number(row.numeric_price);
    const originalPrice = normalizeOfferOriginalPrice(
      row.original_price,
      price,
    );
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

export async function loadFeaturedProducts(
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<FeaturedProductsResult> {
  const version = await resolveCatalogVersion({ kv: env.CATALOG_KV });
  const key = `readmodel:v${version}`;
  const now = Date.now();
  if (featuredCache?.key === key && featuredCache.expiresAt > now)
    return featuredCache.value;
  const cached = await getCatalogKvCache<FeaturedProductsResult>(
    env.CATALOG_KV,
    "featured",
    version,
  );
  if (cached) {
    featuredCache = {
      key,
      value: cached,
      expiresAt: now + FEATURED_CACHE_TTL_MS,
    };
    return cached;
  }
  const client = resolveSupabase(supabase);
  const [recent, all] = await Promise.all([
    runCatalogQuery({ sort: "recientes", pageSize: 8 }, env, client, {
      includeTotal: false,
      telemetry: options?.telemetry,
    }),
    runCatalogQuery({ sort: "nombre", pageSize: 16 }, env, client, {
      includeTotal: false,
      telemetry: options?.telemetry,
    }),
  ]);
  const value = {
    novedades: recent.items.slice(0, 8),
    destacados: all.items.slice(0, 8),
    ofertas: buildOfertas(all.items),
  };
  featuredCache = { key, value, expiresAt: now + FEATURED_CACHE_TTL_MS };
  await putCatalogKvCache(env.CATALOG_KV, "featured", version, value);
  return value;
}

export async function loadRelatedProducts(
  relatedIds: string[],
  _env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<CatalogCardProjection[]> {
  if (!relatedIds.length) return [];
  const { data, error } = await observeCatalogQuery<{
    data: unknown;
    error: unknown;
  }>(
    options?.telemetry,
    "catalog_related_products",
    async () =>
      await resolveSupabase(supabase)
        .from("catalog_products")
        .select(
          "id:product_id, name, price:numeric_price, originalPrice:original_price, imageUrl:image_url, enOferta:en_oferta, category, subcategory",
        )
        .in("product_id", relatedIds)
        .eq("active", true)
        .limit(10),
  );
  if (error) return [];
  const byId = new Map(
    ((data ?? []) as RelatedRow[]).map((row) => [row.id, row]),
  );
  return relatedIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    const price = Number(row.price);
    const originalPrice = normalizeOfferOriginalPrice(row.originalPrice, price);
    return [
      {
        id: row.id,
        name: row.name,
        price,
        originalPrice: originalPrice ?? undefined,
        imageUrl: row.imageUrl,
        enOferta: Boolean(row.enOferta) && originalPrice !== null,
        category: row.category,
        subcategory: row.subcategory || undefined,
      },
    ];
  });
}
