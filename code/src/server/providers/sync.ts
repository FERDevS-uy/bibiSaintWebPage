import { syncMartina } from "./martina";
import { syncKaiDeco } from "./kaideco";
import { syncAlondra } from "./alondra";
import { SupabaseProductRepository } from "./martinaSync";
import type { ProductRow } from "./utils";
import { invalidateAllProductCaches } from "../products";
import { bumpCatalogVersion } from "../catalog/edgeCache";

interface SyncResult {
  provider: string;
  status: "ok" | "error";
  count: number;
  error?: string;
}

// Persiste el valor calculado por el proveedor (en_oferta/original_price),
// NO el en_oferta previo del producto, y resetea ofertas vencidas.
const upsertProducts = (products: ProductRow[]): Promise<{ upserted: number; errors: number }> => {
  if (products.length === 0) return Promise.resolve({ upserted: 0, errors: 0 });
  return new SupabaseProductRepository().upsert(products);
};

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
    const { upserted, errors } = await upsertProducts(products);
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
    const { upserted, errors } = await upsertProducts(products);
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
    const { upserted, errors } = await upsertProducts(products);
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

  if (totalUpserted > 0) {
    invalidateAllProductCaches();
    try {
      await bumpCatalogVersion();
    } catch (e: any) {
      console.error("Error bumping catalog version after provider sync:", e?.message || e);
    }
  }

  return { results, totalUpserted, totalErrors };
}

