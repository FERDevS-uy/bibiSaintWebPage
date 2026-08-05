import type { APIRoute } from "astro";
import { getSupabaseAdmin } from "../../../../server/supabase";
import { verifyAdmin } from "../../../../server/auth";

export const POST: APIRoute = async ({ request }) => {
  if (!await verifyAdmin(request)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { id, active } = await request.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "ID requerido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (typeof active !== "boolean") {
      return new Response(JSON.stringify({ error: "Estado inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .update({ active })
      .eq("id", id)
      .select("id, active")
      .single();

    if (error) throw error;
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("Admin toggle error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
