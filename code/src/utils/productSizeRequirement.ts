import type Product from "../types/product";
import { normalizeSizes } from "./sizes.ts";

const SIZE_REQUIRED_CATEGORIES = new Set(["ROPA", "MUJER", "HOMBRE"]);
const ACCESSORY_SUBCATEGORY = /\baccesorios?\b/i;

export function productRequiresSizeSelection(
  product: Pick<Product, "id" | "categories" | "colors">,
): boolean {
  const categoryName = String(product?.categories?.name ?? "").trim().toUpperCase();
  const categoryLabels = [
    categoryName,
    ...(product?.categories?.subcategories ?? []).map((subcategory) =>
      String(subcategory?.name ?? ""),
    ),
  ];
  const isAccessory = categoryLabels.some((label) => ACCESSORY_SUBCATEGORY.test(label));
  const configuredSizes = Array.isArray(product?.colors)
    ? product.colors.flatMap((color) => (Array.isArray(color?.sizes) ? color.sizes : []))
    : [];

  if (normalizeSizes(configuredSizes).length > 0) return true;
  if (isAccessory) return false;

  return (
    String(product?.id ?? "").toLowerCase().startsWith("mdt-") ||
    SIZE_REQUIRED_CATEGORIES.has(categoryName)
  );
}
