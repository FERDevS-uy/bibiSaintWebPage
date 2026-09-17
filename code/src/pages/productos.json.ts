import { getSupabase } from "@server/supabase";
import { toCardProduct } from "@server/catalog/mappers";
import type { CatalogCardProjection } from "@server/catalog/contracts";
import type { APIRoute } from "astro";

export const prerender = false;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60, s-maxage=120",
};

export const GET: APIRoute = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("catalog_products")
    .select(
      "id:product_id, name, price:numeric_price, originalPrice:original_price, " +
        "imageUrl:image_url, enOferta:en_oferta, category, subcategory",
    )
    .eq("active", true)
    .order("sort_name", { ascending: true });

  if (error) {
    return new Response(
      JSON.stringify({ error: "UPSTREAM", message: "Error de catálogo" }),
      { status: 502, headers: JSON_HEADERS },
    );
  }

  const items = ((data ?? []) as CatalogCardProjection[]).map(toCardProduct);
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: JSON_HEADERS,
  });
};
