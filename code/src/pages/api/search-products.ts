// src/pages/api/search-products.ts
// Endpoint de búsqueda de productos (sugerencias y listado).
// Tarea 3.5 — scalable-catalog-read-pipeline — Grupo 3.
//
// Adaptador de búsqueda (Fase 5): delega 100% en la facade `searchProducts`,
// que resuelve la ruta (readmodel RPC `catalog_search_products` | legacy
// loadProducts + filtro name/description) y devuelve el MISMO tipo en ambos
// modos. Este endpoint solo adapta la proyección a la forma de la UI
// (agrega `img` como array) y mantiene el contrato `{ items }` que consume
// ListarProductos.jsx.
//
// GET /api/search-products?q=<término>&limit=<n>&sort=<sort>&cursor=<cursor>
// Respuesta cursor-paginada: { items, nextCursor, hasMore, version, total }.

import type { APIRoute } from "astro";
import { searchProducts } from "@server/catalog/facade";
import { getSupabase } from "@server/supabase";
import {
  catalogReadEnv,
  withEdgeCache,
  getCatalogCacheHeaders,
  catalogErrorToStatus,
} from "@server/catalog/http";
import { CatalogError } from "@server/catalog/contracts";
import { runCatalogQuery } from "@server/catalog/queries";
import { createCatalogQueryTelemetry } from "@server/catalog/queryTelemetry";

const MAX_LIMIT = 48;

function clampLimit(raw: string | null, def: number): number {
  if (raw === null) return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export const GET: APIRoute = async ({ request, locals }) => {
  const telemetry = createCatalogQueryTelemetry("api-search");
  return withEdgeCache({
    route: "search",
    request,
    locals,
    handler: async () => {
      const url = new URL(request.url);
      const q = (url.searchParams.get("q") ?? "").trim();
      const limit = clampLimit(url.searchParams.get("limit"), 10);

      try {
        const env = catalogReadEnv((locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env);
        const sort = url.searchParams.get("sort") ?? "nombre";
        const cursor = url.searchParams.get("cursor") || undefined;
        const supabase = getSupabase();
        const result = env.CATALOG_READ_MODEL === "true"
          ? await runCatalogQuery(
            { query: q, sort, cursor, pageSize: limit },
            env,
            supabase,
            { telemetry },
          )
          : await searchProducts(q, limit, env, getSupabase, { telemetry });
        const items = result.items.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          originalPrice: p.originalPrice ?? null,
          imageUrl: p.imageUrl,
          img: [p.imageUrl],
          enOferta: p.enOferta,
          category: p.category,
          subcategory: p.subcategory,
        }));
        return new Response(
          JSON.stringify({
            items,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            version: result.version,
            total: result.total,
          }),
          {
            status: 200,
            headers: getCatalogCacheHeaders("search"),
          },
        );
      } catch (err) {
        if (err instanceof CatalogError) {
          const status = catalogErrorToStatus(err);
          return new Response(
            JSON.stringify({ error: err.code, message: "Error de búsqueda" }),
            { status, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ error: "INTERNAL", message: "Error interno" }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
    },
  });
};
