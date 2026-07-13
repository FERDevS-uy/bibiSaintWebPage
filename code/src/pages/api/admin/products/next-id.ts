import type { APIRoute } from "astro";
import { getSupabaseAdmin } from "../../../../server/supabase";
import { verifyAdmin } from "../../../../server/auth";

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
      .select("id");

    if (error) throw error;

    if (!data) {
      return new Response(JSON.stringify({ data: { nextId: "1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const nums = data
      .map((r) => parseInt(r.id, 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return new Response(JSON.stringify({ data: { nextId: String(max + 1) } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("Admin next-id error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno", data: { nextId: String(Date.now()).slice(-6) } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
