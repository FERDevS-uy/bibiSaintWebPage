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

type ProviderSyncFn = () => Promise<{ products: ProductRow[]; count: number }>;

// Persiste el valor calculado por el proveedor (en_oferta/original_price),
// NO el en_oferta previo del producto, y resetea ofertas vencidas.
const upsertProducts = (provider: string, products: ProductRow[]): Promise<{ upserted: number; errors: number }> => {
  if (products.length === 0) return Promise.resolve({ upserted: 0, errors: 0 });
  return new SupabaseProductRepository(provider).upsert(products);
};

export async function syncAllProviders(): Promise<{
  results: SyncResult[];
  totalUpserted: number;
  totalErrors: number;
}> {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const providers: Array<[string, ProviderSyncFn]> = [
    ["Martina", syncMartina],
    ["Kai Deco", syncKaiDeco],
    ["Alondra", syncAlondra],
  ];

  console.info(`[providers-sync] run=${runId} start providers=${providers.length}`);

  const results = await Promise.all(
    providers.map(async ([provider, sync]) => {
      const providerStartedAt = Date.now();
      console.info(`[providers-sync] run=${runId} provider=${provider} start`);

      try {
        const { products, count } = await sync();
        const { upserted, errors } = await upsertProducts(provider, products);
        const result: SyncResult = {
          provider,
          status: errors > 0 && upserted === 0 ? "error" : "ok",
          count: upserted,
          error: errors > 0 ? `${errors} errores en upsert` : undefined,
        };
        console.info(
          `[providers-sync] run=${runId} provider=${provider} done ` +
            `fetched=${count} upserted=${upserted} errors=${errors} ` +
            `duration_ms=${Date.now() - providerStartedAt}`,
        );
        return { result, errors };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error || "Error desconocido");
        console.error(
          `[providers-sync] run=${runId} provider=${provider} failed ` +
            `duration_ms=${Date.now() - providerStartedAt} error=${message}`,
          error,
        );
        return {
          result: { provider, status: "error", count: 0, error: message } satisfies SyncResult,
          errors: 1,
        };
      }
    }),
  );

  const totalUpserted = results.reduce((total, entry) => total + entry.result.count, 0);
  const totalErrors = results.reduce((total, entry) => total + entry.errors, 0);

  if (totalUpserted > 0) {
    invalidateAllProductCaches();
    try {
      await bumpCatalogVersion();
    } catch (e: any) {
      console.error("Error bumping catalog version after provider sync:", e?.message || e);
    }
  }

  console.info(
    `[providers-sync] run=${runId} done upserted=${totalUpserted} ` +
      `errors=${totalErrors} duration_ms=${Date.now() - startedAt}`,
  );

  return { results: results.map((entry) => entry.result), totalUpserted, totalErrors };
}
