// src/pages/api/catalog/related.ts
// Endpoint de productos relacionados (read model).
// Tarea 3.2 — scalable-catalog-read-pipeline — Grupo 3.
//
// GET /api/catalog/related?product_id=<id>
// Lee los IDs de `product_related` (orden de prioridad por `position`), los
// resuelve contra `catalog_products` (proyección mínima) y devuelve hasta 10
// productos manteniendo el orden de prioridad de `product_related`.

import type { APIRoute } from "astro";
import { getSupabase } from "@server/supabase";
import { CatalogError, type CatalogCardProjection } from "@server/catalog/contracts";
import {
  catalogErrorToStatus,
  catalogReadEnv,
  withEdgeCache,
  getCatalogCacheHeaders,
} from "@server/catalog/http";
import { resolveCatalogReadPath, resolveCsvFallback } from "@server/catalog/readPath";
import { loadProductById, loadRelatedProductsFallback } from "@utils/loadProducts";
import { parsePrice } from "@utils/price";
import type Product from "../../../types/product";

/** Proyección mínima de tarjeta (misma forma que CatalogCardProjection). */
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

function rowToProjection(row: RelatedRow): CatalogCardProjection {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    originalPrice: row.originalPrice == null ? undefined : Number(row.originalPrice),
    imageUrl: row.imageUrl,
    enOferta: Boolean(row.enOferta),
    category: row.category,
    subcategory: row.subcategory || undefined,
  };
}

function productToProjection(product: Product): CatalogCardProjection {
  return {
    id: product.id,
    name: product.name,
    price: parsePrice(product.price),
    originalPrice: product.originalPrice == null ? undefined : parsePrice(product.originalPrice),
    imageUrl: product.img[0] ?? "",
    enOferta: Boolean(product.enOferta),
    category: product.categories?.name ?? "",
  };
}

const JSON_HEADERS = { "content-type": "application/json" };

export const GET: APIRoute = async ({ request, locals }) => {
  return withEdgeCache({
    route: "related",
    request,
    locals,
    handler: async () => {
      try {
        const url = new URL(request.url);
        const productId = url.searchParams.get("product_id");
        if (!productId) {
          throw new CatalogError("INVALID_PAGE_SIZE", "product_id requerido");
        }

        const env = catalogReadEnv((locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env);
        if (resolveCatalogReadPath(env) !== "readmodel") {
          const options = { csvFallback: resolveCsvFallback(env) };
          const product = await loadProductById(productId, options);
          const related = product ? await loadRelatedProductsFallback(product, 10, options) : [];
          return new Response(JSON.stringify({ items: related.map(productToProjection) }), {
            status: 200,
            headers: getCatalogCacheHeaders("related"),
          });
        }

        const supabase = getSupabase();

        // 1) IDs relacionados en orden de prioridad (position), máx 10.
        const { data: relRows, error: relError } = await supabase
          .from("product_related")
          .select("related_id")
          .eq("product_id", productId)
          .order("position", { ascending: true })
          .limit(10);

        if (relError) {
          throw new CatalogError("UPSTREAM_ERROR", "Error upstream al leer relacionados");
        }

        const relatedIds = (relRows ?? []).map((r) => r.related_id as string);
        if (relatedIds.length === 0) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: getCatalogCacheHeaders("related"),
          });
        }

        // 2) Resolver datos desde catalog_products (proyección mínima, nunca *).
        const { data: prodRows, error: prodError } = await supabase
          .from("catalog_products")
          .select(
            "id:product_id, name, price:numeric_price, originalPrice:original_price, " +
              "imageUrl:image_url, enOferta:en_oferta, category, subcategory",
          )
          .in("product_id", relatedIds)
          .eq("active", true);

        if (prodError) {
          throw new CatalogError("UPSTREAM_ERROR", "Error upstream al resolver productos");
        }

        // 3) Preservar el orden de prioridad de product_related.
        const byId = new Map<string, RelatedRow>(
          ((prodRows ?? []) as RelatedRow[]).map((row) => [row.id, row]),
        );
        const items = relatedIds
          .map((id) => byId.get(id))
          .filter((r): r is RelatedRow => Boolean(r))
          .map(rowToProjection);

        return new Response(JSON.stringify({ items }), {
          status: 200,
          headers: getCatalogCacheHeaders("related"),
        });
      } catch (err) {
        if (err instanceof CatalogError) {
          return new Response(
            JSON.stringify({ error: err.code, message: err.message }),
            { status: catalogErrorToStatus(err), headers: JSON_HEADERS },
          );
        }
        return new Response(
          JSON.stringify({ error: "INTERNAL", message: "Error interno" }),
          { status: 500, headers: JSON_HEADERS },
        );
      }
    },
  });
};

