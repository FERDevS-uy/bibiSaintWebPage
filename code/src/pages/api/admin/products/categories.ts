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
    const [{ data, error }, { data: taxonomy, error: taxonomyError }] = await Promise.all([
      supabase
        .from("products")
        .select("categories, img, id, name"),
      supabase
        .from("catalog_taxonomy")
        .select("category_name, subcategory_name, display_order")
        .eq("visible", true)
        .order("display_order", { ascending: true }),
    ]);

    if (error) throw error;
    if (taxonomyError) throw taxonomyError;

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

    const taxonomyByCategory = new Map<string, string[]>();
    for (const entry of taxonomy ?? []) {
      const subcategory = entry.subcategory_name?.trim();
      if (!subcategory) continue;
      if (!taxonomyByCategory.has(entry.category_name)) taxonomyByCategory.set(entry.category_name, []);
      taxonomyByCategory.get(entry.category_name)!.push(subcategory);
      if (!catMap.has(entry.category_name)) catMap.set(entry.category_name, new Map());
    }

    const categories = Array.from(catMap.entries())
      .map(([name, subMap]) => ({
        name,
        count: Array.from(subMap.values()).reduce((a, b) => a + b, 0),
        subcategories: (() => {
          const configured = taxonomyByCategory.get(name) ?? [];
          const configuredNames = new Set(configured);
          return [
            ...configured.map((subcategory) => ({ name: subcategory, count: subMap.get(subcategory) ?? 0 })),
            ...Array.from(subMap.entries())
              .filter(([subcategory]) => !configuredNames.has(subcategory))
              .map(([subcategory, count]) => ({ name: subcategory, count }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          ];
        })(),
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
