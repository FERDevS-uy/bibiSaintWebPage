import type { APIRoute } from "astro";
import { verifyAdmin } from "../../../server/auth";
import { getSupabaseAdmin } from "../../../server/supabase";
import { createFeaturedSuggestionsHandler } from "../../../server/cloudflareAnalytics";

const handle = createFeaturedSuggestionsHandler({
  verifyAdmin,
  exposeDiagnostics: import.meta.env.DEV,
  resolveProducts: async (visits) => {
    if (!visits.length) return [];
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("catalog_products")
      .select("product_id, name, image_url")
      .in("product_id", visits.map(({ productId }) => productId))
      .eq("active", true);
    if (error) throw new Error("Could not load catalog product details for analytics suggestions.");
    const byId = new Map((data ?? []).map((product: any) => [product.product_id, product]));
    return visits.flatMap(({ productId, visits: count }) => {
      const product = byId.get(productId);
      return product ? [{ id: productId, name: product.name, imageUrl: product.image_url, visits: count }] : [];
    });
  },
});

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as { runtime?: { env?: { CLOUDFLARE_API_TOKEN?: string; CLOUDFLARE_ZONE_ID?: string } } }).runtime?.env ?? {};
  return handle(request, env);
};
