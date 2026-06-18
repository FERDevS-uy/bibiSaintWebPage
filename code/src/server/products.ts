import type Product from "../types/product";
import { getSupabase } from "./supabase";

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
