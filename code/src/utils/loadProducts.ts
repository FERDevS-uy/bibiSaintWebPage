import type Product from "../types/product";
import { cargarProductos } from "./loadCSV";
import {
  fetchProducts,
  fetchProductById,
  fetchRelatedProducts,
  fetchCategoryProducts,
} from "../server/products";
import {
  productMatchesCategory,
  productMatchesSubcategory,
  getDisplayCategoryName,
  getDisplaySubcategories,
  LEGACY_CATEGORIES,
} from "./categoryNormalization";
import { resolveCsvFallback } from "../server/catalog/readPath";

export interface ProductLoadOptions {
  csvFallback?: boolean;
}

const useSupabase = () => {
  try {
    return (
      import.meta.env.PUBLIC_USE_SUPABASE === "true" ||
      (typeof process !== "undefined" && process.env.PUBLIC_USE_SUPABASE === "true")
    );
  } catch {
    return typeof process !== "undefined" && process.env.PUBLIC_USE_SUPABASE === "true";
  }
};

const csvFallbackEnabled = (options?: ProductLoadOptions): boolean => {
  if (typeof options?.csvFallback === "boolean") return options.csvFallback;
  try {
    return resolveCsvFallback({
      ENABLE_CSV_FALLBACK:
        (import.meta.env.ENABLE_CSV_FALLBACK as string | undefined) ||
        (typeof process !== "undefined" ? process.env.ENABLE_CSV_FALLBACK : undefined),
    });
  } catch {
    return resolveCsvFallback({
      ENABLE_CSV_FALLBACK:
        typeof process !== "undefined" ? process.env.ENABLE_CSV_FALLBACK : undefined,
    });
  }
};

function logCsvFallbackBlocked(context: string): void {
  console.warn(
    JSON.stringify({
      event: "csv_fallback_blocked",
      context,
      reason: "ENABLE_CSV_FALLBACK_disabled",
    }),
  );
}

let productsCache: Product[] | null = null;
let productsCacheSource: "supabase" | "csv" | null = null;
let cacheTime = 0;
const CACHE_TTL = 300_000;

/** Invalida el cache de listado de productos (per-isolate, best-effort). */
export function invalidateProductsCache(): void {
  productsCache = null;
  productsCacheSource = null;
  cacheTime = 0;
}

export async function loadProducts(options?: ProductLoadOptions): Promise<Product[]> {
  const allowCsvFallback = csvFallbackEnabled(options);
  if (
    productsCache &&
    Date.now() - cacheTime < CACHE_TTL &&
    (productsCacheSource !== "csv" || allowCsvFallback)
  ) {
    return productsCache;
  }

  if (useSupabase()) {
    try {
      const products = await fetchProducts();
      if (products.length > 0) {
        productsCache = products;
        productsCacheSource = "supabase";
        cacheTime = Date.now();
        return products;
      }
    } catch (err) {
      console.error("Supabase load failed:", err);
    }
  }

  if (!allowCsvFallback) {
    logCsvFallbackBlocked("loadProducts");
    return [];
  }

  const products = cargarProductos();
  productsCache = products;
  productsCacheSource = "csv";
  cacheTime = Date.now();
  return products;
}

export async function loadProductById(id: string, options?: ProductLoadOptions): Promise<Product | null> {
  const allowCsvFallback = csvFallbackEnabled(options);
  if (
    productsCache &&
    Date.now() - cacheTime < CACHE_TTL &&
    (productsCacheSource !== "csv" || allowCsvFallback)
  ) {
    const found = productsCache.find((p) => p.id === id);
    if (found) return found;
  }

  if (useSupabase()) {
    try {
      const product = await fetchProductById(id);
      if (product) return product;
    } catch (err) {
      console.error("Supabase loadProductById failed:", err);
    }
  }

  if (!allowCsvFallback) {
    logCsvFallbackBlocked("loadProductById");
    return null;
  }

  const all = cargarProductos();
  return all.find((p) => p.id === id) ?? null;
}

function orderByRelatedIds(products: Product[], relatedIds: string[]): Product[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const ordered: Product[] = [];
  for (const id of relatedIds) {
    const found = byId.get(id);
    if (found) ordered.push(found);
  }
  for (const p of products) {
    if (!relatedIds.includes(p.id)) ordered.push(p);
  }
  return ordered;
}

export async function loadRelatedProducts(
  relatedIds: string[],
  options?: ProductLoadOptions,
): Promise<Product[]> {
  const allowCsvFallback = csvFallbackEnabled(options);
  if (
    productsCache &&
    Date.now() - cacheTime < CACHE_TTL &&
    (productsCacheSource !== "csv" || allowCsvFallback)
  ) {
    const found = orderByRelatedIds(
      productsCache.filter((p) => relatedIds.includes(p.id)),
      relatedIds,
    );
    if (found.length > 0) return found;
  }

  if (useSupabase()) {
    try {
      const products = await fetchRelatedProducts(relatedIds);
      if (products.length > 0) return orderByRelatedIds(products, relatedIds);
    } catch (err) {
      console.error("Supabase loadRelatedProducts failed:", err);
    }
  }

  if (!allowCsvFallback) {
    logCsvFallbackBlocked("loadRelatedProducts");
    return [];
  }

  const all = cargarProductos();
  return orderByRelatedIds(
    all.filter((p) => relatedIds.includes(p.id)),
    relatedIds,
  );
}

const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "del", "con", "para", "por", "y", "o", "a",
  "en", "un", "una", "unos", "unas", "hombre", "mujer", "dama", "caballero",
  "niño", "niña", "set", "kit", "pack", "juego", "x", "par",
]);

function tokenizeName(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

export async function loadRelatedProductsFallback(
  product: Product,
  limit = 10,
  options?: ProductLoadOptions,
): Promise<Product[]> {
  const all = await loadProducts(options);
  const category = getDisplayCategoryName(product);
  const subcategories = getDisplaySubcategories(product);
  const targetTokens = new Set(tokenizeName(product.name));

  const candidates = all.filter((p) => {
    if (p.id === product.id) return false;
    if (!productMatchesCategory(p, category)) return false;

    const hasSubcategory = subcategories.length > 0;
    const sameSubcategory = hasSubcategory && subcategories.some((sub) =>
      getDisplaySubcategories(p).includes(sub),
    );
    if (hasSubcategory && !sameSubcategory) return false;

    const overlap = tokenizeName(p.name).filter((token) =>
      targetTokens.has(token),
    ).length;
    return overlap > 0;
  });

  return candidates
    .sort((a, b) => {
      const score = (p: Product) =>
        tokenizeName(p.name).reduce(
          (acc, token) => acc + (targetTokens.has(token) ? token.length : 0),
          0,
        );
      return score(b) - score(a);
    })
    .slice(0, limit);
}

export async function loadCategoryProducts(options: {
  category: string;
  subcategory?: string;
  page: number;
  pageSize: number;
  csvFallback?: boolean;
}): Promise<{ products: Product[]; total: number }> {
  // Fast path: categorías no legacy con Supabase activo consultan la RPC
  // (evita cargar el catálogo completo en cada request — error 1102 CPU).
  if (isSupabaseEnabled() && !LEGACY_CATEGORIES.has(options.category.toLowerCase())) {
    try {
      const result = await fetchCategoryProducts(options);
      if (result.products.length > 0 || result.total > 0) {
        return result;
      }
    } catch {
      // continuar al fallback en memoria
    }
  }

  const all = await loadProducts(options);

  const filtered = all.filter((p) => {
    if (options.subcategory)
      return productMatchesSubcategory(p, options.category, options.subcategory);
    return productMatchesCategory(p, options.category);
  });

  const start = (options.page - 1) * options.pageSize;
  return {
    products: filtered.slice(start, start + options.pageSize),
    total: filtered.length,
  };
}

export function isSupabaseEnabled(): boolean {
  return useSupabase();
}
