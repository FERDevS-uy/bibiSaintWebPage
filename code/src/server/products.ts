import type Product from "../types/product";
import type Category from "../types/categoryList";
import { getSupabase } from "./supabase";
import { invalidateProductsCache } from "../utils/loadProducts";

/** TTL de cachés de categoría/counts (5 min, alineado con la caché de productos). */
const CATEGORY_CACHE_TTL = 300_000;

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const categoryProductsCache = new Map<string, CacheEntry<{ products: Product[]; total: number }>>();
let categoryCountsCache: CacheEntry<Category[]> | null = null;

/** Invalida todas las cachés de productos (listado + categoría + counts). Per-isolate, best-effort. */
export function invalidateAllProductCaches(): void {
  categoryProductsCache.clear();
  categoryCountsCache = null;
  invalidateProductsCache();
}

interface SupabaseProductRow {
  id: string;
  name: string;
  description: string;
  price: string;
  img: string[];
  categories: Record<string, unknown>;
  payment_link: Array<{ id: string; url: string }>;
  relacionados: string[];
  en_oferta: boolean;
  original_price: string | null;
  colors: Array<{ id: number; hex: string; name: string; images: string[]; sizes?: string[] }>;
}

function rowToProduct(row: SupabaseProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    img: Array.isArray(row.img) ? row.img : [],
    categories: row.categories as Product["categories"],
    paymentLink: Array.isArray(row.payment_link) ? row.payment_link : [],
    relacionados: Array.isArray(row.relacionados) ? row.relacionados : [],
    enOferta: Boolean(row.en_oferta),
    originalPrice: row.original_price == null ? null : String(row.original_price),
    colors: Array.isArray(row.colors) ? row.colors : [],
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Supabase fetchProducts error:", error);
    return [];
  }

  return (data ?? []).map((row) => rowToProduct(row as unknown as SupabaseProductRow));
}

export async function fetchCategoryProducts(options: {
  category: string;
  subcategory?: string;
  page: number;
  pageSize: number;
}): Promise<{ products: Product[]; total: number }> {
  const cacheKey = `cat|${options.category}|${options.subcategory ?? ""}|${options.page}|${options.pageSize}`;
  const cached = categoryProductsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const supabase = getSupabase();
  const start = (options.page - 1) * options.pageSize;
  const end = start + options.pageSize - 1;

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("active", true)
    .eq("categories->>name", options.category);

  if (options.subcategory) {
    query = query.contains("categories", { subcategories: [{ name: options.subcategory }] });
  }

  const { data, count, error } = await query
    .order("name", { ascending: true })
    .range(start, end);

  if (error) {
    console.error("Supabase fetchCategoryProducts error:", error);
    return { products: [], total: 0 };
  }

  const result = {
    products: (data ?? []).map((row) => rowToProduct(row as unknown as SupabaseProductRow)),
    total: count ?? 0,
  };

  // Solo se cachean resultados exitosos con items (un fallo no debe quedar 5 min).
  if (result.products.length > 0) {
    categoryProductsCache.set(cacheKey, {
      value: result,
      expires: Date.now() + CATEGORY_CACHE_TTL,
    });
  }

  return result;
}

export async function fetchCategoryCounts(): Promise<Category[]> {
  if (categoryCountsCache && categoryCountsCache.expires > Date.now()) {
    return categoryCountsCache.value;
  }

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("get_category_counts");

  if (error) {
    console.error("Supabase fetchCategoryCounts error:", error);
    return [];
  }

  const counts: Category[] = (data ?? []).map((row: any) => ({
    name: row.name ?? row.category_name ?? "",
    count: Number(row.count ?? row.product_count ?? 0),
    subcategories: Array.isArray(row.subcategories) ? row.subcategories.map((s: any) => ({
      name: typeof s === "string" ? s : (s.name ?? ""),
      count: Number(s.count ?? 0),
    })) : [],
  }));

  // Solo se cachean resultados exitosos con datos.
  if (counts.length > 0) {
    categoryCountsCache = {
      value: counts,
      expires: Date.now() + CATEGORY_CACHE_TTL,
    };
  }

  return counts;
}

export async function fetchProductById(id: string): Promise<Product | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .single();

  if (error || !data) {
    if (error?.code !== "PGRST116") {
      console.error(`Supabase fetchProductById(${id}) error:`, error);
    }
    return null;
  }

  return rowToProduct(data as unknown as SupabaseProductRow);
}

export async function fetchRelatedProducts(relatedIds: string[]): Promise<Product[]> {
  if (relatedIds.length === 0) return [];

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .in("id", relatedIds)
    .eq("active", true);

  if (error) {
    console.error("Supabase fetchRelatedProducts error:", error);
    return [];
  }

  return (data ?? []).map((row) => rowToProduct(row as unknown as SupabaseProductRow));
}
