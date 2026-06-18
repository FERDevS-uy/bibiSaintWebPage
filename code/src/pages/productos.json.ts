import { loadProducts, isSupabaseEnabled } from "@utils/loadProducts";

export const prerender = !isSupabaseEnabled();

export async function GET(): Promise<Response> {
  const products = await loadProducts();

  return new Response(JSON.stringify(products), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}