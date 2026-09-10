import { getSupabase } from "@server/supabase";
import { toCardProduct } from "@server/catalog/mappers";
import type { CatalogCardProjection } from "@server/catalog/contracts";
import type { APIRoute } from "astro";
import { recordRetiredCatalogConfig } from "@server/catalog/legacyTelemetry";

export const prerender = false;
const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "public, max-age=60, s-maxage=120" };

/** Legacy array shape is retained, but it is always sourced from catalog_products. */
export const GET: APIRoute = async ({ locals }) => {
  const legacyFlag = (locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env?.ENABLE_CSV_FALLBACK;
  if (legacyFlag === "true") recordRetiredCatalogConfig("catalog");
  const { data, error } = await getSupabase().from("catalog_products")
    .select("id:product_id, name, price:numeric_price, originalPrice:original_price, imageUrl:image_url, enOferta:en_oferta, category, subcategory")
    .eq("active", true).order("sort_name", { ascending: true });
  if (error) return new Response(JSON.stringify({ error: "UPSTREAM", message: "Error de catálogo" }), { status: 502, headers: JSON_HEADERS });
  return new Response(JSON.stringify(((data ?? []) as CatalogCardProjection[]).map(toCardProduct)), { status: 200, headers: JSON_HEADERS });
};
