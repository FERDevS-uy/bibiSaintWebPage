import type { APIRoute } from "astro";
import { getSupabaseAdmin } from "../../../../server/supabase";
import { verifyAdmin } from "../../../../server/auth";

export const GET: APIRoute = async ({ request, url }) => {
  if (!await verifyAdmin(request)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const term = url.searchParams.get("q")?.trim();
  if (!term || term.length < 2) {
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [byName, byId] = await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .ilike("name", `%${term}%`)
        .eq("active", true)
        .limit(10),
      supabase
        .from("products")
        .select("id, name")
        .ilike("id", `%${term}%`)
        .eq("active", true)
        .limit(10),
    ]);

    if (byName.error) throw byName.error;
    if (byId.error) throw byId.error;

    const merged = [...(byName.data ?? []), ...(byId.data ?? [])];
    const uniqueById = new Map<string, { id: string; name: string }>();
    for (const item of merged) {
      if (!item?.id) continue;
      if (!uniqueById.has(item.id)) {
        uniqueById.set(item.id, { id: item.id, name: item.name ?? "" });
      }
    }

    return new Response(JSON.stringify({ data: Array.from(uniqueById.values()).slice(0, 10) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("Admin search error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
