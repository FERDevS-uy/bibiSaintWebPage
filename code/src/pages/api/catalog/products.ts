// src/pages/api/catalog/products.ts
// Endpoint de listado paginado de catálogo (read model).
// Tarea 3.2 — scalable-catalog-read-pipeline — Grupo 3.
//
// GET /api/catalog/products?category=&subcategory=&enOferta=&cursor=&pageSize=&sort=
// Delega en `runCatalogQuery` (3.1) sobre `catalog_products` con keyset pagination.
// Devuelve `CatalogPageResponse` JSON: items, nextCursor, hasMore, catalogVersion.
// Errores: 400 (parámetros inválidos), 409 (cursor incompatible), 502 (backend).

import type { APIRoute } from "astro";
import { recordRetiredCatalogConfig } from "@server/catalog/legacyTelemetry";
import { getSupabase } from "@server/supabase";
import { CatalogError } from "@server/catalog/contracts";
import { runCatalogQuery } from "@server/catalog/queries";
import { createCatalogQueryTelemetry } from "@server/catalog/queryTelemetry";
import {
  parseCatalogPageRequest,
  catalogErrorToStatus,
  catalogReadEnv,
  withEdgeCache,
  getCatalogCacheHeaders,
} from "@server/catalog/http";

export const GET: APIRoute = async ({ request, locals }) => {
  const telemetry = createCatalogQueryTelemetry("api-products");
  return withEdgeCache({
    route: "products",
    request,
    locals,
    handler: async (catalogVersion) => {
      try {
        const url = new URL(request.url);
        const parsed = parseCatalogPageRequest(url);
        const env = catalogReadEnv((locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env);
        if (env.ENABLE_CSV_FALLBACK === "true") recordRetiredCatalogConfig("catalog");
        const supabase = getSupabase();
        const result = await runCatalogQuery(parsed, supabase, {
          includeTotal: false,
          telemetry,
        });

        return new Response(
          JSON.stringify({
            items: result.items,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            catalogVersion: result.version || catalogVersion,
          }),
          {
            status: 200,
            headers: getCatalogCacheHeaders("products"),
          },
        );
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
