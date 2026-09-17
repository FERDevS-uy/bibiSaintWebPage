import type Category from "../types/categoryList";
import type { subCategory } from "../types/categoryList";
import { toTitleCase } from "../utils/categoryNormalization";
import { fetchCategoryCounts } from "./products";
import { recordCatalogRuntimeEvent } from "@server/catalog/queryTelemetry";
import {
  getCatalogKvCache,
  putCatalogKvCache,
  resolveCatalogVersion,
  type CatalogCacheEnv,
} from "@server/catalog/edgeCache";

const SIDEBAR_CACHE_TTL_MS = 30_000;
const sidebarCache = new Map<string, { expiresAt: number; value: subCategory[] }>();
const HEADER_CACHE_TTL_MS = 30_000;
let headerCache: { version: string; expiresAt: number; value: Category[] } | null = null;
let headerInFlight: { version: string; value: Promise<Category[]> } | null = null;

interface NavigationCacheOptions {
  kv?: CatalogCacheEnv["CATALOG_KV"];
}

async function rpcHeaderCategories(options?: NavigationCacheOptions): Promise<Category[]> {
  const version = await resolveCatalogVersion({ kv: options?.kv });
  const now = Date.now();
  if (headerCache && headerCache.version === version && headerCache.expiresAt > now) {
    return headerCache.value;
  }
  if (headerInFlight?.version === version) return headerInFlight.value;

  const value = (async () => {
    const cached = await getCatalogKvCache<Category[]>(options?.kv, "navigation", version);
    if (cached) {
      headerCache = { version, value: cached, expiresAt: Date.now() + HEADER_CACHE_TTL_MS };
      return cached;
    }
    const categories = transformRpcCategories(await fetchCategoryCounts());
    headerCache = {
      version,
      value: categories,
      expiresAt: Date.now() + HEADER_CACHE_TTL_MS,
    };
    await putCatalogKvCache(options?.kv, "navigation", version, categories);
    return categories;
  })();
  headerInFlight = { version, value };

  try {
    return await value;
  } finally {
    if (headerInFlight?.value === value) headerInFlight = null;
  }
}

/**
 * Subcategorías del sidebar para una categoría padre.
 * Primario: RPC agregada `get_category_counts`, compartida con Header/Footer y
 * transformada para conservar la jerarquía visual de Ropa. A failure returns
 * an empty, non-cached navigation state instead of scanning CSV.
 */
export async function getSidebarCategories(
  categoryFather: string,
  options?: NavigationCacheOptions,
): Promise<subCategory[]> {
  const normalized = (categoryFather ?? "").trim();
  if (!normalized) return [];

  const version = await resolveCatalogVersion({ kv: options?.kv });
  const key = `${version}:${normalized.toLowerCase()}`;
  const now = Date.now();
  const cached = sidebarCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  // La RPC devuelve conteos agregados y el transform conserva las rutas visuales
  // de Ropa ("Hombre - Buzos", etc.) sin volver a cargar todo el catálogo.
  try {
    const categories = await rpcHeaderCategories(options);
    const category = categories.find((c) => c.name.toLowerCase() === normalized.toLowerCase());
    if (category) {
      const value = category.subcategories
        .map((s) => ({ ...s, name: toTitleCase(s.name.trim()) }))
        .filter((s) => Boolean(s.name));
      sidebarCache.set(key, { value, expiresAt: now + SIDEBAR_CACHE_TTL_MS });
      return value;
    }
    recordCatalogRuntimeEvent({
      event: "catalog_degraded",
      consumer: "sidebar",
      source: "supabase_read_model",
      outcome: "degraded",
      errorClass: "empty",
      requestId: globalThis.crypto.randomUUID(),
    });
  } catch {
    recordCatalogRuntimeEvent({
      event: "catalog_degraded",
      consumer: "sidebar",
      source: "supabase_read_model",
      outcome: "degraded",
      errorClass: "upstream",
      requestId: globalThis.crypto.randomUUID(),
    });
  }
  return [];
}

/**
 * Categorías para Header/Footer (dropdown global).
 * Primario: RPC `get_category_counts` con post-proceso display (MUJER+HOMBRE → Ropa,
 * prefijos "Mujer - X"/"Hombre - X", Tecno sin inferencia regex).
 * Si Supabase falla devuelve vacío para no descargar el catálogo completo en SSR.
 */
export async function getHeaderCategories(options?: NavigationCacheOptions): Promise<Category[]> {
  const now = Date.now();
  const version = await resolveCatalogVersion({ kv: options?.kv });
  if (headerCache && headerCache.version === version && headerCache.expiresAt > now) {
    return headerCache.value;
  }

  try {
    const categories = await rpcHeaderCategories(options);
    if (categories.length > 0) return categories;
    recordCatalogRuntimeEvent({
      event: "catalog_degraded",
      consumer: "header",
      source: "supabase_read_model",
      outcome: "degraded",
      errorClass: "empty",
      requestId: globalThis.crypto.randomUUID(),
    });
  } catch {
    recordCatalogRuntimeEvent({
      event: "catalog_degraded",
      consumer: "header",
      source: "supabase_read_model",
      outcome: "degraded",
      errorClass: "upstream",
      requestId: globalThis.crypto.randomUUID(),
    });
  }
  return [];
}

/**
 * Post-proceso RPC → estructura display de Header/Footer.
 * Preserva orden de primera aparición y deduplica subcategorías por nombre visual
 * sumando counts (MUJER + HOMBRE se fusionan en una única categoría "Ropa").
 */
function transformRpcCategories(counts: Category[]): Category[] {
  const result: Category[] = [];
  const categoryIndex = new Map<string, number>();

  for (const category of counts) {
    const rawName = (category.name ?? "").trim();
    if (!rawName) continue;

    const upper = rawName.toUpperCase();
    const isGender = upper === "MUJER" || upper === "HOMBRE";
    const displayName = isGender ? "Ropa" : toTitleCase(rawName);

    let idx = categoryIndex.get(displayName);
    if (idx === undefined) {
      idx = result.length;
      categoryIndex.set(displayName, idx);
      result.push({ name: displayName, count: 0, subcategories: [] });
    }

    const target = result[idx];
    target.count += Number(category.count ?? 0);

    const gender = upper === "MUJER" ? "Mujer" : upper === "HOMBRE" ? "Hombre" : null;
    const subMap = new Map<string, number>();
    for (const sub of target.subcategories) {
      subMap.set(sub.name, sub.count);
    }

    for (const sub of category.subcategories ?? []) {
      const rawSub = (sub.name ?? "").trim();
      if (!rawSub) continue;

      let visualSub: string;
      if (gender) {
        // Replica categoryNormalization.ts:71-85 (prefijo de género).
        const stripped = rawSub.replace(/^Mujer\s*-\s*|^Hombre\s*-\s*/i, "").trim();
        visualSub = `${gender} - ${toTitleCase(stripped)}`;
      } else {
        visualSub = toTitleCase(rawSub);
      }

      subMap.set(visualSub, (subMap.get(visualSub) ?? 0) + Number(sub.count ?? 0));
    }

    if (gender) {
      // Replica categoryNormalization.ts:71-85: el género desnudo es subcategoría
      // (count = productos de ese género, igual que el camino legacy).
      subMap.set(gender, (subMap.get(gender) ?? 0) + Number(category.count ?? 0));
    }

    target.subcategories = Array.from(subMap, ([name, count]) => ({ name, count }));
  }

  return result;
}
