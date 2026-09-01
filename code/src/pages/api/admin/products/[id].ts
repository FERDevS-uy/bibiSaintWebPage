import type { APIRoute } from "astro";
import { getSupabaseAdmin } from "../../../../server/supabase";
import { verifyAdmin } from "../../../../server/auth";
import { pickWritable } from "../../../../server/adminWhitelist";
import { invalidateAllProductCaches } from "../../../../server/products";
import { bumpCatalogVersion } from "../../../../server/catalog/edgeCache";

export const GET: APIRoute = async ({ request, params }) => {
  if (!await verifyAdmin(request)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", params.id!)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(JSON.stringify({ error: "Producto no encontrado" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      throw error;
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error(`Admin get product ${params.id} error:`, e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
  if (!await verifyAdmin(request)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    if (body?.id != null && String(body.id) !== String(params.id)) {
      return new Response(JSON.stringify({ error: "ID inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .update(pickWritable(body))
      .eq("id", params.id!)
      .select()
      .single();

    if (error) throw error;
    invalidateAllProductCaches();
    const kv = (locals as { runtime?: { env?: { CATALOG_KV?: any } } })?.runtime?.env?.CATALOG_KV;
    await bumpCatalogVersion({ supabaseAdmin: supabase, kv });
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error(`Admin update product ${params.id} error:`, e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
