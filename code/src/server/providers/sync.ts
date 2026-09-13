import { syncMartina } from "./martina";
import { syncKaiDeco } from "./kaideco";
import { syncAlondra } from "./alondra";
import {
  PREVIEW_TTL_MS,
  SupabaseProductRepository,
  getPreviewSecret,
  type SyncExistingProduct,
} from "./martinaSync";
import type { ProductRow } from "./utils";
import { invalidateAllProductCaches } from "../products";
import { bumpCatalogVersion } from "../catalog/edgeCache";
import type { CatalogCacheEnv } from "../catalog/edgeCache";

interface SyncResult {
  provider: string;
  status: "ok" | "error";
  count: number;
  error?: string;
}

type ProviderSyncFn = () => Promise<{ products: ProductRow[]; count: number }>;

export interface ProviderPreviewResult {
  provider: string;
  status: "ok" | "error";
  total: number;
  newProducts: number;
  priceChanges: number;
  unchanged: number;
  error?: string;
}

export interface ProviderPreviewResponse {
  results: ProviderPreviewResult[];
  totalProducts: number;
  totalNew: number;
  totalPriceChanges: number;
  totalUnchanged: number;
  token: string;
  expiresAt: number;
}

interface ProviderPreviewSnapshot {
  provider: string;
  fingerprint: string;
}

interface ProviderPreviewTokenPayload {
  exp: number;
  providers: ProviderPreviewSnapshot[];
}

export class ProviderPreviewTokenError extends Error {}

// Persiste el valor calculado por el proveedor (en_oferta/original_price),
// NO el en_oferta previo del producto, y resetea ofertas vencidas.
const upsertProducts = (provider: string, products: ProductRow[]): Promise<{ upserted: number; errors: number }> => {
  if (products.length === 0) return Promise.resolve({ upserted: 0, errors: 0 });
  return new SupabaseProductRepository(provider).upsert(products);
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(digest));
}

async function signPreviewPayload(
  payload: ProviderPreviewTokenPayload,
): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getPreviewSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

async function verifyPreviewPayload(
  token: string,
): Promise<ProviderPreviewTokenPayload> {
  try {
    const [body, signaturePart, extra] = token.split(".");
    if (!body || !signaturePart || extra) throw new Error("Formato inválido");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getPreviewSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signaturePart) as BufferSource,
      new TextEncoder().encode(body),
    );
    if (!valid) throw new Error("Firma inválida");
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(body)),
    ) as ProviderPreviewTokenPayload;
    if (
      !Number.isFinite(payload.exp) ||
      payload.exp <= Date.now() ||
      !Array.isArray(payload.providers)
    ) {
      throw new Error("Preview vencido o inválido");
    }
    for (const snapshot of payload.providers) {
      if (
        !snapshot ||
        typeof snapshot.provider !== "string" ||
        typeof snapshot.fingerprint !== "string"
      ) {
        throw new Error("Contenido inválido");
      }
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderPreviewTokenError) throw error;
    const message = error instanceof Error ? error.message : "Token inválido";
    throw new ProviderPreviewTokenError(
      `El resumen ya no es válido: ${message}. Generá uno nuevo.`,
    );
  }
}

function normalizedProducts(products: ProductRow[]) {
  return [...products]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      img: product.img,
      categories: product.categories,
      payment_link: product.payment_link,
      relacionados: product.relacionados,
      en_oferta: Boolean(product.en_oferta),
      original_price: product.original_price ?? null,
      temporary_price: product.temporary_price ?? null,
      colors: product.colors ?? [],
      source: product.source,
      active: product.active,
      auto_update_price: product.auto_update_price,
      external_id: product.external_id,
    }));
}

async function analyzeProviderProducts(
  provider: string,
  products: ProductRow[],
): Promise<{
  newProducts: number;
  priceChanges: number;
  unchanged: number;
  fingerprint: string;
}> {
  const existing: Map<string, SyncExistingProduct> = products.length
    ? await new SupabaseProductRepository(provider).readByIds(
        products.map((product) => product.id),
      )
    : new Map<string, SyncExistingProduct>();
  let newProducts = 0;
  let priceChanges = 0;
  let unchanged = 0;
  const baseline = [...products]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((product) => {
      const previous = existing.get(product.id);
      if (!previous) {
        newProducts++;
        return { id: product.id, previous: null };
      }
      const changed =
        previous.price !== product.price ||
        previous.original_price !== (product.original_price ?? null) ||
        previous.en_oferta !== Boolean(product.en_oferta);
      if (changed) priceChanges++;
      else unchanged++;
      return {
        id: product.id,
        previous: {
          price: previous.price,
          original_price: previous.original_price,
          en_oferta: previous.en_oferta,
        },
      };
    });
  const fingerprint = await sha256(
    JSON.stringify({ products: normalizedProducts(products), baseline }),
  );
  return { newProducts, priceChanges, unchanged, fingerprint };
}

export async function previewAllProviders(): Promise<ProviderPreviewResponse> {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const providers: Array<[string, ProviderSyncFn]> = [
    ["Martina", syncMartina],
    ["Kai Deco", syncKaiDeco],
    ["Alondra", syncAlondra],
  ];

  console.info(
    `[providers-preview] run=${runId} start providers=${providers.length}`,
  );
  const previewEntries = await Promise.all(
    providers.map(async ([provider, sync]) => {
      const providerStartedAt = Date.now();
      console.info(
        `[providers-preview] run=${runId} provider=${provider} start`,
      );
      try {
        const { products } = await sync();
        const { newProducts, priceChanges, unchanged, fingerprint } =
          await analyzeProviderProducts(provider, products);
        const result: ProviderPreviewResult = {
          provider,
          status: "ok",
          total: products.length,
          newProducts,
          priceChanges,
          unchanged,
        };
        console.info(
          `[providers-preview] run=${runId} provider=${provider} done ` +
            `total=${result.total} new=${newProducts} price_changes=${priceChanges} ` +
            `unchanged=${unchanged} duration_ms=${Date.now() - providerStartedAt}`,
        );
        return {
          result,
          snapshot: { provider, fingerprint } satisfies ProviderPreviewSnapshot,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error || "Error desconocido");
        console.error(
          `[providers-preview] run=${runId} provider=${provider} failed ` +
            `duration_ms=${Date.now() - providerStartedAt} error=${message}`,
          error,
        );
        return {
          result: {
            provider,
            status: "error" as const,
            total: 0,
            newProducts: 0,
            priceChanges: 0,
            unchanged: 0,
            error: message,
          },
        };
      }
    }),
  );

  const results = previewEntries.map((entry) => entry.result);
  const expiresAt = Date.now() + PREVIEW_TTL_MS;
  const token = await signPreviewPayload({
    exp: expiresAt,
    providers: previewEntries.flatMap((entry) =>
      entry.snapshot ? [entry.snapshot] : [],
    ),
  });

  const response = {
    results,
    totalProducts: results.reduce((sum, result) => sum + result.total, 0),
    totalNew: results.reduce((sum, result) => sum + result.newProducts, 0),
    totalPriceChanges: results.reduce(
      (sum, result) => sum + result.priceChanges,
      0,
    ),
    totalUnchanged: results.reduce((sum, result) => sum + result.unchanged, 0),
    token,
    expiresAt,
  };
  console.info(
    `[providers-preview] run=${runId} done total=${response.totalProducts} ` +
      `new=${response.totalNew} price_changes=${response.totalPriceChanges} ` +
      `duration_ms=${Date.now() - startedAt}`,
  );
  return response;
}

export async function syncAllProviders(
  previewToken: string,
  options?: { kv?: CatalogCacheEnv["CATALOG_KV"] },
): Promise<{
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

  const preview = await verifyPreviewPayload(previewToken);
  const approvedSnapshots = new Map(
    preview.providers.map((snapshot) => [
      snapshot.provider,
      snapshot.fingerprint,
    ]),
  );
  const approvedProviders = providers.filter(([provider]) =>
    approvedSnapshots.has(provider),
  );

  console.info(
    `[providers-sync] run=${runId} start providers=${approvedProviders.length}`,
  );

  const results = await Promise.all(
    approvedProviders.map(async ([provider, sync]) => {
      const providerStartedAt = Date.now();
      console.info(`[providers-sync] run=${runId} provider=${provider} start`);

      try {
        const { products, count } = await sync();
        const analysis = await analyzeProviderProducts(provider, products);
        if (analysis.fingerprint !== approvedSnapshots.get(provider)) {
          throw new Error(
            "Los datos cambiaron desde el resumen. Generá uno nuevo antes de sincronizar.",
          );
        }
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
      await bumpCatalogVersion({ kv: options?.kv });
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
