import type { APIRoute } from "astro";
import { verifyAdmin } from "../../../server/auth";
import { getSupabaseAdmin } from "../../../server/supabase";
import { normalizeFeaturedProductIds } from "../../../server/featuredProducts";
import { bumpCatalogVersion } from "../../../server/catalog/edgeCache";
import { hasTrustedOrigin } from "../../../server/security/origin";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export const GET: APIRoute = async ({ request }) => {
  if (!await verifyAdmin(request)) return json({ error: "No autorizado" }, 401);
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: selection, error }, { data: catalog, error: catalogError }] = await Promise.all([
      supabase.from("featured_products").select("product_ids").eq("id", 1).maybeSingle(),
      supabase.from("catalog_products").select("product_id, name, image_url").eq("active", true).order("sort_name", { ascending: true }),
    ]);
    if (error) throw error;
    if (catalogError) throw catalogError;
    const ids = normalizeFeaturedProductIds(selection?.product_ids ?? []);
    const byId = new Map((catalog ?? []).map((product: any) => [product.product_id, product]));
    return json({ data: { ids, products: ids.flatMap((id) => byId.has(id) ? [byId.get(id)] : []) } });
  } catch (error) {
    console.error("Admin featured product read error:", error);
    return json({ error: "No se pudieron cargar los productos destacados." }, 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!await verifyAdmin(request)) return json({ error: "No autorizado" }, 401);
  if (!hasTrustedOrigin(request)) return json({ error: "Origen no autorizado" }, 403);
  try {
    const body = await request.json() as { productIds?: unknown };
    const ids = normalizeFeaturedProductIds(body?.productIds);
    const supabase = getSupabaseAdmin();
    if (ids.length) {
      const { data: activeProducts, error: catalogError } = await supabase
        .from("catalog_products")
        .select("product_id")
        .in("product_id", ids)
        .eq("active", true);
      if (catalogError) throw catalogError;
      const activeIds = new Set((activeProducts ?? []).map((product: any) => product.product_id));
      if (ids.some((id) => !activeIds.has(id))) return json({ error: "La selección incluye productos inexistentes o inactivos." }, 400);
    }
    const { error } = await supabase.from("featured_products").upsert({ id: 1, product_ids: ids }, { onConflict: "id" });
    if (error) throw error;
    const env = (locals as { runtime?: { env?: { CATALOG_KV?: any } } }).runtime?.env;
    await bumpCatalogVersion({ supabaseAdmin: supabase, kv: env?.CATALOG_KV });
    return json({ data: { ids } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar la selección.";
    const invalid = /productIds|Too many|Choose up to/.test(message);
    return json({ error: invalid ? message : "No se pudo guardar la selección." }, invalid ? 400 : 500);
  }
};
