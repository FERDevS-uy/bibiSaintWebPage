import { getSupabaseAdmin } from "../supabase";
import { syncMartina } from "./martina";
import { syncKaiDeco } from "./kaideco";
import { syncAlondra } from "./alondra";

interface SyncResult {
  provider: string;
  status: "ok" | "error";
  count: number;
  error?: string;
}

interface ProductRow {
  id: string;
  name: string;
  description: string;
  price: string;
  img: string[];
  categories: { name: string; count: number; subcategories: Array<{ name: string; count: number }> };
  payment_link: Array<{ id: string; url: string }>;
  relacionados: string[];
  en_oferta: boolean;
  colors?: Array<{ id: number; hex: string; name: string; images: string[]; sizes?: string[] }>;
  source: string;
  active: boolean;
  auto_update_price: boolean;
  external_id: string;
}

async function upsertProducts(products: ProductRow[], provider: string): Promise<{ upserted: number; errors: number }> {
  if (products.length === 0) return { upserted: 0, errors: 0 };

  const supabase = getSupabaseAdmin();
  let upserted = 0;
  let errors = 0;

  const BATCH_SIZE = 50;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const ids = batch.map((p) => p.id);

    const { data: existing } = await supabase
      .from("products")
      .select("id, en_oferta, price")
      .in("id", ids);

    const existingMap = new Map<string, { en_oferta: boolean; price: string }>();
    if (existing) {
      for (const row of existing) {
        existingMap.set(row.id as string, { en_oferta: Boolean(row.en_oferta), price: String(row.price ?? "") });
      }
    }

    const toUpsert: Array<Record<string, unknown>> = [];
    for (const p of batch) {
      const prev = existingMap.get(p.id);
      if (prev && prev.price === p.price) continue;
      toUpsert.push({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        img: p.img,
        categories: p.categories,
        payment_link: p.payment_link,
        relacionados: p.relacionados,
        en_oferta: prev?.en_oferta ?? false,
        colors: p.colors || [],
        source: p.source,
        active: p.active,
        auto_update_price: p.auto_update_price,
        external_id: p.external_id,
      });
    }

    if (toUpsert.length === 0) continue;

    const { error } = await supabase.from("products").upsert(
      toUpsert,
      { onConflict: "id", ignoreDuplicates: false },
    );

    if (error) {
      console.error(`${provider}: error en batch ${i / BATCH_SIZE + 1}:`, error.message);
      errors += toUpsert.length;
    } else {
      upserted += toUpsert.length;
    }
  }

  return { upserted, errors };
}

export async function syncAllProviders(): Promise<{
  results: SyncResult[];
  totalUpserted: number;
  totalErrors: number;
}> {
  const results: SyncResult[] = [];
  let totalUpserted = 0;
  let totalErrors = 0;

  // Martina
  try {
    const { products, count } = await syncMartina();
    const { upserted, errors } = await upsertProducts(products, "Martina");
    results.push({
      provider: "Martina",
      status: errors > 0 && upserted === 0 ? "error" : "ok",
      count: upserted,
      error: errors > 0 ? `${errors} errores en upsert` : undefined,
    });
    totalUpserted += upserted;
    totalErrors += errors;
    console.log(`Martina: ${upserted} upserted, ${errors} errors`);
  } catch (e: any) {
    results.push({ provider: "Martina", status: "error", count: 0, error: e?.message || "Error desconocido" });
    totalErrors++;
    console.error("Martina sync failed:", e?.message || e);
  }

  // Kai Deco
  try {
    const { products, count } = await syncKaiDeco();
    const { upserted, errors } = await upsertProducts(products, "KaiDeco");
    results.push({
      provider: "Kai Deco",
      status: errors > 0 && upserted === 0 ? "error" : "ok",
      count: upserted,
      error: errors > 0 ? `${errors} errores en upsert` : undefined,
    });
    totalUpserted += upserted;
    totalErrors += errors;
    console.log(`Kai Deco: ${upserted} upserted, ${errors} errors`);
  } catch (e: any) {
    results.push({ provider: "Kai Deco", status: "error", count: 0, error: e?.message || "Error desconocido" });
    totalErrors++;
    console.error("Kai Deco sync failed:", e?.message || e);
  }

  // Alondra
  try {
    const { products, count } = await syncAlondra();
    const { upserted, errors } = await upsertProducts(products, "Alondra");
    results.push({
      provider: "Alondra",
      status: errors > 0 && upserted === 0 ? "error" : "ok",
      count: upserted,
      error: errors > 0 ? `${errors} errores en upsert` : undefined,
    });
    totalUpserted += upserted;
    totalErrors += errors;
    console.log(`Alondra: ${upserted} upserted, ${errors} errors`);
  } catch (e: any) {
    results.push({ provider: "Alondra", status: "error", count: 0, error: e?.message || "Error desconocido" });
    totalErrors++;
    console.error("Alondra sync failed:", e?.message || e);
  }

  return { results, totalUpserted, totalErrors };
}
