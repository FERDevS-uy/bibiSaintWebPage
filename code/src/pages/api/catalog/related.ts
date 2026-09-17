import type { APIRoute } from "astro";
import { getSupabase } from "@server/supabase";
import {
  CatalogError,
  type CatalogCardProjection,
} from "@server/catalog/contracts";
import {
  catalogErrorToStatus,
  withEdgeCache,
  getCatalogCacheHeaders,
} from "@server/catalog/http";
import {
  createCatalogQueryTelemetry,
  observeCatalogQuery,
} from "@server/catalog/queryTelemetry";

interface CatalogReadResponse {
  data: unknown;
  error: unknown;
}
interface RelatedRow {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  imageUrl: string;
  enOferta: boolean;
  category: string;
  subcategory?: string;
}
const JSON_HEADERS = { "content-type": "application/json" };
function rowToProjection(row: RelatedRow): CatalogCardProjection {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    originalPrice:
      row.originalPrice == null ? undefined : Number(row.originalPrice),
    imageUrl: row.imageUrl,
    enOferta: Boolean(row.enOferta),
    category: row.category,
    subcategory: row.subcategory || undefined,
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const telemetry = createCatalogQueryTelemetry("api-related");
  return withEdgeCache({
    route: "related",
    request,
    locals,
    handler: async () => {
      try {
        const productId = new URL(request.url).searchParams.get("product_id");
        if (!productId)
          throw new CatalogError("INVALID_PAGE_SIZE", "product_id requerido");
        const supabase = getSupabase();
        const { data: relRows, error: relError } =
          await observeCatalogQuery<CatalogReadResponse>(
            telemetry,
            "product_related",
            async () =>
              await supabase
                .from("product_related")
                .select("related_id")
                .eq("product_id", productId)
                .order("position", { ascending: true })
                .limit(10),
          );
        if (relError)
          throw new CatalogError(
            "UPSTREAM_ERROR",
            "Error upstream al leer relacionados",
          );
        const relatedIds = ((relRows as Array<{ related_id?: unknown }>) ?? [])
          .map((row) => row.related_id)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          );
        if (!relatedIds.length)
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: getCatalogCacheHeaders("related"),
          });
        const { data: productRows, error: productError } =
          await observeCatalogQuery<CatalogReadResponse>(
            telemetry,
            "catalog_related_products",
            async () =>
              await supabase
                .from("catalog_products")
                .select(
                  "id:product_id, name, price:numeric_price, originalPrice:original_price, imageUrl:image_url, enOferta:en_oferta, category, subcategory",
                )
                .in("product_id", relatedIds)
                .eq("active", true),
          );
        if (productError)
          throw new CatalogError(
            "UPSTREAM_ERROR",
            "Error upstream al resolver productos",
          );
        const byId = new Map(
          ((productRows ?? []) as RelatedRow[]).map((row) => [row.id, row]),
        );
        const items = relatedIds.flatMap((id) => {
          const row = byId.get(id);
          return row ? [rowToProjection(row)] : [];
        });
        return new Response(JSON.stringify({ items }), {
          status: 200,
          headers: getCatalogCacheHeaders("related"),
        });
      } catch (err) {
        if (err instanceof CatalogError)
          return new Response(
            JSON.stringify({ error: err.code, message: err.message }),
            { status: catalogErrorToStatus(err), headers: JSON_HEADERS },
          );
        return new Response(
          JSON.stringify({ error: "INTERNAL", message: "Error interno" }),
          { status: 500, headers: JSON_HEADERS },
        );
      }
    },
  });
};
