import {
  normalizeText,
  cleanDescription,
  parsePrice,
  inferSubcategory,
  fetchJson,
  type ProductRow,
} from "./utils";

const ALONDRA_API_BASE = "https://alondra-ecommerce-be.sitios.uy/api";
const ALONDRA_CATALOGO_URL = "https://alondra.com.uy/catalogo";

type RawId = string | { $oid?: string; id?: string } | null | undefined;

interface AlondraCategory {
  _id?: RawId;
  id?: RawId;
  name?: string;
  parent_id?: RawId;
  parentId?: RawId;
}

interface AlondraProduct {
  _id?: RawId;
  id?: RawId;
  name?: string;
  listed?: boolean;
  price?: number | string;
  new_price?: number | string;
  pictures?: string[];
  category_ids?: RawId[];
  custom_fields?: Record<string, unknown>;
}

function extractId(value: RawId): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (typeof value.$oid === "string") return value.$oid;
    if (typeof value.id === "string") return value.id;
  }
  return String(value);
}

function normalizeToken(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findRootCategory(
  categoryId: string,
  categoriesById: Map<string, { id: string; name: string; parentId: string }>,
): { id: string; name: string } | null {
  const visited = new Set<string>();
  let current = categoriesById.get(categoryId);
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    if (!current.parentId) return { id: current.id, name: current.name };
    current = categoriesById.get(current.parentId);
  }
  return null;
}

function isDecorAllowed(categoryName: string, productName: string): boolean {
  const combined = `${categoryName} ${productName}`;
  const normalized = normalizeToken(combined);
  return normalized.includes("cortina") || normalized.includes("alfombra");
}

function mapRootToInternalCategory(rootName: string): string {
  const normalized = normalizeToken(rootName);
  if (normalized.includes("bano")) return "Baño";
  if (normalized.includes("dormitorio")) return "Cama";
  if (normalized.includes("cocina")) return "Hogar";
  return "Hogar";
}

function pickDescription(customFields: Record<string, unknown> | undefined): string {
  if (!customFields || typeof customFields !== "object") return "";
  const candidates = ["description", "descripcion", "detail", "detalle", "info"];
  for (const key of candidates) {
    const value = customFields[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export async function syncAlondra(): Promise<{ products: ProductRow[]; count: number }> {
  console.log("Alondra: iniciando sync...");

  const categoriesRaw: AlondraCategory[] = await fetchJson(`${ALONDRA_API_BASE}/categories`, 20000);

  const categoriesById = new Map<string, { id: string; name: string; parentId: string }>();
  (Array.isArray(categoriesRaw) ? categoriesRaw : []).forEach((category) => {
    const id = extractId(category._id || category.id);
    if (!id) return;
    categoriesById.set(id, {
      id,
      name: String(category.name || "").trim(),
      parentId: extractId(category.parent_id || category.parentId),
    });
  });

  const limit = 100;
  const allProducts: AlondraProduct[] = [];
  for (let page = 1; page <= 100; page++) {
    try {
      const batch: AlondraProduct[] = await fetchJson(
        `${ALONDRA_API_BASE}/products?limit=${limit}&page=${page}`,
        25000,
      );
      if (!Array.isArray(batch) || batch.length === 0) break;
      allProducts.push(...batch);
      if (batch.length < limit) break;
    } catch (e: any) {
      console.warn(`Alondra: error en página ${page}:`, e?.message || e);
      break;
    }
  }

  console.log(`Alondra: ${allProducts.length} productos brutos descargados`);

  const filtered = allProducts.filter((product) => {
    if (product.listed === false) return false;
    const categoryIds = Array.isArray(product.category_ids)
      ? product.category_ids.map((id) => extractId(id)).filter(Boolean)
      : [];
    const productName = String(product.name || "");
    return categoryIds.some((categoryId) => {
      const category = categoriesById.get(categoryId);
      if (!category) return false;
      const root = findRootCategory(category.id, categoriesById);
      const rootName = normalizeToken(root?.name || category.name);
      if (rootName.includes("bano")) return true;
      if (rootName.includes("dormitorio")) return true;
      if (rootName.includes("cocina")) return true;
      if (rootName.includes("decoracion")) return isDecorAllowed(category.name, productName);
      return false;
    });
  });

  console.log(`Alondra: ${filtered.length} productos tras filtro de categorías`);

  const products: ProductRow[] = filtered.map((product) => {
    const id = extractId(product._id || product.id);
    const name = normalizeText(String(product.name || "").trim());
    const categoryIds = Array.isArray(product.category_ids)
      ? product.category_ids.map((value) => extractId(value)).filter(Boolean)
      : [];

    const matchedCategories = categoryIds
      .map((catId) => categoriesById.get(catId))
      .filter((cat): cat is { id: string; name: string; parentId: string } => Boolean(cat));

    const root = matchedCategories.map((cat) => findRootCategory(cat.id, categoriesById)).find(Boolean);
    const categoria = mapRootToInternalCategory(root?.name || matchedCategories[0]?.name || "Hogar");
    const explicitSubcategory = matchedCategories
      .map((cat) => cat.name)
      .find((catName) => Boolean(catName) && catName !== root?.name);
    const subcategorias = explicitSubcategory || inferSubcategory(name, categoria);

    const rawDescription = pickDescription(product.custom_fields);
    const description = cleanDescription(rawDescription);

    const rawBasePrice = product.new_price ?? product.price ?? 0;
    const price = parsePrice(String(rawBasePrice), 1.3);

    const numericBase = Number(product.price ?? 0);
    const numericNew = Number(product.new_price ?? Number.NaN);
    const enOferta =
      Number.isFinite(numericNew) &&
      Number.isFinite(numericBase) &&
      numericNew < numericBase &&
      numericNew > 0;

    const images = Array.isArray(product.pictures) ? product.pictures.filter(Boolean) : [];

    return {
      id: `alo-${id || name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      description,
      price,
      img: images,
      categories: {
        name: categoria,
        count: 0,
        subcategories: subcategorias ? [{ name: subcategorias, count: 0 }] : [],
      },
      payment_link: [{ id: "0", url: ALONDRA_CATALOGO_URL }],
      relacionados: [],
      en_oferta: enOferta,
      source: "scraper",
      active: true,
      auto_update_price: false,
      external_id: id,
    };
  });

  console.log(`Alondra: ${products.length} productos listos para upsert`);
  return { products, count: products.length };
}
