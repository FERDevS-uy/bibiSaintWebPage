import type { APIRoute } from "astro";
import { loadProducts } from "@utils/loadProducts";

export const GET: APIRoute = async () => {
  const products = await loadProducts();
  return new Response(JSON.stringify(products), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300, s-maxage=600",
    },
  });
};
