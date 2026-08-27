import type { APIRoute } from "astro";
import { getSupabaseAdmin } from "../../../server/supabase";
import { verifyAdmin } from "../../../server/auth";
import { pickWritable } from "../../../server/adminWhitelist";
import { invalidateAllProductCaches } from "../../../server/products";

export const GET: APIRoute = async ({ request }) => {
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
      .select("id, name, price, en_oferta, active, source, updated_at, img, categories")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return new Response(JSON.stringify({ data: data ?? [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("Admin list products error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!await verifyAdmin(request)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    const { id, ...productData } = body;
    const clean = pickWritable(productData);
    const insertData = id ? { id, ...clean } : clean;

    const { data, error } = await supabase
      .from("products")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    invalidateAllProductCaches();
    return new Response(JSON.stringify({ data }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("Admin create product error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
