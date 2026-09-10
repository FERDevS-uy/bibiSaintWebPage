// src/pages/api/catalog/categories.ts
// Endpoint de categorías/subcategorías del catálogo (read model).
// Tarea 3.2 — scalable-catalog-read-pipeline — Grupo 3.
//
// GET /api/catalog/categories
// Lee `catalog_taxonomy` (fuente de verdad de orden/visibilidad, incluye
// categorías con conteo cero) y `catalog_categories` (conteos precalculados).
// NO usa `get_category_counts` ni `fetchCategoryCounts`.
// Devuelve JSON con categorías y subcategorías ordenadas por display_order.

import type { APIRoute } from "astro";
import { recordRetiredCatalogConfig } from "@server/catalog/legacyTelemetry";
import { getSupabase } from "@server/supabase";
import { CatalogError } from "@server/catalog/contracts";
import {
  buildCategoryTree,
  catalogErrorToStatus,
  catalogReadEnv,
  withEdgeCache,
  getCatalogCacheHeaders,
  type TaxonomyEntry,
  type CategoryCountRow,
} from "@server/catalog/http";
import {
  createCatalogQueryTelemetry,
  observeCatalogQuery,
} from "@server/catalog/queryTelemetry";

interface CatalogReadResponse {
  data: unknown;
  error: unknown;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const telemetry = createCatalogQueryTelemetry("api-categories");
  return withEdgeCache({
    route: "categories",
    request,
    locals,
    handler: async () => {
      try {
        const env = catalogReadEnv((locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env);
        if (env.ENABLE_CSV_FALLBACK === "true") recordRetiredCatalogConfig("catalog");
        const supabase = getSupabase();

        const [taxonomyRes, countsRes] = await Promise.all([
          observeCatalogQuery<CatalogReadResponse>(
            telemetry,
            "catalog_taxonomy",
            async () => await supabase
              .from("catalog_taxonomy")
              .select("category_name, subcategory_name, display_order, visible")
              .order("display_order", { ascending: true }),
          ),
          observeCatalogQuery<CatalogReadResponse>(
            telemetry,
            "catalog_categories",
            async () => await supabase
              .from("catalog_categories")
              .select("category_name, subcategory_name, product_count"),
          ),
        ]);

        if (taxonomyRes.error || countsRes.error) {
          throw new CatalogError("UPSTREAM_ERROR", "Error upstream al leer categorías");
        }

        const taxonomy = (taxonomyRes.data ?? []) as TaxonomyEntry[];
        const counts = (countsRes.data ?? []) as CategoryCountRow[];

        const categories = buildCategoryTree(taxonomy, counts);

        return new Response(JSON.stringify({ categories }), {
          status: 200,
          headers: getCatalogCacheHeaders("categories"),
        });
      } catch (err) {
        if (err instanceof CatalogError) {
          return new Response(
            JSON.stringify({ error: err.code, message: err.message }),
            {
              status: catalogErrorToStatus(err),
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response(
          JSON.stringify({ error: "INTERNAL", message: "Error interno" }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          },
        );
      }
    },
  });
};
