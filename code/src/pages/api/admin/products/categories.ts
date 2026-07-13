import type { APIRoute } from "astro";
import { getSupabaseAdmin } from "../../../../server/supabase";
import { verifyAdmin } from "../../../../server/auth";
import {
  getDisplayCategoryName,
  getDisplaySubcategories,
} from "../../../../utils/categoryNormalization";

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
      .select("categories, img, id, name");

    if (error) throw error;

    const catMap = new Map<string, Map<string, number>>();
    for (const row of data ?? []) {
      const product = {
        id: row.id ?? "",
        name: row.name ?? "",
        categories: (row.categories as { name?: string; subcategories?: Array<{ name: string }> }) ?? {},
        img: Array.isArray(row.img) ? row.img : [],
      } as any;

      const catName = getDisplayCategoryName(product);
      if (!catName) continue;

      if (!catMap.has(catName)) catMap.set(catName, new Map());
      const subMap = catMap.get(catName)!;
      const subs = getDisplaySubcategories(product);
      for (const s of subs) {
        if (s) subMap.set(s, (subMap.get(s) ?? 0) + 1);
      }
    }

    const categories = Array.from(catMap.entries())
      .map(([name, subMap]) => ({
        name,
        count: Array.from(subMap.values()).reduce((a, b) => a + b, 0),
        subcategories: Array.from(subMap.entries())
          .map(([n, c]) => ({ name: n, count: c }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return new Response(JSON.stringify({ data: categories }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("Admin categories error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
