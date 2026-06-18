import type Product from "../types/product";
import { cargarProductos } from "./loadCSV";
import { fetchProducts, fetchProductById, fetchRelatedProducts } from "../server/products";

const useSupabase = () => {
  try {
    return import.meta.env.PUBLIC_USE_SUPABASE === "true";
  } catch {
    return false;
  }
};

export async function loadProducts(): Promise<Product[]> {
  if (useSupabase()) {
    try {
      const products = await fetchProducts();
      if (products.length > 0) return products;
    } catch (err) {
      console.error("Supabase load failed, falling back to CSV:", err);
    }
  }

  return cargarProductos();
}

export async function loadProductById(id: string): Promise<Product | null> {
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

export async function loadRelatedProducts(relatedIds: string[]): Promise<Product[]> {
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

export function isSupabaseEnabled(): boolean {
  return useSupabase();
}
