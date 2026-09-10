// src/pages/api/catalog/products.ts
// Endpoint de listado paginado de catálogo (read model).
// Tarea 3.2 — scalable-catalog-read-pipeline — Grupo 3.
//
// GET /api/catalog/products?category=&subcategory=&enOferta=&cursor=&pageSize=&sort=
// Delega en `runCatalogQuery` (3.1) sobre `catalog_products` con keyset pagination.
// Devuelve `CatalogPageResponse` JSON: items, nextCursor, hasMore, catalogVersion.
// Errores: 400 (parámetros inválidos), 409 (cursor incompatible), 502 (backend).

import type { APIRoute } from "astro";
import { getSupabase } from "@server/supabase";
import { CatalogError } from "@server/catalog/contracts";
import { runCatalogQuery } from "@server/catalog/queries";
import { createCatalogQueryTelemetry } from "@server/catalog/queryTelemetry";
import { loadCatalogPage, isReadModel } from "@server/catalog/facade";
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
        if (!isReadModel(env)) {
          const result = await loadCatalogPage(parsed, env, getSupabase, { telemetry });
          return new Response(
            JSON.stringify({
              items: result.items,
              nextCursor: result.nextCursor,
              previousCursor: result.previousCursor,
              hasMore: result.hasMore,
              catalogVersion: null,
            }),
            {
              status: 200,
              headers: getCatalogCacheHeaders("products"),
            },
          );
        }

        const supabase = getSupabase();
        const result = await runCatalogQuery(parsed, env, supabase, {
          includeTotal: false,
          telemetry,
        });

        return new Response(
          JSON.stringify({
            items: result.items,
            nextCursor: result.nextCursor,
            previousCursor: result.previousCursor,
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
