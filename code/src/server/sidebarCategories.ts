import type Category from "../types/categoryList";
import type { subCategory } from "../types/categoryList";
import { toTitleCase, LEGACY_CATEGORIES } from "../utils/categoryNormalization";
import { countCategories } from "../utils/countCategories";
import { loadProducts } from "../utils/loadProducts";
import { fetchCategoryCounts } from "./products";

/** Camino legacy: replica exactamente lo que las páginas hacían con countCategories(loadProducts()). */
async function legacySidebarCategories(categoryFather: string): Promise<subCategory[]> {
  const allProducts = await loadProducts();
  const categories = countCategories(allProducts);
  const category = categories.find(
    (c) => c.name.toLowerCase() === categoryFather.toLowerCase(),
  );
  return category?.subcategories ?? [];
}

/**
 * Subcategorías del sidebar para una categoría padre.
 * - Ropa/Tecno → camino legacy (transformaciones display).
 * - Resto → RPC `get_category_counts` (con caché TTL 300s). La RPC puede
 *   lanzar (ej. modo CSV sin credenciales Supabase) o devolver vacío/sin la
 *   categoría → en ambos casos fallback legacy (mismo comportamiento que hoy,
 *   cubre producción robusta y tests E2E donde Supabase es inalcanzable).
 */
export async function getSidebarCategories(categoryFather: string): Promise<subCategory[]> {
  const normalized = (categoryFather ?? "").trim();
  if (!normalized) return [];

  const key = normalized.toLowerCase();

  if (LEGACY_CATEGORIES.has(key)) {
    return legacySidebarCategories(normalized);
  }

  let counts: Category[] = [];
  try {
    counts = await fetchCategoryCounts();
  } catch (err) {
    console.error("fetchCategoryCounts failed, falling back to legacy:", err);
  }
  const category = counts.find((c) => c.name.toLowerCase() === key);
  if (category) {
    return category.subcategories
      .map((s) => ({ ...s, name: toTitleCase(s.name.trim()) }))
      .filter((s) => Boolean(s.name));
  }

  return legacySidebarCategories(normalized);
}

/**
 * Categorías para Header/Footer (dropdown global).
 * Primario: RPC `get_category_counts` con post-proceso display (MUJER+HOMBRE → Ropa,
 * prefijos "Mujer - X"/"Hombre - X", Tecno sin inferencia regex).
 * Fallback: countCategories(loadProducts()) — mismo comportamiento legacy.
 * Nunca propaga errores de RPC al render SSR.
 */
export async function getHeaderCategories(): Promise<Category[]> {
  let counts: Category[] = [];
  try {
    counts = await fetchCategoryCounts();
  } catch (err) {
    console.error("fetchCategoryCounts failed, falling back to legacy:", err);
  }

  if (counts.length > 0) {
    return transformRpcCategories(counts);
  }

  return countCategories(await loadProducts());
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