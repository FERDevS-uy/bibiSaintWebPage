// Canonical Worker catalog facade. Runtime reads only the bounded Supabase read model.
import type { CatalogCardProjection, CatalogPageRequest } from "./contracts.ts";
import { CatalogError } from "./contracts.ts";
import { runCatalogQuery } from "./queries.ts";
import { observeCatalogQuery, type CatalogQueryTelemetry } from "./queryTelemetry.ts";
import { recordRetiredCatalogConfig } from "./legacyTelemetry.ts";
import { normalizeOfferOriginalPrice } from "@utils/price";

export interface CatalogPageFacadeRequest extends CatalogPageRequest {
  enOferta?: boolean;
  page?: number;
}

export interface CatalogPageResult {
  items: CatalogCardProjection[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  page: number;
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
}

export interface CatalogFacadeOptions {
  telemetry?: CatalogQueryTelemetry;
}

type CatalogFacadeEnv = { CATALOG_READ_MODEL?: string; ENABLE_CSV_FALLBACK?: string };
type SupabaseSource<T> = T | (() => T);
interface SearchSupabase { rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }>; }
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
let featuredCache: { value: FeaturedProductsResult; expiresAt: number } | null = null;

/** Compatibility helper for pages that used the former selector. It is always canonical. */
export function isReadModel(_env: CatalogFacadeEnv): boolean {
  return true;
}

function resolveSupabase<T>(source: SupabaseSource<T>): T {
  return typeof source === "function" ? (source as () => T)() : source;
}

function observeRetiredConfig(env: CatalogFacadeEnv, consumer: "catalog" | "search" | "product"): void {
  if (env.ENABLE_CSV_FALLBACK === "true") recordRetiredCatalogConfig(consumer);
}

function toProjection(row: RelatedRow): CatalogCardProjection {
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
}

function buildOffers(items: CatalogCardProjection[]): CatalogCardProjection[] {
  const offers = items.filter((item) => item.enOferta);
  if (offers.length >= 4) return offers.slice(0, 8);
  return [...offers, ...items.filter((item) => !item.enOferta).slice(0, 8 - offers.length)];
}

export async function loadCatalogPage(
  request: CatalogPageFacadeRequest,
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<CatalogPageResult> {
  observeRetiredConfig(env, "catalog");
  const result = await runCatalogQuery(request, resolveSupabase(supabase), { telemetry: options?.telemetry });
  return { items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total, page: 1 };
}

export async function loadCategoryProducts(
  options: { category: string; subcategory?: string; page: number; pageSize: number },
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  facadeOptions?: CatalogFacadeOptions,
): Promise<CategoryProductsResult> {
  observeRetiredConfig(env, "catalog");
  const result = await runCatalogQuery(
    { category: options.category, subcategory: options.subcategory, sort: "nombre", pageSize: options.pageSize },
    resolveSupabase(supabase),
    { telemetry: facadeOptions?.telemetry },
  );
  return { items: result.items, nextCursor: result.nextCursor, total: result.total };
}

export async function searchProducts(
  query: string,
  limit: number,
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<SearchSupabase>,
  options?: CatalogFacadeOptions,
): Promise<SearchProductsResult> {
  observeRetiredConfig(env, "search");
  const { data, error } = await observeCatalogQuery<{ data: unknown; error: unknown }>(
    options?.telemetry,
    "catalog_search",
    async () => await resolveSupabase(supabase).rpc("catalog_search_products", { p_query: query, p_limit: limit }),
  );
  if (error) throw new CatalogError("UPSTREAM_ERROR", "Error de búsqueda en el read model");
  const items = ((data ?? []) as SearchRow[]).map((row) => toProjection({
    id: row.product_id, name: row.name, price: row.numeric_price, originalPrice: row.original_price,
    imageUrl: row.image_url, enOferta: row.en_oferta, category: row.category, subcategory: row.subcategory,
  }));
  return { items, nextCursor: null, hasMore: false };
}

export async function loadFeaturedProducts(
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<FeaturedProductsResult> {
  observeRetiredConfig(env, "catalog");
  const now = Date.now();
  if (featuredCache && featuredCache.expiresAt > now) return featuredCache.value;
  const client = resolveSupabase(supabase);
  const [recent, all] = await Promise.all([
    runCatalogQuery({ sort: "recientes", pageSize: 8 }, client, { includeTotal: false, telemetry: options?.telemetry }),
    runCatalogQuery({ sort: "nombre", pageSize: 16 }, client, { includeTotal: false, telemetry: options?.telemetry }),
  ]);
  const value = { novedades: recent.items.slice(0, 8), destacados: all.items.slice(0, 8), ofertas: buildOffers(all.items) };
  featuredCache = { value, expiresAt: now + FEATURED_CACHE_TTL_MS };
  return value;
}

export async function loadRelatedProducts(
  relatedIds: string[],
  env: CatalogFacadeEnv,
  supabase: SupabaseSource<{ from: (table: string) => any }>,
  options?: CatalogFacadeOptions,
): Promise<CatalogCardProjection[]> {
  if (relatedIds.length === 0) return [];
  observeRetiredConfig(env, "product");
  const { data, error } = await observeCatalogQuery<{ data: unknown; error: unknown }>(
    options?.telemetry,
    "catalog_related_products",
    async () => await resolveSupabase(supabase).from("catalog_products")
      .select("id:product_id, name, price:numeric_price, originalPrice:original_price, imageUrl:image_url, enOferta:en_oferta, category, subcategory")
      .in("product_id", relatedIds).eq("active", true).limit(10),
  );
  if (error) throw new CatalogError("UPSTREAM_ERROR", "Error upstream al resolver productos relacionados");
  const byId = new Map(((data ?? []) as RelatedRow[]).map((row) => [row.id, toProjection(row)]));
  return relatedIds.map((id) => byId.get(id)).filter((item): item is CatalogCardProjection => Boolean(item));
}
