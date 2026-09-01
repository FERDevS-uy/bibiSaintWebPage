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
import { getSupabase } from "@server/supabase";
import { CatalogError } from "@server/catalog/contracts";
import { resolveCatalogReadPath, resolveCsvFallback } from "@server/catalog/readPath";
import {
  buildCategoryTree,
  catalogErrorToStatus,
  catalogReadEnv,
  withEdgeCache,
  getCatalogCacheHeaders,
  type TaxonomyEntry,
  type CategoryCountRow,
} from "@server/catalog/http";
import { loadProducts } from "@utils/loadProducts";
import { getDisplayCategoryName, getDisplaySubcategories } from "@utils/categoryNormalization";

function buildLegacyCategoryTree(products: Awaited<ReturnType<typeof loadProducts>>) {
  const byCategory = new Map<string, { count: number; subcategories: Map<string, number> }>();
  for (const product of products) {
    const category = getDisplayCategoryName(product);
    if (!category) continue;
    const node = byCategory.get(category) ?? { count: 0, subcategories: new Map<string, number>() };
    node.count += 1;
    for (const subcategory of getDisplaySubcategories(product)) {
      node.subcategories.set(subcategory, (node.subcategories.get(subcategory) ?? 0) + 1);
    }
    byCategory.set(category, node);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .map(([name, node]) => ({
      name,
      count: node.count,
      subcategories: [...node.subcategories.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "es", { sensitivity: "base" }))
        .map(([subName, count]) => ({ name: subName, count })),
    }));
}

export const GET: APIRoute = async ({ request, locals }) => {
  return withEdgeCache({
    route: "categories",
    request,
    locals,
    handler: async () => {
      try {
        const env = catalogReadEnv((locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env);
        if (resolveCatalogReadPath(env) !== "readmodel") {
          const products = await loadProducts({ csvFallback: resolveCsvFallback(env) });
          return new Response(JSON.stringify({ categories: buildLegacyCategoryTree(products) }), {
            status: 200,
            headers: getCatalogCacheHeaders("categories"),
          });
        }

        const supabase = getSupabase();

        const [taxonomyRes, countsRes] = await Promise.all([
          supabase
            .from("catalog_taxonomy")
            .select("category_name, subcategory_name, display_order, visible")
            .order("display_order", { ascending: true }),
          supabase
            .from("catalog_categories")
            .select("category_name, subcategory_name, product_count"),
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

