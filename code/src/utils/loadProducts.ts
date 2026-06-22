import type Product from "../types/product";
import { cargarProductos } from "./loadCSV";
import {
  fetchProducts,
  fetchProductById,
  fetchRelatedProducts,
} from "../server/products";
import { productMatchesCategory, productMatchesSubcategory } from "./categoryNormalization";

const useSupabase = () => {
  try {
    return import.meta.env.PUBLIC_USE_SUPABASE === "true";
  } catch {
    return false;
  }
};

let productsCache: Product[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

export async function loadProducts(): Promise<Product[]> {
  if (productsCache && Date.now() - cacheTime < CACHE_TTL) {
    return productsCache;
  }

  if (useSupabase()) {
    try {
      const products = await fetchProducts();
      if (products.length > 0) {
        productsCache = products;
        cacheTime = Date.now();
        return products;
      }
    } catch (err) {
      console.error("Supabase load failed, falling back to CSV:", err);
    }
  }

  const products = cargarProductos();
  productsCache = products;
  cacheTime = Date.now();
  return products;
}

export async function loadProductById(id: string): Promise<Product | null> {
  if (productsCache && Date.now() - cacheTime < CACHE_TTL) {
    const found = productsCache.find((p) => p.id === id);
    if (found) return found;
  }

  if (useSupabase()) {
    try {
      const product = await fetchProductById(id);
      if (product) return product;
    } catch (err) {
      console.error("Supabase loadProductById failed, falling back to CSV:", err);
    }
  }

  const all = cargarProductos();
  return all.find((p) => p.id === id) ?? null;
}

export async function loadRelatedProducts(
  relatedIds: string[],
): Promise<Product[]> {
  if (productsCache && Date.now() - cacheTime < CACHE_TTL) {
    const found = productsCache.filter((p) => relatedIds.includes(p.id));
    if (found.length > 0) return found;
  }

  if (useSupabase()) {
    try {
      const products = await fetchRelatedProducts(relatedIds);
      if (products.length > 0) return products;
    } catch (err) {
      console.error("Supabase loadRelatedProducts failed, falling back to CSV:", err);
    }
  }

  const all = cargarProductos();
  return all.filter((p) => relatedIds.includes(p.id));
}

export async function loadCategoryProducts(options: {
  category: string;
  subcategory?: string;
  page: number;
  pageSize: number;
}): Promise<{ products: Product[]; total: number }> {
  const all = await loadProducts();

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
