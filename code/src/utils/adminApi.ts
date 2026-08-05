import { supabase } from "../lib/supabaseClient";

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface AdminProduct {
  id: string;
  name: string;
  price: string;
  en_oferta: boolean;
  active: boolean;
  source: string;
  updated_at: string;
  img: string[];
  categories: {
    name: string;
    count: number;
    subcategories: { name: string; count: number }[];
  };
}

export interface ProductFormData {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  subcategory: string;
  en_oferta: boolean;
  active: boolean;
  auto_update_price: boolean;
  images: string[];
  colors: any[];
  relacionados: string[];
}

export interface CategoryOption {
  name: string;
  count: number;
  subcategories: { name: string; count: number }[];
}

async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  } as Record<string, string>;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Error del servidor (${res.status})`);
  }
  return json.data as T;
}

export async function listProducts(): Promise<AdminProduct[]> {
  return request<AdminProduct[]>("/api/admin/products");
}

export async function getProduct(id: string): Promise<any> {
  return request<any>(`/api/admin/products/${encodeURIComponent(id)}`);
}

export async function createProduct(
  id: string,
  data: Record<string, unknown>,
): Promise<any> {
  return request<any>("/api/admin/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function updateProduct(
  id: string,
  data: Record<string, unknown>,
): Promise<any> {
  return request<any>(`/api/admin/products/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function toggleProductActive(
  id: string,
  active: boolean,
): Promise<any> {
  return request<any>("/api/admin/products/toggle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, active }),
  });
}

export async function searchProducts(
  q: string,
): Promise<Array<{ id: string; name: string }>> {
  return request<Array<{ id: string; name: string }>>(
    `/api/admin/products/search?q=${encodeURIComponent(q)}`,
  );
}

export async function getCategories(): Promise<CategoryOption[]> {
  return request<CategoryOption[]>("/api/admin/products/categories");
}

export async function getNextId(): Promise<string> {
  const result = await request<{ nextId: string }>("/api/admin/products/next-id");
  return result.nextId;
}

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const result = await request<{ url: string }>("/api/admin/upload-image", {
    method: "POST",
    body: formData,
  });
  return result.url;
}
