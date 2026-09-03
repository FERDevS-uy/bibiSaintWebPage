import type Category from "../types/categoryList";
import type { subCategory } from "../types/categoryList";
import { toTitleCase } from "../utils/categoryNormalization";
import { countCategories } from "../utils/countCategories";
import { loadProducts } from "../utils/loadProducts";
import { fetchCategoryCounts } from "./products";
import {
  recordLegacyFallback,
  type LegacyFallbackReason,
} from "@server/catalog/legacyTelemetry";

const SIDEBAR_CACHE_TTL_MS = 30_000;
const sidebarCache = new Map<string, { expiresAt: number; value: subCategory[] }>();
const HEADER_CACHE_TTL_MS = 30_000;
let headerCache: { expiresAt: number; value: Category[] } | null = null;
let headerInFlight: Promise<Category[]> | null = null;

/** Camino legacy: replica exactamente lo que las páginas hacían con countCategories(loadProducts()). */
async function legacySidebarCategories(
  categoryFather: string,
  reason: LegacyFallbackReason = "legacy-path",
): Promise<subCategory[]> {
  recordLegacyFallback({ route: "sidebar", category: categoryFather, reason });
  const allProducts = await loadProducts({ csvFallback: false });
  const categories = countCategories(allProducts);
  const category = categories.find(
    (c) => c.name.toLowerCase() === categoryFather.toLowerCase(),
  );
  return category?.subcategories ?? [];
}

async function rpcHeaderCategories(): Promise<Category[]> {
  const now = Date.now();
  if (headerCache && headerCache.expiresAt > now) {
    return headerCache.value;
  }
  if (headerInFlight) return headerInFlight;

  headerInFlight = (async () => {
    const categories = transformRpcCategories(await fetchCategoryCounts());
    headerCache = {
      value: categories,
      expiresAt: Date.now() + HEADER_CACHE_TTL_MS,
    };
    return categories;
  })();

  try {
    return await headerInFlight;
  } finally {
    headerInFlight = null;
  }
}

/**
 * Subcategorías del sidebar para una categoría padre.
 * Primario: RPC agregada `get_category_counts`, compartida con Header/Footer y
 * transformada para conservar la jerarquía visual de Ropa. Solo si falla o no
 * contiene la categoría se usa el camino legacy.
 */
export async function getSidebarCategories(categoryFather: string): Promise<subCategory[]> {
  const normalized = (categoryFather ?? "").trim();
  if (!normalized) return [];

  const key = normalized.toLowerCase();
  const now = Date.now();
  const cached = sidebarCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  // La RPC devuelve conteos agregados y el transform conserva las rutas visuales
  // de Ropa ("Hombre - Buzos", etc.) sin volver a cargar todo el catálogo.
  let legacyReason: LegacyFallbackReason = "supabase-empty";
  try {
    const categories = await rpcHeaderCategories();
    const category = categories.find((c) => c.name.toLowerCase() === key);
    if (category) {
      const value = category.subcategories
        .map((s) => ({ ...s, name: toTitleCase(s.name.trim()) }))
        .filter((s) => Boolean(s.name));
      sidebarCache.set(key, { value, expiresAt: now + SIDEBAR_CACHE_TTL_MS });
      return value;
    }
  } catch (err) {
    console.error("rpcHeaderCategories failed, falling back to legacy:", err);
    legacyReason = "supabase-error";
  }

  const value = await legacySidebarCategories(normalized, legacyReason);
  sidebarCache.set(key, { value, expiresAt: now + SIDEBAR_CACHE_TTL_MS });
  return value;
}

/**
 * Categorías para Header/Footer (dropdown global).
 * Primario: RPC `get_category_counts` con post-proceso display (MUJER+HOMBRE → Ropa,
 * prefijos "Mujer - X"/"Hombre - X", Tecno sin inferencia regex).
 * Si Supabase falla devuelve vacío para no descargar el catálogo completo en SSR.
 */
export async function getHeaderCategories(): Promise<Category[]> {
  const now = Date.now();
  if (headerCache && headerCache.expiresAt > now) {
    return headerCache.value;
  }

  let fallbackReason: LegacyFallbackReason = "supabase-empty";
  try {
    const categories = await rpcHeaderCategories();
    if (categories.length > 0) return categories;
  } catch (err) {
    console.error("rpcHeaderCategories failed:", err);
    fallbackReason = "supabase-error";
  }

  // El header se renderiza dentro de Layout (incluido en /about, que es
  // prerenderable). Si la RPC falta, devuelve vacío o todavía no acompaña la
  // versión de la base, no podemos dejar el menú entero invisible: el catálogo
  // completo es un fallback estable y countCategories conserva la normalización
  // de Ropa/Tecno del camino legacy.
  recordLegacyFallback({ route: "header", category: "all", reason: fallbackReason });
  const fallbackProducts = await loadProducts({ csvFallback: true });
  const fallbackCategories = countCategories(fallbackProducts);
  if (fallbackCategories.length > 0) {
    headerCache = {
      value: fallbackCategories,
      expiresAt: Date.now() + HEADER_CACHE_TTL_MS,
    };
  }
  return fallbackCategories;
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
